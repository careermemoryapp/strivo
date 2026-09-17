import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { searchMemoriesHybrid } from "@/lib/retrieval";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { isTrialExpired, getUserById } from "@/lib/repo/users";
import { listProjects, withProjectNames } from "@/lib/repo/projects";
import { persistOneMemory, generateMetadataAndEmbedding, fallbackTitle } from "@/lib/memoryCreation";

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const sort = (searchParams.get("sort") as "newest" | "oldest" | null) ?? "newest";
  const category = searchParams.get("category") ?? undefined;
  const competency = searchParams.get("competency") ?? undefined;

  // searchMemoriesHybrid falls straight through to the plain keyword
  // listMemories query (no extra AI call) when `search` is empty -- see its
  // comment in lib/retrieval.ts -- so this is a no-cost no-op for the
  // default browse/filter-only case.
  const memories = await searchMemoriesHybrid(userId, { search, sort, category, competency });
  // Attaches each memory's project NAME so MemoryCard can show a project
  // tag -- see withProjectNames' comment in lib/repo/projects.ts.
  return NextResponse.json({ memories: withProjectNames(userId, memories) });
}

const createSchema = z.object({
  transcript: z.string().trim().min(1, "Memory can't be empty"),
  title: z.string().trim().max(120).optional(),
  source: z.enum(["voice", "text", "file"]).default("text"),
});

// fallbackTitle, persistOneMemory, and generateMetadataAndEmbedding used to
// live here, but lib/storyBatchProcessor.ts needs the exact same per-memory
// logic to process a split document's stories server-side in the
// background (see that file's comment) -- moved to lib/memoryCreation.ts so
// both this route and that processor import the same functions instead of
// one importing from another route file.

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Backstop for the (app)/layout.tsx page-level redirect, which only
  // fires on a fresh navigation -- a tab already open when the trial ended
  // could otherwise keep creating memories via client-side fetch forever.
  if (isTrialExpired(userId)) {
    return NextResponse.json({ error: "Your free trial has ended. Please upgrade to continue." }, { status: 402 });
  }

  // Every memory triggers two OpenAI calls (metadata generation + embedding)
  // — cap per-user spend from a runaway client/script, same reasoning as
  // the transcribe and chat-message endpoints. This endpoint always creates
  // exactly ONE memory per request -- the normal voice/type/single-file
  // save. A document that splits into several stories (see POST
  // /api/memories/split) no longer loops through this endpoint N times
  // either: it goes through POST /api/memories/batch instead, which hands
  // the whole batch to the server to process on its own (see
  // lib/storyBatchProcessor.ts) rather than needing N sequential round
  // trips from the client. Two real, observed failure modes drove that
  // design, both dated 2026-09-17: a single request doing 20-30 sequential
  // AI-call pairs made the reverse proxy time out and hand the client an
  // HTML error page mid-upload, even though the document had, in fact,
  // finished saving server-side by the time that happened -- and the
  // client-driven-loop fix for THAT (N short requests, one per story) had
  // its own failure mode, where the browser/WebView backgrounding for long
  // enough silently stopped the loop partway through with no error and no
  // sign anything was missing (a founder-reported case: 14 stories
  // detected, only 4 actually saved by the time they switched back to the
  // app). Processing the whole batch server-side, independent of whether
  // the client sticks around, is what actually fixes both at once.
  const limited = rateLimitOrResponse(`memory-create:${userId}`, 60, 60 * 60 * 1000);
  if (limited) return limited;

  // Defense-in-depth on top of the per-user limit above: someone could
  // otherwise dodge it by creating several accounts from the same
  // network. Generous enough that a normal shared connection (a family,
  // a small office) never gets near it in real usage.
  const limitedByIp = rateLimitOrResponse(`memory-create-ip:${requestIp(req)}`, 300, 60 * 60 * 1000);
  if (limitedByIp) return limitedByIp;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { transcript, source } = parsed.data;

  // Best-effort: lets praise/reflectiveQuestion address the user by name
  // occasionally (see the nameHint comment in generateMemoryMetadata) --
  // a lookup miss here just means those fields fall back to no name.
  const firstName = getUserById(userId)?.first_name ?? null;
  const existingProjects = listProjects(userId);
  const existingProjectNames = existingProjects.map((p) => p.name);

  const title = parsed.data.title?.trim() || fallbackTitle(transcript);
  const { metadata, embedding } = await generateMetadataAndEmbedding(transcript, title, firstName, existingProjectNames);

  // Resolved here, once, into an actual project id the client can act on
  // directly -- see suggestedExistingProjectName/suggestedNewProjectName on
  // generateMemoryMetadata's return value (lib/ai.ts). Never applied to the
  // memory automatically (project_id stays null until the user explicitly
  // confirms via PATCH /api/memories/[id]/project -- see ProjectAssigner.tsx).
  const projectSuggestion = metadata
    ? {
        existingId: metadata.suggestedExistingProjectName
          ? (existingProjects.find((p) => p.name === metadata.suggestedExistingProjectName)?.id ?? null)
          : null,
        existingName: metadata.suggestedExistingProjectName,
        newName: metadata.suggestedNewProjectName,
      }
    : { existingId: null, existingName: null, newName: null };

  const { memory: final, milestones } = await persistOneMemory({
    userId,
    transcript,
    initialTitle: title,
    userProvidedTitle: parsed.data.title,
    source,
    metadata,
    embedding,
  });

  return NextResponse.json({ memory: final, aiMetadataGenerated: !!metadata, milestones, projectSuggestion });
}
