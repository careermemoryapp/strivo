import { getDb, newId, nowIso } from "@/lib/db";

export type Memory = {
  id: string;
  user_id: string;
  title: string;
  transcript: string;
  summary: string | null;
  category: string | null;
  tags: string | null; // JSON string array
  embedding: string | null; // JSON number array
  // English translation/paraphrase used only for cross-language matching —
  // see the migration comment in lib/db.ts. Never rendered in the UI.
  search_text: string | null;
  // JSON string array of behavioral-interview competencies (Leadership,
  // Problem-Solving, etc.) this memory was identified as demonstrating —
  // see COMPETENCY_OPTIONS in lib/ai.ts and the migration comment in
  // lib/db.ts.
  competencies: string | null;
  // Short, specific, warm compliment generated alongside competencies (see
  // COMPETENCY_OPTIONS/generateMemoryMetadata in lib/ai.ts) -- always null
  // when competencies is empty. Surfaced as a one-time popup on the Record
  // success screen.
  praise: string | null;
  // Ready-to-use resume bullet line (always English) generated alongside
  // praise -- see COMPETENCY_OPTIONS/generateMemoryMetadata in lib/ai.ts.
  // Always null when competencies is empty.
  resume_line: string | null;
  // 0/1 flag -- whether this memory states a concrete quantifiable metric
  // (see hasMetric in generateMemoryMetadata, lib/ai.ts). Powers the "first
  // story backed by a real number" milestone.
  has_metric: number;
  // See reflectiveQuestion in generateMemoryMetadata (lib/ai.ts) and
  // /api/memories/[id]/reflect. reflective_question is null when the AI
  // judged the memory too thin to follow up on; reflective_answer is null
  // until the user answers (or if they skip it).
  reflective_question: string | null;
  reflective_answer: string | null;
  // See selfMinimized/selfMinimizedReason in generateMemoryMetadata
  // (lib/ai.ts) and the migration comment in lib/db.ts -- 0/1 flag for
  // whether this memory's own words undersell a real accomplishment, plus a
  // short internal note on the specific gap when it does. Powers the
  // unprompted "someone's actually proud of you" push (see
  // generateUnderplayedWinCallout, lib/ai.ts, and listSelfMinimizedCandidates
  // below). self_minimized_reason is always null when self_minimized is 0.
  self_minimized: number;
  self_minimized_reason: string | null;
  metadata_status: "pending" | "ready" | "failed";
  source: "voice" | "text" | "file";
  key_points: string | null; // JSON string array
  summary_feedback: "yes" | "no" | null;
  created_at: string;
  updated_at: string;
};

