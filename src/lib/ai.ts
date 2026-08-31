import OpenAI from "openai";
import * as Sentry from "@sentry/nextjs";
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
  // Which behavioral-interview competencies this story actually
  // demonstrates (see COMPETENCY_OPTIONS below) -- e.g. Leadership,
  // Problem-Solving. This is the "you might not realize this is a great
  // example" layer: a user dictating a casual story about helping a
  // teammate has no reason to know that's a strong Leadership example
  // unless something tells them. 0-3 entries, empty when nothing genuinely
  // fits -- not every memory should get tagged.
  competencies: string[];
  // A short (1-2 sentence), specific, warm compliment grounded in an actual
  // detail from the transcript -- the "human angle" layer on top of
  // competencies. Only generated when competencies is non-empty (praising
  // something that isn't actually there feels fake and trains people to
  // ignore it). Shown as a one-time popup right after saving (see
  // app/(app)/record/page.tsx) rather than baked into the summary, so it
  // reads as a genuine reaction in the moment rather than permanent UI
  // chrome. Null when competencies is empty.
  praise: string | null;
  // A single polished, resume-ready bullet line built from this memory --
  // action-verb-led, past tense, with any concrete numbers/metrics in the
  // transcript pulled in (e.g. "Reduced month-end close from 2 days to 4
  // hours by leading a billing system migration"). ALWAYS in English
  // regardless of the transcript's language, since resumes in Strivo's
  // target market are conventionally written in English even when the
  // memory itself was dictated in Hindi or mixed language -- unlike
  // searchText, this one IS shown to the user, just not in their own words.
  // Same gate as praise: only generated when competencies is non-empty, so
  // it never fires on a memory with nothing resume-worthy in it.
  resumeLine: string | null;
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

// Standard behavioral-interview competency taxonomy (the kind of thing STAR
// answers and "tell me about a time..." questions are built around).
// Deliberately broad/role-agnostic rather than corporate-leadership-only,
// since Strivo's users span many kinds of roles, not just management.
export const COMPETENCY_OPTIONS = [
  "Leadership",
  "Ownership & Initiative",
  "Problem-Solving",
  "Collaboration & Teamwork",
  "Communication",
  "Conflict Resolution",
  "Mentorship & Coaching",
  "Innovation & Creativity",
  "Adaptability & Resilience",
  "Strategic Thinking",
  "Stakeholder Focus",
  "Results & Impact",
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
            `competencies (array, 0-3 items, ONLY from this exact list: ${COMPETENCY_OPTIONS.join(", ")}). ` +
            "Include a competency ONLY if the transcript genuinely demonstrates it through a specific action the person took or decision they made -- not because the topic is loosely related. " +
            "Most people telling a casual, everyday story have no idea it happens to be a strong example of something like Leadership or Problem-Solving -- your job here is to spot that for them even though they never used that word themselves and may not think of it that way. " +
            "Equally, don't force a fit: an empty array is correct and expected for a large share of memories (e.g. a plain status update or a memory with no clear personal action in it). " +
            "praise (string or null): ONLY when competencies is non-empty, write one short (1-2 sentence) warm, specific compliment to the person, SAME language as the transcript, in second person, that names the concrete thing they actually did (referencing a real detail, decision, or number from the transcript -- not a vague restatement) and briefly notes it could make a strong interview or resume story. Sound like a genuine reaction from a supportive coach who actually read the story, never like a generic template ('Great job!', 'Well done!') -- it should be obvious it was written about THIS story specifically and would sound wrong attached to a different one. When competencies is empty, praise MUST be null. " +
            "resumeLine (string or null): ONLY when competencies is non-empty, write ONE polished resume bullet line for this story, ALWAYS IN ENGLISH regardless of the transcript's language. Standard resume conventions: start with a strong past-tense action verb (Led, Reduced, Built, Launched, Resolved, etc.), be a single line with no trailing period, and if the transcript mentions ANY concrete number, percentage, time saved, or scale (team size, users, revenue, duration), work it in naturally -- if the transcript has no numbers, write a strong qualitative bullet instead rather than inventing a fake metric. Never fabricate a number, outcome, or detail that isn't in the transcript. When competencies is empty, resumeLine MUST be null. " +
            "Never invent facts not present in the transcript. Base everything strictly on the transcript text.",
        },
        { role: "user", content: transcript },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.title || !parsed.summary) return null;
    // Computed once, ahead of the return object, since `praise` below needs
    // to check against the FILTERED list, not the model's raw (possibly
    // hallucinated) competencies array.
    const filteredCompetencies: string[] = Array.isArray(parsed.competencies)
      ? parsed.competencies.filter((c: unknown) => COMPETENCY_OPTIONS.includes(String(c))).slice(0, 3)
      : [];
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
      // Filter against the fixed list rather than trusting the model's
      // output verbatim -- keeps this a closed taxonomy (needed so the UI
      // badge styling and retrieval keyword-matching in lib/retrieval.ts
      // can rely on exact values) even if the model paraphrases or
      // hallucinates an item outside the list.
      competencies: filteredCompetencies,
      // Only trust praise text if a competency actually survived the
      // filter above -- enforces the "never praise something that isn't
      // there" rule at the code level too, not just via the prompt.
      praise: filteredCompetencies.length > 0 && typeof parsed.praise === "string" ? parsed.praise.slice(0, 400) : null,
      resumeLine:
        filteredCompetencies.length > 0 && typeof parsed.resumeLine === "string"
          ? parsed.resumeLine.trim().replace(/\.$/, "").slice(0, 200)
          : null,
    };
  } catch (err) {
    console.error("generateMemoryMetadata failed:", err);
    Sentry.captureException(err);
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
    Sentry.captureException(err);
    return text;
  }
}

