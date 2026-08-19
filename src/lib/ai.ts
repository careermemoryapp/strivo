import OpenAI from "openai";
import type { Memory } from "@/lib/repo/memories";

// Server-only. Never import this file from a "use client" component.
let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!client) client = new OpenAI({ apiKey: key });
  return client;
}

export function aiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

export type MemoryMetadata = {
  title: string;
  summary: string;
  keyPoints: string[];
  category: string;
  tags: string[];
  // English translation/paraphrase of the transcript, used only internally
  // for cross-language retrieval matching (see search_text in
  // lib/repo/memories.ts) — never shown to the user, so it's fine (and
  // expected) that a Hindi memory's user-facing summary above stays in
  // Hindi while this field is always English.
  searchText: string;
};

const CATEGORY_OPTIONS = [
  "Work",
  "Meeting",
  "Career",
  "Idea",
  "Review",
  "Learning",
  "Achievement",
  "Personal",
  "General",
];

// Generates title/summary/category/tags for a raw transcript. Returns null
// on ANY failure — callers must still keep the raw transcript saved either
// way (the user's words matter more than the AI metadata).
export async function generateMemoryMetadata(transcript: string): Promise<MemoryMetadata | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You turn a raw first-person memory transcript (spoken or typed, in any language) into structured metadata. " +
            "Respond ONLY with a JSON object with keys: title (string, <=8 words, concrete and specific, SAME language as the transcript), " +
            "summary (string, 1-2 sentences, third-person-neutral but factual, a brief intro to what happened, SAME language as the transcript), " +
            "keyPoints (array of 3-6 short factual bullet points capturing the specific details, decisions, numbers and outcomes mentioned, SAME language as the transcript), " +
            `category (one of: ${CATEGORY_OPTIONS.join(", ")}), tags (array of 2-5 short lowercase keyword strings), ` +
            "searchText (string, 2-4 sentences, ALWAYS IN ENGLISH regardless of the transcript's language — translate it if the transcript isn't already English; this is for internal search indexing only and is never shown to the user, so prioritize covering the concrete nouns/topics/keywords over elegant phrasing). " +
            "Never invent facts not present in the transcript. Base everything strictly on the transcript text.",
        },
        { role: "user", content: transcript },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.title || !parsed.summary) return null;
    return {
      title: String(parsed.title).slice(0, 120),
      summary: String(parsed.summary).slice(0, 2000),
      keyPoints: Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints.slice(0, 6).map((p: unknown) => String(p).slice(0, 300))
        : [],
      category: CATEGORY_OPTIONS.includes(parsed.category) ? parsed.category : "General",
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map((t: unknown) => String(t).toLowerCase()) : [],
      // Falls back to the summary if the model ever omits searchText —
      // still better than nothing for cross-language matching, even though
      // it won't be a guaranteed-English translation in that fallback case.
      searchText: parsed.searchText ? String(parsed.searchText).slice(0, 2000) : String(parsed.summary).slice(0, 2000),
    };
  } catch (err) {
    console.error("generateMemoryMetadata failed:", err);
    return null;
  }
}

// Translates a chat question to English purely so retrieval (see
// retrieveRelevantMemories in lib/retrieval.ts) can compare it against
// memories' English search_text on equal footing, regardless of what
// language either side was originally written in. Returns the original
// text on failure or if it's already English — retrieval degrades
// gracefully to same-language-only matching in that case rather than
// breaking. Never used for anything user-facing (the actual chat reply
// still responds in whatever language/style is appropriate).
export async function translateToEnglish(text: string): Promise<string> {
  const openai = getClient();
  if (!openai) return text;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Translate the user's message to English. If it's already in English, return it completely unchanged. " +
            "Respond with ONLY the translation — no quotes, no commentary, no explanation.",
        },
        { role: "user", content: text },
      ],
    });
    const translated = completion.choices[0]?.message?.content?.trim();
    return translated || text;
  } catch (err) {
    console.error("translateToEnglish failed:", err);
    return text;
  }
}

// Returns null on failure — callers must fall back to keyword retrieval.
export async function embedText(text: string): Promise<number[] | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const res = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: text.slice(0, 8000),
    });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("embedText failed:", err);
    return null;
  }
}