export function createMemory(input: {
  userId: string;
  title: string;
  transcript: string;
  source: "voice" | "text" | "file";
}): Memory {
  const db = getDb();
  const id = newId("mem");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO memories (id, user_id, title, transcript, summary, category, tags, embedding, metadata_status, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, 'pending', ?, ?, ?)`
  ).run(id, input.userId, input.title, input.transcript, input.source, ts, ts);
  return getMemoryById(input.userId, id)!;
}

// IMPORTANT: every read is scoped by user_id. This is the enforcement point
// for per-user data isolation — a memory can never be fetched by a user who
// doesn't own it, even if they know/guess its id.
export function getMemoryById(userId: string, id: string): Memory | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM memories WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Memory | undefined;
}

// Batched lookup for a known set of ids, scoped by user_id same as
// getMemoryById -- used wherever we'd otherwise call getMemoryById once per
// id in a loop (N+1 pattern). Order is not guaranteed by the query, so
// callers that care about preserving the original id order re-sort the
// result themselves (see /api/chats/[id]/memories).
export function getMemoriesByIds(userId: string, ids: string[]): Memory[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  return db
    .prepare(`SELECT * FROM memories WHERE user_id = ? AND id IN (${placeholders})`)
    .all(userId, ...ids) as Memory[];
}

// Deliberately unbounded (no LIMIT): this supports both "newest" and
// "oldest" sort, and a blind LIMIT would silently hide real entries
// depending on which direction the user is browsing (e.g. LIMIT 500 on an
// "oldest first" sort would hide everything after their 500th memory,
// which is the opposite of what that view is for). Fine at today's scale
// -- if a single user's memory count ever climbs into the hundreds+,
// the right fix is real "load more" pagination in the UI, not a silent
// cap here.
export function listMemories(
  userId: string,
  opts: { search?: string; sort?: "newest" | "oldest"; category?: string; competency?: string } = {}
): Memory[] {
  const db = getDb();
  const order = opts.sort === "oldest" ? "ASC" : "DESC";
  const clauses = ["user_id = ?"];
  const params: unknown[] = [userId];

  if (opts.search && opts.search.trim()) {
    // search_text (English gloss, see the migration comment in lib/db.ts)
    // and competencies are included here for the same reason keywordScore in
    // lib/retrieval.ts includes them: without search_text, a memory recorded
    // in Hindi is invisible to an English search term even when it's exactly
    // what the user is looking for, and without competencies, searching
    // "leadership" wouldn't find a memory that demonstrates leadership but
    // never uses the word. See also searchMemoriesHybrid in lib/retrieval.ts,
    // which layers semantic matching on top of this keyword pass for the
    // cases even this broadened LIKE search still misses (different
    // phrasing, no literal word overlap at all).
    clauses.push(
      "(LOWER(title) LIKE ? OR LOWER(COALESCE(summary,'')) LIKE ? OR LOWER(transcript) LIKE ? OR LOWER(COALESCE(tags,'')) LIKE ? OR LOWER(COALESCE(search_text,'')) LIKE ? OR LOWER(COALESCE(competencies,'')) LIKE ?)"
    );
    const q = `%${opts.search.trim().toLowerCase()}%`;
    params.push(q, q, q, q, q, q);
  }
  if (opts.category && opts.category !== "All") {
    clauses.push("category = ?");
    params.push(opts.category);
  }
  if (opts.competency && opts.competency !== "All") {
    // competencies is a JSON string array (e.g. '["Leadership","Ownership &
    // Initiative"]') -- quoting the match target (`"Leadership"` rather than
    // just `Leadership`) matches a real array element rather than any
    // substring, which matters since some competency names in
    // COMPETENCY_OPTIONS (lib/ai.ts) share words with others (e.g.
    // "Leadership" vs "Mentorship & Coaching" wouldn't collide, but this
    // stays correct even if a future addition does).
    clauses.push("LOWER(COALESCE(competencies,'')) LIKE ?");
    params.push(`%"${opts.competency.toLowerCase()}"%`);
  }

  return db
    .prepare(`SELECT * FROM memories WHERE ${clauses.join(" AND ")} ORDER BY created_at ${order}`)
    .all(...(params as [])) as Memory[];
}

// Half-open range [startUtcIso, endUtcIso) — used by the "what did I do
// today/yesterday/this week" retrieval path in lib/retrieval.ts, which needs
// a literal date-window lookup rather than semantic/keyword content
// matching (see the comment there for why). Bounds are computed by the
// caller so this stays a dumb SQL range query.
export function listMemoriesByDateRange(userId: string, startUtcIso: string, endUtcIso: string): Memory[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM memories WHERE user_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC`
    )
    .all(userId, startUtcIso, endUtcIso) as Memory[];
}

// Cheap count-only version of listMemoriesByDateRange's lower bound -- used
// by the growth narrative eligibility check (see
// shouldGenerateGrowthNarrative in lib/repo/growthNarratives.ts) to see how
// many NEW memories have accumulated since the last narrative, without
// pulling full rows just to count them.
export function countMemoriesSince(userId: string, sinceUtcIso: string): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM memories WHERE user_id = ? AND created_at >= ?`)
    .get(userId, sinceUtcIso) as { c: number };
  return row.c;
}

// Every distinct user who has recorded at least one memory since the given
// UTC instant -- the candidate list for the weekly recap automation (see
// app/api/weekly-recap/run): no point generating/checking a recap for
// someone who recorded nothing this week. Deliberately unscoped by any
// single userId (unlike virtually everything else in this file) since this
// IS the cross-user query the automation job needs -- it's never reachable
// from a normal per-user request path, only from the secret-gated
// automation route.
export function listUserIdsWithMemoriesSince(sinceUtcIso: string): string[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT DISTINCT user_id FROM memories WHERE created_at >= ?`)
    .all(sinceUtcIso) as { user_id: string }[];
  return rows.map((r) => r.user_id);
}

