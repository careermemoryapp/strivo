import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireUserId } from "@/lib/serverAuth";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";

// Node-only: pdf-parse/mammoth/jszip/xlsx all need real filesystem/buffer
// APIs, so this route can't run on the edge runtime.
export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB cap
const MAX_CHARS = 20000; // cap how much extracted text we feed the AI/embeddings

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlEntities(s: string): string {
  return s.replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (m) => ENTITY_MAP[m] ?? m);
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    // Strip pdf-parse's "-- N of M --" page-separator footers.
    return result.text.replace(/^--\s*\d+\s*of\s*\d+\s*--$/gm, "").trim();
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

async function extractPptx(buffer: Buffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      return na - nb;
    });

  const slideTexts: string[] = [];
  for (const path of slideFiles) {
    const xml = await zip.files[path].async("text");
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    const text = runs.join(" ").trim();
    if (text) slideTexts.push(text);
  }
  return slideTexts.map((t, i) => `Slide ${i + 1}: ${t}`).join("\n\n");
}

async function extractSpreadsheet(buffer: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]).trim();
    if (csv) parts.push(wb.SheetNames.length > 1 ? `Sheet: ${sheetName}\n${csv}` : csv);
  }
  return parts.join("\n\n");
}

async function extractText(buffer: Buffer, ext: string): Promise<string> {
  switch (ext) {
    case "pdf":
      return extractPdf(buffer);
    case "docx":
      return extractDocx(buffer);
    case "pptx":
      return extractPptx(buffer);
    case "xlsx":
    case "xls":
    case "csv":
      return extractSpreadsheet(buffer);
    case "txt":
    case "md":
      return buffer.toString("utf-8").trim();
    default:
      throw new UnsupportedFileTypeError(
        "Unsupported file type. Please upload a PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx/.csv), or text file."
      );
  }
}

// Distinguishes our own deliberate, user-safe validation message from
// whatever pdf-parse/mammoth/jszip/xlsx might throw internally (which can
// include library internals, file paths, or other implementation details
// we don't want to hand back to whoever is uploading the file).
class UnsupportedFileTypeError extends Error {}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitOrResponse(`extract:${userId}`, 30, 60 * 60 * 1000);
  if (limited) return limited;

  // Defense-in-depth on top of the per-user limit above.
  const limitedByIp = rateLimitOrResponse(`extract-ip:${requestIp(req)}`, 150, 60 * 60 * 1000);
  if (limitedByIp) return limitedByIp;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large. Please upload something under 2MB." }, { status: 400 });
  }

  const name = file.name || "document";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = (await extractText(buffer, ext)).trim();
    if (!text) {
      return NextResponse.json({ error: "Couldn't find any text in that file." }, { status: 400 });
    }
    const finalText = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text;
    return NextResponse.json({ text: finalText, filename: name });
  } catch (e) {
    if (e instanceof UnsupportedFileTypeError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    // Whatever pdf-parse/mammoth/jszip/xlsx actually threw stays server-side
    // only -- it can include internal file paths or library details that
    // shouldn't go back in an API response. The client gets a safe generic
    // message instead.
    console.error("File extraction failed:", e);
    Sentry.captureException(e);
    return NextResponse.json({ error: "Couldn't read that file. Try a different format." }, { status: 400 });
  }
}
