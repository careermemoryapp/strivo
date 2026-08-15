import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { transcribeAudio } from "@/lib/ai";

// Needs real fetch/File handling talking to OpenAI, not the edge runtime.
export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // OpenAI's own per-file limit for audio transcription

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!audio || !(audio instanceof File)) {
    return NextResponse.json({ error: "No audio provided" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long to transcribe in one go." }, { status: 400 });
  }

  const text = await transcribeAudio(audio);
  if (text === null) {
    return NextResponse.json(
      { error: "Couldn't transcribe that recording. Please try again." },
      { status: 502 }
    );
  }
  return NextResponse.json({ text });
}