export function listMemoriesWithEmbeddings(userId: string): Memory[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM memories WHERE user_id = ? AND embedding IS NOT NULL`
    )
    .all(userId) as Memory[];
}

export function updateMemoryMetadata(
  userId: string,
  id: string,
  input: Partial<
    Pick<
      Memory,
      | "title"
      | "transcript"
      | "summary"
      | "category"
      | "tags"
      | "embedding"
      | "search_text"
      | "competencies"
      | "praise"
      | "resume_line"
      | "has_metric"
      | "reflective_question"
      | "reflective_answer"
      | "self_minimized"
      | "self_minimized_reason"
      | "metadata_status"
      | "key_points"
      | "summary_feedback"
    >
  >
): Memory | undefined {
  const db = getDb();
  const current = getMemoryById(userId, id);
  if (!current) return undefined;
  const title = input.title ?? current.title;
  const transcript = input.transcript ?? current.transcript;
  const summary = input.summary ?? current.summary;
  const category = input.category ?? current.category;
  const tags = input.tags ?? current.tags;
  const embedding = input.embedding ?? current.embedding;
  const search_text = input.search_text ?? current.search_text;
  const competencies = input.competencies ?? current.competencies;
  const praise = input.praise ?? current.praise;
  const resume_line = input.resume_line ?? current.resume_line;
  const has_metric = input.has_metric ?? current.has_metric;
  const reflective_question = input.reflective_question ?? current.reflective_question;
  const reflective_answer = input.reflective_answer ?? current.reflective_answer;
  const self_minimized = input.self_minimized ?? current.self_minimized;
  const self_minimized_reason = input.self_minimized_reason ?? current.self_minimized_reason;
  const metadata_status = input.metadata_status ?? current.metadata_status;
  const key_points = input.key_points ?? current.key_points;
  const summary_feedback = input.summary_feedback ?? current.summary_feedback;
  db.prepare(
    `UPDATE memories SET title = ?, transcript = ?, summary = ?, category = ?, tags = ?, embedding = ?, search_text = ?, competencies = ?, praise = ?, resume_line = ?, has_metric = ?, reflective_question = ?, reflective_answer = ?, self_minimized = ?, self_minimized_reason = ?, metadata_status = ?, key_points = ?, summary_feedback = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    title,
    transcript,
    summary,
    category,
    tags,
    embedding,
    search_text,
    competencies,
    praise,
    resume_line,
    has_metric,
    reflective_question,
    reflective_answer,
    self_minimized,
    self_minimized_reason,
    metadata_status,
    key_points,
    summary_feedback,
    nowIso(),
    id,
    userId
  );
  return getMemoryById(userId, id);
}

export function deleteMemory(userId: string, id: string) {
  const db = getDb();
  db.prepare(`DELETE FROM memories WHERE id = ? AND user_id = ?`).run(id, userId);
}

export function countMemories(userId: string): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM memories WHERE user_id = ?`)
    .get(userId) as { c: number };
  return row.c;
}

// The user's very first N memories -- the "earlier" side of the growth
// narrative comparison (see app/api/growth-narrative/run and
// generateGrowthNarrative in lib/ai.ts). Bounded by `limit` on purpose,
// unlike listMemories -- this is specifically "the earliest handful," not
// "everything before some date."
export function listOldestMemories(userId: string, limit: number): Memory[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`)
    .all(userId, limit) as Memory[];
}

// The user's most recent N memories -- the "recent" side of the growth
// narrative comparison. See listOldestMemories above for why this is
// bounded rather than reusing listMemories.
export function listNewestMemories(userId: string, limit: number): Memory[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as Memory[];
}