// Short (3-5 word) chat title generated from the first message in a chat —
// the same idea as ChatGPT/Claude auto-titling a new conversation. Without
// this, every chat started from the same quick action ("Interview
// Preparation", "General Chat", ...) keeps that literal template name as
// its title forever, so the Chats list becomes a wall of identical labels
// and the only way to tell conversations apart is opening each one. Called
// once, for the first message only (see chatService.ts) — the chat keeps
// this title from then on rather than re-titling on every message, same as
// ChatGPT. The starting category (Interview/Resume/etc.) is tracked
// separately on chat.category and unaffected by this — it's shown as its
// own small badge in the UI instead of being baked into the title text.
// Returns null on any failure so the caller just keeps the template title
// rather than erroring the message send over a cosmetic feature.
export async function generateChatTitle(firstMessage: string): Promise<string | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Generate a short chat title, 3-5 words, summarizing what this conversation is actually about, in the SAME language as the message. " +
            "Be specific to the real content -- never output a generic label like 'General Chat', 'New Chat', or 'Interview Preparation'. " +
            "No quotes, no trailing punctuation. Respond with ONLY the title, nothing else.",
        },
        { role: "user", content: firstMessage },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    // Strip wrapping quotes the model sometimes adds despite the instruction.
    return raw.replace(/^["'“”]+|["'“”]+$/g, "").slice(0, 80);
  } catch (err) {
    console.error("generateChatTitle failed:", err);
    Sentry.captureException(err);
    return null;
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
    Sentry.captureException(err);
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
    Sentry.captureException(err);
    return null;
  }
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT_BASE = `You are the user's personal career intelligence assistant, part of a product called Strivo.
Your job is to help the user reason from their REAL professional experiences, which have been captured over time as personal "memories" (transcripts of things they said or wrote about their work).

Rules you must always follow:
- Use the memories supplied below as the primary evidence about the user's experiences.
- Never invent achievements, employers, responsibilities, metrics, or experiences that are not supported by the supplied memories.
- Each memory is a separate, distinct event with its own date. NEVER blend or combine details from two different memories into one answer, even if they're topically similar (e.g. two separate presentations, two separate meetings) — mixing facts across memories is a serious error. If the user's question implies a specific one (e.g. "today," "that presentation," "the one I just recorded"), match it to the single memory whose date/content actually fits, and answer from that memory alone. If you're not sure which memory the user means, ask instead of guessing.
- Clearly distinguish between what the user has actually done (grounded in their memories) and general advice or suggestions you are giving.
- Classify each question as either PERSONAL (asking about the user's own experience, achievements, or what they specifically should say — e.g. an interview answer, resume content, performance review prep, "what did I do when...") or GENERIC (general knowledge not tied to the user's own history — e.g. industry trends, how a certain interview format works, general definitions). Use your best judgment; this decides how you're allowed to answer.
  - PERSONAL questions: answer ONLY from the supplied memories. If nothing supplied is actually relevant, say so plainly — something like "I don't have a relevant memory for that." Do NOT paper over the gap with generic advice dressed up as if it were personal, and do NOT fabricate. You can offer to help them think it through from scratch, or suggest capturing it as a memory going forward, but be explicit that it isn't coming from their recorded history.
  - GENERIC questions: answer normally using your general knowledge. These don't need a memory match, so don't hedge with "no relevant memory" language or apologize — just give a helpful, direct answer.
- When a PERSONAL answer is for interview prep (the user needs to actually say this out loud to an interviewer), structure it using the STAR framework — Situation, Task, Action, Result — with each part briefly labeled, grounded strictly in the matched memory's real details. Use a different structure only when STAR genuinely doesn't fit the question (e.g. a broad "tell me about yourself" reads better as a short narrative than four labeled parts).
- When you reference a specific memory, refer to it by its title so the user knows which one you mean.
- Be concise, warm, and practical — like a sharp career coach, not a generic chatbot.
- IMPORTANT — ask before you search: if the user's request is broad or missing key details you'd need to give a good answer (for example: which role or company they're interviewing for, what role or focus their resume/promotion case should target, what kind of leadership example they're after, what period their performance review covers, or what specifically they want advice on), do NOT immediately dive into their memories or give a full answer. Instead, ask one short, specific clarifying question first. Only search their memories and give a substantive answer once you understand exactly what they need. Skip the clarifying question only if the user has already given you enough specifics.
- SAFETY — this overrides every rule above: Strivo is a career-coaching tool, not a crisis or mental-health service, and you are not equipped to help with a safety emergency. If a message expresses intent or a plan to harm themselves or someone else, describes a crisis in progress, or otherwise signals they may be in danger right now, do NOT continue with career coaching, STAR answers, or memory retrieval. Respond with brief, warm concern, and clearly encourage them to reach out to a crisis line or emergency services in their country right now (for example, in the US/Canada call or text 988; in the UK call 116 123 (Samaritans); in India call 91-9152987821 (iCall) or 112; elsewhere, encourage them to search "crisis helpline" plus their country, or contact local emergency services). Do not attempt to counsel them yourself, do not diagnose, and do not treat this as a one-off aside before returning to the original question -- stop there. This takes priority over answering the user's actual question.`;

// Strivo's target market is India (matches the IST convention used for
// "today"/"yesterday" resolution in lib/retrieval.ts).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Today's date in IST, spelled out for the model (e.g. "Saturday, August
// 30, 2026"). Without this the model has NO reference point for what day it
// actually is -- it only sees each memory's raw ISO date. That's what was
// causing a real bug: retrieval could correctly narrow to "today"'s memory
// (see detectDateRange), the memory would be sitting right there in the
// prompt, and the model would *still* say "I don't have a relevant memory
// for that" -- because it had no way to confirm that memory's date was
// actually today, so it hedged rather than assert something it couldn't
// verify. Giving it today's date directly closes that gap.
function todayIstLabel(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC", // ist's fields already represent IST wall-clock time (shifted above); UTC here means "don't shift again"
  });
}

