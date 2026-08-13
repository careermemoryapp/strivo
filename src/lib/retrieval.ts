import { listMemories, listMemoriesWithEmbeddings, type Memory } from "@/lib/repo/memories";
import { embedText } from "@/lib/ai";

// ---------------------------------------------------------------------------
// Personal memory retrieval layer.
//
// CRITICAL SECURITY INVARIANT: every function here takes an explicit userId
// and every underlying repo call filters "WHERE user_id = ?" at the SQL
// level (see lib/repo/memories.ts). A user's query can therefore never
// surface another user's memories, regardless of what the query text is.
//
// Retrieval strategy:
//  1. Preferred: semantic retrieval via OpenAI embeddings + cosine similarity,
//     scoped to this user's memories only.
//  2. Fallback (embeddings unavailable/failed, or no memories have
//     embeddings yet): keyword overlap scoring over this user's memories.
// This keeps the system working end-to-end even without an AI key, and the
// vector path can be swapped for a real vector DB later without changing
// callers.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been","being",
  "to","of","in","on","at","for","with","about","as","by","from","that","this",
  "it","i","my","me","we","you","your","they","he","she","them","his","her",
  "do","did","does","have","has","had","not","can","could","would","should",
  "will","what","when","where","how","why","which","who","help","please",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function keywordScore(queryTokens: string[], memory: Memory): number {
  const haystack = `${memory.title} ${memory.summary ?? ""} ${memory.transcript} ${memory.tags ?? ""}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 1;
  }
  return score;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type RetrievalResult = {
  memories: Memory[];
  method: "semantic" | "keyword" | "none";
};

export async function retrieveRelevantMemories(
  userId: string,
  query: string,
  topK = 5
): Promise<RetrievalResult> {
  // 1. Try semantic retrieval.
  const withEmbeddings = listMemoriesWithEmbeddings(userId);
  const queryTokensForGate = tokenize(query);
  if (withEmbeddings.length > 0) {
    const queryEmbedding = await embedText(query);
    if (queryEmbedding) {
      const scored = withEmbeddings
        .map((m) => {
          let score = 0;
          try {
            const emb = JSON.parse(m.embedding as string) as number[];
            score = cosineSimilarity(queryEmbedding, emb);
          } catch {
            score = 0;
          }
          return { memory: m, score, keywordHits: keywordScore(queryTokensForGate, m) };
        })
        // text-embedding-3-small cosine similarities for genuinely unrelated
        // text still commonly land around 0.1-0.2 (embeddings cluster in a
        // fairly narrow cone), so a 0.15 cutoff let almost everything
        // through — e.g. asking about a resume would also pull in unrelated
        // memories. 0.3 is a meaningfully higher bar for "actually about
        // this," but short/repetitive/low-quality transcripts (e.g. a
        // garbled voice transcription) can still land an artificially high
        // score purely from embedding drift, with zero real topical overlap.
        // So: a merely-decent semantic score (0.3-0.45) also needs at least
        // one literal keyword in common with the query to count — only a
        // strong semantic match (>0.45) is trusted on its own. If nothing
        // clears this bar, we fall through to keyword search below rather
        // than showing weakly- or spuriously-related memories.
        .filter((s) => s.score > 0.45 || (s.score > 0.3 && s.keywordHits > 0))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      if (scored.length > 0) {
        return { memories: scored.map((s) => s.memory), method: "semantic" };
      }
    }
  }

  // 2. Fallback: keyword overlap across all of the user's memories.
  const all = listMemories(userId);
  const queryTokens = tokenize(query);
  if (all.length === 0 || queryTokens.length === 0) {
    return { memories: [], method: "none" };
  }
  const scored = all
    .map((m) => ({ memory: m, score: keywordScore(queryTokens, m) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return { memories: scored.map((s) => s.memory), method: scored.length ? "keyword" : "none" };
}