// Tallies how many memories demonstrate each competency (see
// COMPETENCY_OPTIONS in lib/ai.ts) -- backs the "Story Bank" coverage view
// (app/(app)/memories/coverage), which shows the user which behavioral
// interview competencies they have strong stories for and which are thin,
// so gaps read as something to go fill rather than a hidden blind spot.
// `competencies` is stored as a JSON string array per memory rather than a
// normalized join table (same as `tags`), so this tallies in JS rather than
// SQL -- fine at the per-user memory counts this app deals with. Rows with
// malformed JSON are skipped rather than throwing, same defensiveness as
// the client-side safeJsonParse helper.
export function countMemoriesByCompetency(userId: string): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare(`SELECT competencies FROM memories WHERE user_id = ? AND competencies IS NOT NULL`)
    .all(userId) as { competencies: string }[];
  const counts: Record<string, number> = {};
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.competencies);
      if (!Array.isArray(parsed)) continue;
      for (const c of parsed) {
        if (typeof c === "string") counts[c] = (counts[c] ?? 0) + 1;
      }
    } catch {
      // Malformed JSON on an old/corrupted row -- skip it rather than
      // failing the whole coverage view over one bad row.
    }
  }
  return counts;
}

// Same idea as countMemoriesByCompetency above, but keeps the actual
// id/title of every memory under each competency instead of just a count --
// backs the clickable story chips on the Story Bank coverage view (see
// CoverageClient.tsx), which link straight to the memory that earned each
// competency rather than just showing a bare number. Newest-first per
// competency, same convention as listMemories' default sort. The client
// caps how many chips it actually renders per competency; this returns
// everything so that cap can change without another round trip.
export function listMemoriesGroupedByCompetency(userId: string): Record<string, { id: string; title: string }[]> {
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, title, competencies FROM memories WHERE user_id = ? AND competencies IS NOT NULL ORDER BY created_at DESC`)
    .all(userId) as { id: string; title: string; competencies: string }[];
  const grouped: Record<string, { id: string; title: string }[]> = {};
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.competencies);
      if (!Array.isArray(parsed)) continue;
      for (const c of parsed) {
        if (typeof c !== "string") continue;
        (grouped[c] ??= []).push({ id: row.id, title: row.title });
      }
    } catch {
      // Malformed JSON on an old/corrupted row -- skip it, same as
      // countMemoriesByCompetency above.
    }
  }
  return grouped;
}

// How many of the user's memories already have a hard number in them (see
// has_metric above) -- used purely to detect the one-time "first story
// backed by a real number" milestone (see app/api/memories/route.ts): if
// this is 0 right before a new memory with hasMetric=true is saved, that
// new one is the first.
export function countMemoriesWithMetric(userId: string): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM memories WHERE user_id = ? AND has_metric = 1`)
    .get(userId) as { c: number };
  return row.c;
}

// Candidate pool for the "someone's actually proud of you" push (see
// generateUnderplayedWinCallout in lib/ai.ts and app/api/underplayed-win/run)
// -- memories flagged self_minimized=1 that have never been used for a
// callout before (LEFT JOIN ... IS NULL against underplayed_win_callouts,
// same "never reuse" idea as pending_checkins' status field, just modeled as
// existence-of-a-row instead of a status column since a memory can only ever
// be surfaced once). Bounded by `limit` and newest-first, same reasoning as
// listOldestMemories/listNewestMemories above -- recent underplayed moments
// read as more timely ("last week you...") than something from months ago,
// and a small batch keeps the AI call focused.
export function listSelfMinimizedCandidates(userId: string, limit: number): Memory[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT m.* FROM memories m
       LEFT JOIN underplayed_win_callouts c ON c.memory_id = m.id
       WHERE m.user_id = ? AND m.self_minimized = 1 AND c.id IS NULL
       ORDER BY m.created_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as Memory[];
}

// Distinct creation dates (YYYY-MM-DD, local to server) for streak calc.
export function listMemoryDates(userId: string): string[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT DISTINCT substr(created_at, 1, 10) as d FROM memories WHERE user_id = ? ORDER BY d DESC`)
    .all(userId) as { d: string }[];
  return rows.map((r) => r.d);
}