// Transcribes a recorded voice memo with OpenAI's Whisper model — far more
// accurate than the browser's free built-in speech recognizer, especially
// on mixed-language (e.g. Hindi/English) speech. Returns null on any
// failure so the caller can surface a clear "try again" error rather than
// silently losing the recording.
//
// No `language` parameter is set on purpose — Whisper auto-detects the
// spoken language on its own across ~100 languages, so hard-coding one
// would make transcription worse for everyone who isn't speaking that
// language. What auto-detection genuinely struggles with is short or
// code-switched clips (a Hindi sentence with a few English words mixed
// in, very common in everyday speech) — with too little audio to be
// confident, it can lock onto the wrong language and transcribe the whole
// thing as something else entirely. The `prompt` field below is a
// same-language sample of exactly that kind of speech; Whisper treats it
// as "the kind of audio you're about to hear" and uses it purely as a
// steering hint, not a restriction — English-only or any other-language
// recordings are completely unaffected and still auto-detect normally.
const TRANSCRIBE_PROMPT =
  "यह एक व्यक्तिगत वॉयस नोट है। This is a personal voice memo, sometimes in Hindi, sometimes in English, sometimes both mixed together.";

export async function transcribeAudio(file: File): Promise<string | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      prompt: TRANSCRIBE_PROMPT,
    });
    return (result.text ?? "").trim();
  } catch (err) {
    console.error("transcribeAudio failed:", err);
    return null;
  }
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT_BASE = `You are the user's personal career intelligence assistant, part of a product called Strivo.
Your job is to help the user reason from their REAL professional experiences, which have been captured over time as personal "memories" (transcripts of things they said or wrote about their work).

Rules you must always follow:
- Use the memories supplied below as the primary evidence about the user's experiences.
- Never invent achievements, employers, responsibilities, metrics, or experiences that are not supported by the supplied memories.
- Clearly distinguish between what the user has actually done (grounded in their memories) and general advice or suggestions you are giving.
- If the supplied memories don't contain anything relevant to the question, say so plainly instead of making something up. You can still offer general guidance, but label it as general advice, and you can suggest what kind of experience might be worth capturing as a memory going forward.
- When you reference a specific memory, refer to it by its title so the user knows which one you mean.
- Be concise, warm, and practical — like a sharp career coach, not a generic chatbot.
- IMPORTANT — ask before you search: if the user's request is broad or missing key details you'd need to give a good answer (for example: which role or company they're interviewing for, what role or focus their resume/promotion case should target, what kind of leadership example they're after, what period their performance review covers, or what specifically they want advice on), do NOT immediately dive into their memories or give a full answer. Instead, ask one short, specific clarifying question first. Only search their memories and give a substantive answer once you understand exactly what they need. Skip the clarifying question only if the user has already given you enough specifics.`;

export function buildSystemPrompt(memories: Memory[]): string {
  if (memories.length === 0) {
    return `${SYSTEM_PROMPT_BASE}\n\nNo relevant memories were found for this question. Tell the user you couldn't find a relevant personal experience for this, then offer general guidance and suggest what they might capture as a memory in the future.`;
  }
  const context = memories
    .map((m, i) => {
      const tags = safeParseTags(m.tags);
      return `Memory ${i + 1}: "${m.title}"\nCategory: ${m.category ?? "General"}${tags.length ? ` | Tags: ${tags.join(", ")}` : ""}\nDate: ${m.created_at.slice(0, 10)}\nSummary: ${m.summary ?? "(no summary)"}\nFull transcript: ${m.transcript}`;
    })
    .join("\n\n---\n\n");
  return `${SYSTEM_PROMPT_BASE}\n\nHere are the user's relevant memories for this conversation:\n\n${context}`;
}

function safeParseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function chatCompletion(
  systemPrompt: string,
  history: ChatMessage[]
): Promise<{ reply: string } | { error: string }> {
  const openai = getClient();
  if (!openai) {
    return { error: "AI is not configured on the server (missing OPENAI_API_KEY)." };
  }
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.6,
      messages: [{ role: "system", content: systemPrompt }, ...history],
    });
    const reply = completion.choices[0]?.message?.content;
    if (!reply) return { error: "The AI returned an empty response." };
    return { reply };
  } catch (err) {
    console.error("chatCompletion failed:", err);
    return { error: "The AI request failed. Please try again." };
  }
}