export function buildSystemPrompt(memories: Memory[], now: Date = new Date()): string {
  const dateContext = `\n\nToday's date is ${todayIstLabel(now)} (India Standard Time). Use this to correctly judge date-relative questions ("today," "yesterday," "this week," a specific date, etc.) against each memory's Date field below. If a memory's date genuinely falls in the period the user is asking about, treat it as relevant with confidence -- do not hedge or claim "no relevant memory" out of uncertainty about what day it is; you now know.`;
  if (memories.length === 0) {
    return `${SYSTEM_PROMPT_BASE}${dateContext}\n\nNo memories were retrieved for this question. If the question is PERSONAL (about the user's own experience), tell them plainly you don't have a relevant memory for that -- do not substitute generic advice as if it were personal, and do not fabricate; you can suggest what they might capture as a memory going forward. If the question is GENERIC (general knowledge, not about their own past), just answer it normally using your general knowledge -- no need to mention memories at all.`;
  }
  const competencyContext = `\n\nEach memory below may list Competencies -- behavioral-interview qualities (Leadership, Problem-Solving, etc.) that memory was independently identified as genuinely demonstrating, generated when it was recorded (see generateMemoryMetadata). The user themselves may not realize a memory qualifies -- they might have just described a normal day, not framed it as a "leadership story." When asked for an example of a specific competency (e.g. "give me a leadership example," "tell me about a time you solved a problem"), actively use this field to find the match rather than only pattern-matching the user's own wording against the transcript, and you can point out to them that this is a strong example of that competency even if they didn't call it that themselves.`;
  const context = memories
    .map((m, i) => {
      const tags = safeParseStringArray(m.tags);
      const competencies = safeParseStringArray(m.competencies);
      return `Memory ${i + 1}: "${m.title}"\nCategory: ${m.category ?? "General"}${tags.length ? ` | Tags: ${tags.join(", ")}` : ""}${competencies.length ? `\nCompetencies: ${competencies.join(", ")}` : ""}\nDate: ${m.created_at.slice(0, 10)}\nSummary: ${m.summary ?? "(no summary)"}\nFull transcript: ${m.transcript}`;
    })
    .join("\n\n---\n\n");
  return `${SYSTEM_PROMPT_BASE}${dateContext}${competencyContext}\n\nHere are the user's relevant memories for this conversation:\n\n${context}`;
}

function safeParseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
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
    Sentry.captureException(err);
    return { error: "The AI request failed. Please try again." };
  }
}
