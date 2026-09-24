import OpenAI from "openai";
import * as Sentry from "@sentry/nextjs";
import type { Memory } from "@/lib/repo/memories";
import type { RecalledMessage } from "@/lib/retrieval";
import {
  MEMORY_CATEGORIES_LIST,
  MEMORY_COMPETENCIES_LIST,
  OPPORTUNITY_INDUSTRIES_LIST,
  OPPORTUNITY_SENIORITY_LIST,
} from "@/lib/config";

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
  // Whether the transcript contains at least one concrete, quantifiable
  // metric reflecting real impact or scale -- a percentage, an amount of
  // money, a count of people/users, time saved, a before/after number.
  // Independent of competencies (a memory can have a hard number without
  // being a formal "competency" story, or vice versa) -- used purely to
  // power the "first story backed by a real number" one-time milestone (see
  // has_metric in lib/repo/memories.ts and the milestone detection in
  // app/api/memories/route.ts).
  hasMetric: boolean;
  // One short, genuinely curious follow-up question about this specific
  // memory -- the "someone is actually listening" layer. Shown as an
  // optional, skippable prompt on the Record success screen; if the user
  // answers, the answer gets folded into the transcript itself (see
  // /api/memories/[id]/reflect), making the memory genuinely richer rather
  // than just decorated. Independent of competencies -- even a mundane
  // memory can have something worth asking about. Null when the memory is
  // too thin/trivial to meaningfully follow up on.
  reflectiveQuestion: string | null;
  // "Proactive check-ins" -- the layer that lets Strivo follow up on its
  // own, unprompted, days or weeks later ("How did the interview go?"),
  // which is specifically the thing neither ChatGPT nor Claude can do since
  // they forget the moment a chat ends. Only set when the transcript names
  // a SPECIFIC upcoming event with an identifiable timeframe that hasn't
  // happened yet (an interview, a hard conversation, a deadline, a
  // decision). targetDate is the model's best estimate (YYYY-MM-DD, IST) of
  // when that event happens or resolves -- validated and re-checked in code
  // (see the caller in generateMemoryMetadata below) before ever being
  // trusted, since date arithmetic is exactly the kind of thing a language
  // model can get subtly wrong. null for the large majority of memories,
  // which don't mention anything upcoming at all.
  futureCheckin: { question: string; targetDate: string } | null;
  // Flags the narrower "you did something genuinely big and described it
  // like it was nothing" case -- the layer behind the unprompted
  // "someone's actually proud of you" push (see generateUnderplayedWinCallout
  // below and app/api/underplayed-win/run). Distinct from competencies/praise
  // above: a memory can have real competencies and still be reported with
  // ordinary pride or plain neutral language, which is NOT what this flags.
  // True only when the transcript's own words visibly undersell a real
  // accomplishment ("just", "nothing much", "anyone would have done that")
  // sitting on top of genuine ownership, impact, or difficulty overcome.
  // Rare by design -- most memories, even strong ones, are false here.
  // selfMinimizedReason is a short internal note (never shown to the user
  // directly) naming the specific gap, used later to help the callout-writer
  // stay grounded in the actual transcript rather than re-reading it cold.
  selfMinimized: boolean;
  selfMinimizedReason: string | null;
  // Recurring proper nouns worth remembering across memories -- a manager's
  // or teammate's name, a team, a recurring project/product. Distinct from
  // tags (generic lowercase keywords): this is specifically name-like
  // things, aggregated later by listRecurringEntities() (lib/repo/memories.ts)
  // into a lightweight personal glossary so the chat can say "how did the
  // rollout with Priya go?" instead of generic phrasing -- the "someone who
  // actually knows the people/projects in your life" layer, on top of
  // warmthContext/nameContext below. 0-5 items, empty when the transcript
  // has no genuinely name-like recurring thing in it (a one-off mention of
  // "my friend" with no name isn't an entity; "Priya", "the Atlas team",
  // "Project Falcon" are).
  entities: string[];
  // Project-association suggestion for the real, permanent "project"
  // concept in lib/repo/projects.ts -- deliberately separate from the
  // free-text `entities` above (which stays a lightweight glossary for
  // chat, unrelated to this). Never both set: EITHER this transcript
  // clearly matches one of the user's EXISTING projects (given as
  // `existingProjectNames` below), in which case
  // suggestedExistingProjectName holds that exact name, OR it clearly
  // centers on a distinct project worth tracking that ISN'T in that list,
  // in which case suggestedNewProjectName holds a short name for it -- OR,
  // by far the most common case, neither, and both are null. This is a
  // SUGGESTION ONLY: see ProjectAssigner.tsx and the migration comment on
  // memories.project_id in lib/db.ts for why nothing here ever assigns a
  // project on its own -- same "AI proposes, human confirms" principle as
  // the transcription-cleanup pass in transcribeAudio below.
  suggestedExistingProjectName: string | null;
  suggestedNewProjectName: string | null;
  // Whether this memory describes interacting with a SENIOR/executive-level
  // stakeholder -- a VP, director, C-suite exec, a client's own leadership,
  // a founder/owner, etc. -- not just any manager or colleague. Feeds the
  // "senior-stakeholder interactions" stat on Career Wrapped (see
  // lib/careerWrapped.ts and the migration comment on
  // memories.mentions_senior_stakeholder in lib/db.ts). Deliberately narrow:
  // a memory about a regular 1:1 with your direct manager, or working with
  // "the team," does NOT count -- this exists to be a meaningful signal, not
  // to fire on every mention of anyone above the person in an org chart.
  mentionsSeniorStakeholder: boolean;
};

const CATEGORY_OPTIONS: string[] = [...MEMORY_CATEGORIES_LIST];
const INDUSTRY_OPTIONS: string[] = [...OPPORTUNITY_INDUSTRIES_LIST];
const SENIORITY_OPTIONS: string[] = [...OPPORTUNITY_SENIORITY_LIST];

// Behavioral-interview + modern-work competency taxonomy (the kind of thing
// STAR answers and "tell me about a time..." questions are built around).
// Deliberately broad/role-agnostic rather than corporate-leadership-only,
// since Strivo's users span many kinds of roles, not just management.
// Grown from an original 12-item soft-skills-only list to 22, adding a
// second tier of more modern, execution- and technical-flavored
// competencies (AI & Tools Fluency, Technical & Hard Skills, Data-Driven
// Decision Making, etc.) -- the earlier list under-served anyone whose
// strongest stories are about what they BUILT or SHIPPED rather than a
// purely interpersonal moment. "Technical & Hard Skills" in particular is
// deliberately a broad catch-all (see its usage note in
// generateMemoryMetadata's prompt below) rather than narrowly scoped to one
// discipline, since Strivo's users span everything from engineering to
// design to operations to sales.
export const COMPETENCY_OPTIONS: string[] = [...MEMORY_COMPETENCIES_LIST];

// Generates title/summary/category/tags for a raw transcript. Returns null
// on ANY failure — callers must still keep the raw transcript saved either
// way (the user's words matter more than the AI metadata).
export async function generateMemoryMetadata(
  transcript: string,
  firstName?: string | null,
  now: Date = new Date(),
  // The user's existing project names (see lib/repo/projects.ts), passed
  // in fresh on every call rather than cached -- lets the model match
  // against a real, current list instead of guessing blind. Empty for a
  // user with no projects yet, which just means every suggestion here can
  // only ever be a "new project" suggestion, never an "existing" one.
  existingProjectNames: string[] = []
): Promise<MemoryMetadata | null> {
  const openai = getClient();
  if (!openai) return null;
  const todayIso = istDateString(now);
  const projectListForPrompt =
    existingProjectNames.length > 0 ? existingProjectNames.map((n) => `"${n}"`).join(", ") : "(none yet)";
  // Same "occasionally, never forced" name guidance as buildSystemPrompt's
  // nameContext -- only given to the model when a name is actually
  // available, and phrased as a light option for praise/reflectiveQuestion
  // specifically (the two fields written directly to the person, in second
  // person) rather than every field, since title/summary/keyPoints are
  // meant to stay neutral record-keeping, not a personal address.
  const nameHint = firstName
    ? ` The person's first name is ${firstName} -- you may use it occasionally in praise or reflectiveQuestion when it feels natural (e.g. opening the sentence), but don't force it into every one; most should read fine without it.`
    : "";
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You turn a raw first-person memory transcript (spoken or typed, in any language) into structured metadata." +
            " If the transcript begins with a line like 'Document note from the user: ...', that line is the uploader's own short note ABOUT the document (e.g. what it is or why they're sharing it) -- treat it only as context, never as the story itself, and never let it dominate or become the title/summary." +
            nameHint +
            " " +
            "Respond ONLY with a JSON object with keys: title (string, <=8 words, concrete and specific, SAME language as the transcript), " +
            "summary (string, 1-2 sentences, third-person-neutral but factual, a brief intro to what happened, SAME language as the transcript), " +
            "keyPoints (array of 3-6 short factual bullet points capturing the specific details, decisions, numbers and outcomes mentioned, SAME language as the transcript), " +
            `category (one of: ${CATEGORY_OPTIONS.join(", ")}), tags (array of 2-5 short lowercase keyword strings), ` +
            "searchText (string, 2-4 sentences, ALWAYS IN ENGLISH regardless of the transcript's language — translate it if the transcript isn't already English; this is for internal search indexing only and is never shown to the user, so prioritize covering the concrete nouns/topics/keywords over elegant phrasing). " +
            `competencies (array, 0-3 items, ONLY from this exact list: ${COMPETENCY_OPTIONS.join(", ")}). ` +
            "Include a competency ONLY if the transcript genuinely demonstrates it through a specific action the person took or decision they made -- not because the topic is loosely related. " +
            "Most people telling a casual, everyday story have no idea it happens to be a strong example of something like Leadership or Problem-Solving -- your job here is to spot that for them even though they never used that word themselves and may not think of it that way. " +
            "A story does NOT need a clean, successful outcome to count. Someone who tried several different approaches before one worked, or who kept going on something frustrating instead of giving up, is genuinely demonstrating Problem-Solving, Adaptability & Resilience, or Ownership & Initiative through that persistence itself -- even if the transcript ends before it's fully resolved or the result was mixed or unresolved. Don't reserve competencies for tidy wins; the struggle is often the more impressive part. " +
            "Equally, don't force a fit: an empty array is correct and expected for a large share of memories (e.g. a plain status update or a memory with no clear personal action in it). " +
            "Two items on the list deserve extra note: 'Technical & Hard Skills' is a deliberately broad catch-all for any concrete technical, domain, or craft skill actually applied -- writing code, designing something, running an analysis, operating equipment, using a specialized tool -- regardless of field, so don't skip it just because the transcript isn't about software specifically. 'AI & Tools Fluency' is narrower: use it only when the person specifically used AI, automation, or a notable tool/software to get something done (not just 'used a computer'). " +
            "praise (string or null): ONLY when competencies is non-empty, write one short (1-2 sentence) warm, specific compliment to the person, SAME language as the transcript, in second person, that names the concrete thing they actually did (referencing a real detail, decision, or number from the transcript -- not a vague restatement) and briefly notes it could make a strong interview or resume story. If the story is really about effort or persistence rather than a clean win -- trying multiple approaches, sticking with something frustrating, not giving up -- praise THAT specifically (the persistence itself, the willingness to keep trying) instead of only ever praising results; a genuine struggle is just as praiseworthy as a tidy success, and pretending it isn't makes this feel like a highlight reel instead of someone who actually noticed the effort. Sound like a genuine reaction from a supportive coach who actually read the story, never like a generic template ('Great job!', 'Well done!') -- it should be obvious it was written about THIS story specifically and would sound wrong attached to a different one. When competencies is empty, praise MUST be null. " +
            "resumeLine (string or null): ONLY when competencies is non-empty, write ONE polished resume bullet line for this story, ALWAYS IN ENGLISH regardless of the transcript's language. Standard resume conventions: start with a strong past-tense action verb (Led, Reduced, Built, Launched, Resolved, etc.), be a single line with no trailing period, and if the transcript mentions ANY concrete number, percentage, time saved, or scale (team size, users, revenue, duration), work it in naturally -- if the transcript has no numbers, write a strong qualitative bullet instead rather than inventing a fake metric. Never fabricate a number, outcome, or detail that isn't in the transcript. When competencies is empty, resumeLine MUST be null. " +
            "hasMetric (boolean): true ONLY if the transcript states at least one concrete, quantifiable metric reflecting real impact or scale -- a percentage, a money amount, a count of people/users/items, a duration saved, a clear before/after number. A date, someone's age, a phone number, or another incidental number does NOT count. false otherwise -- most memories should be false. " +
            "reflectiveQuestion (string or null): one short, genuinely curious follow-up question about THIS specific memory, SAME language as the transcript, the kind a thoughtful friend or coach would actually wonder after hearing this story -- grounded in a specific real detail from the transcript (name what happened, don't ask generically). Examples of the RIGHT kind of specificity: 'What made you decide to split it into two phases instead of pushing back the whole deadline?' -- NOT a generic template like 'How did that make you feel?' that could be pasted onto any memory. Return null if the memory is too thin or routine to meaningfully follow up on (e.g. a one-line status note with nothing left to explore) -- don't force a question onto everything. " +
            `futureCheckin (object or null): today's date is ${todayIso} (IST). ONLY when the transcript clearly mentions a SPECIFIC upcoming event that hasn't happened yet, with an identifiable timeframe -- an interview, a hard conversation, a performance review, a deadline, a decision, a result coming back. Examples: "I have my performance review next month", "talking to my manager about this on Friday", "we find out the results in two weeks". If so, return { question: string (SAME language as the transcript, short, specific, naming the actual event, phrased as something to ask AFTER it happens -- e.g. "How did the conversation with your manager go?", not "How do you feel about Friday?"), targetDate: string in YYYY-MM-DD format, your best-effort resolution of the relative timeframe against today's date -- e.g. "next Friday" or "in two weeks" becomes an actual calendar date. If only a vague timeframe is given (e.g. "sometime next month"), pick a single reasonable date within it rather than returning null over it. } Return null if there's no clear upcoming event, if the event already happened or is happening today, or if there's truly no timeframe at all to anchor a date to. This is rare -- most memories are about something already done, not something still coming, so null is the right answer far more often than not. Never invent an event that isn't actually mentioned. ` +
            "selfMinimized (boolean) and selfMinimizedReason (string or null): selfMinimized is true ONLY when the transcript describes a genuinely strong accomplishment -- real ownership, real impact, or a real difficulty actually overcome -- using flat, dismissive, or minimizing language about it: 'just', 'nothing much', 'anyone would have done that', 'it wasn't a big deal', or simply reporting something significant in a matter-of-fact tone with zero acknowledgment of its actual weight. This is NARROWER than competencies/praise above: a memory can genuinely have competencies while being described with ordinary pride or plain neutral reporting, which does NOT count here -- reserve true for a real, noticeable gap between what actually happened and how modestly the person framed it. Most memories are false here, including most memories with competencies -- this should fire rarely. When true, selfMinimizedReason is one short (<=20 words) English internal note naming the specific gap (e.g. 'Led a 3-team rollout solo but called it \"just helping out\"') -- never shown to the user directly, only used internally later. When false, selfMinimizedReason MUST be null. " +
            "entities (array, 0-5 items): recurring proper nouns worth remembering from this transcript -- a specific person's name (a manager, teammate, friend, client), a team name, or a recurring project/product name. Only include something genuinely name-like -- a real name or a real proper-noun team/project name -- NOT a generic role or relation with no name attached ('my manager', 'a friend', 'the team' do NOT count on their own; 'Priya', 'the Atlas team', 'Project Falcon' do). Use the transcript's own casing/spelling. Skip entirely (empty array) if nothing in the transcript is a genuine named person/team/project -- this should be empty for a large share of memories. " +
            "The transcript is machine speech-to-text and can contain an obvious mishearing of a well-known term -- most commonly a modern tech/work phrase autocorrected-by-ear into an ordinary word that happens to sound similar (e.g. 'vibe coding' -- letting an AI write code from a natural-language description -- misheard as 'white coding'). When the surrounding context makes the intended term unambiguous (the transcript is clearly about coding/apps/AI tools) and the mishearing is a well-established named term you're confident about, use the CORRECT term in title/summary/keyPoints/searchText/resumeLine instead of repeating the mistranscription -- don't build a resume line or summary around a garbled word. This is narrow: only fix a clear, confident mishearing of a real known term, never reinterpret or guess at what someone 'really meant' beyond that, and never change a plain word just because a different reading seems more interesting. The transcript text itself is never altered (the user can edit it directly) -- this only affects the metadata you're generating here. " +
            `projectSuggestion (object): the user's EXISTING projects are: ${projectListForPrompt}. Return { "existing": string or null, "new": string or null } -- ALWAYS both keys, at most ONE non-null. Set "existing" to the EXACT name (copy it verbatim from the list above, don't reword it) of one of those existing projects ONLY when this transcript is clearly, confidently about that same project -- a passing one-word mention isn't enough, and don't force a match onto the closest-sounding existing name if it's not really the same thing. If no existing project fits but the transcript clearly and repeatedly centers on ONE specific, distinctly-named initiative/project (not just "work" or "a meeting" in general) that would genuinely be worth tracking as its own project going forward, set "new" to a short, clear name for it (title case, 1-4 words, based on what the transcript actually calls it when possible). Otherwise -- by far the most common case, including plenty of ordinary work memories that don't center on a specific named project -- return both as null. This is only ever shown to the user as a suggestion they confirm or dismiss, never applied automatically, so it's fine (better, even) to return null rather than force a guess. ` +
            "mentionsSeniorStakeholder (boolean): true ONLY when the transcript describes actually interacting with (presenting to, negotiating with, being reviewed by, getting a decision from) someone at a SENIOR/executive level -- a VP, director, C-suite exec (CEO/CFO/CTO/etc.), a client's own leadership, a founder or business owner. A regular 1:1 with your own direct manager, working with 'the team' or 'my colleague', or a vague unnamed 'stakeholder' does NOT count -- this should be false for most memories, including most workplace memories. " +
            "Outside of that narrow correction, never invent facts not present in the transcript. Base everything strictly on the transcript text.",
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
    // Re-validated against the REAL list passed in, not trusted verbatim --
    // same principle as filteredCompetencies above. Matching
    // case-insensitively (rather than a strict === check) is what still
    // lets "atlas" match an existing "Atlas" without the model needing to
    // get casing exactly right, while still refusing anything that isn't a
    // genuine match -- a model that paraphrases an existing project's name
    // instead of copying it exactly would otherwise slip past as a false
    // "existing" match. If, despite the prompt saying "at most one," the
    // model returns both an existing match AND a new-project name, the
    // existing match wins and the new-name suggestion is dropped -- a real
    // project's own name always takes priority over inventing a second one.
    const matchedExistingProjectName =
      typeof parsed.projectSuggestion?.existing === "string"
        ? existingProjectNames.find(
            (n) => n.toLowerCase() === String(parsed.projectSuggestion.existing).trim().toLowerCase()
          ) ?? null
        : null;
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
      hasMetric: parsed.hasMetric === true,
      reflectiveQuestion: typeof parsed.reflectiveQuestion === "string" ? parsed.reflectiveQuestion.slice(0, 300) : null,
      // Re-validated in code rather than trusted verbatim, same principle as
      // the competencies filter above -- a model estimating "next Friday"
      // relative to today is exactly the kind of date arithmetic that's
      // occasionally subtly wrong, and a check-in with a bad date (already
      // past, or absurdly far out) is worse than no check-in at all.
      futureCheckin: validateFutureCheckin(parsed.futureCheckin, todayIso),
      selfMinimized: parsed.selfMinimized === true,
      selfMinimizedReason:
        parsed.selfMinimized === true && typeof parsed.selfMinimizedReason === "string"
          ? parsed.selfMinimizedReason.slice(0, 200)
          : null,
      // No fixed taxonomy to filter against (unlike competencies/category) --
      // these are free-form proper nouns -- so just bound the count and
      // length per item to keep a hallucinating model from producing
      // something huge.
      entities: Array.isArray(parsed.entities)
        ? parsed.entities.slice(0, 5).map((e: unknown) => String(e).slice(0, 80)).filter((e: string) => e.trim().length > 0)
        : [],
      suggestedExistingProjectName: matchedExistingProjectName,
      suggestedNewProjectName:
        !matchedExistingProjectName && typeof parsed.projectSuggestion?.new === "string" && parsed.projectSuggestion.new.trim()
          ? parsed.projectSuggestion.new.trim().slice(0, 60)
          : null,
      mentionsSeniorStakeholder: parsed.mentionsSeniorStakeholder === true,
    };
  } catch (err) {
    console.error("generateMemoryMetadata failed:", err);
    Sentry.captureException(err);
    return null;
  }
}

// Narrow, single-field classifier used ONLY by the Career Wrapped backfill
// route (app/api/career-wrapped/backfill/route.ts) for memories that predate
// mentions_senior_stakeholder existing on generateMemoryMetadata above. A
// full re-run of generateMemoryMetadata would also overwrite/duplicate-cost
// every other field (competencies, praise, resumeLine, ...) that memory
// already has -- this asks the model just the one question instead, same
// "AI proposes once, we store the result" cost discipline as everything
// else in this file. Returns null on any failure, same convention as every
// other AI function here -- the caller leaves mentions_senior_stakeholder
// NULL (still "unclassified") rather than guessing, so a failed backfill
// attempt is safely retryable on a later run instead of silently recording
// a wrong answer.
export async function classifySeniorStakeholder(transcript: string): Promise<boolean | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Read this first-person memory transcript (spoken or typed, any language) and answer one question. " +
            "Respond ONLY with a JSON object: { \"mentionsSeniorStakeholder\": boolean }. " +
            "true ONLY when the transcript describes actually interacting with (presenting to, negotiating with, being reviewed by, getting a decision from) someone at a SENIOR/executive level -- a VP, director, C-suite exec (CEO/CFO/CTO/etc.), a client's own leadership, a founder or business owner. A regular 1:1 with your own direct manager, working with 'the team' or 'my colleague', or a vague unnamed 'stakeholder' does NOT count -- this should be false for most memories, including most workplace memories.",
        },
        { role: "user", content: transcript },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.mentionsSeniorStakeholder === true;
  } catch (err) {
    console.error("classifySeniorStakeholder failed:", err);
    Sentry.captureException(err);
    return null;
  }
}

export type WeeklyRecapResult = {
  headline: string;
  stories: { memoryId: string; blurb: string }[];
};

// Picks the best 2-3 stories out of a batch of memories (in practice, one
// user's past 7 days -- see app/api/weekly-recap/run) and writes a short,
// warm recap. This is the "give them a reason to open the app even when
// they're not actively prepping for an interview" feature -- a weekly
// digest pushed to their phone, not something they have to go looking for.
// Returns null on any failure OR if nothing in the batch is genuinely worth
// featuring; callers should just skip that user's recap for the week
// rather than send a low-quality one or error the whole job.
export async function generateWeeklyRecap(memories: Memory[]): Promise<WeeklyRecapResult | null> {
  const openai = getClient();
  if (!openai || memories.length === 0) return null;
  try {
    const listing = memories
      .map((m) => {
        const competencies = safeParseStringArray(m.competencies);
        return `id: ${m.id}\nTitle: ${m.title}${competencies.length ? `\nCompetencies: ${competencies.join(", ")}` : ""}\nSummary: ${m.summary ?? m.transcript.slice(0, 300)}`;
      })
      .join("\n\n---\n\n");
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write a short, warm weekly recap of a user's most notable personal memories from the past week, for a career-memory app. " +
            "You'll be given a list of memories (id, title, optional competencies, summary). Pick the 2-3 BEST ones -- prioritize ones with competencies listed, a concrete outcome, or real substance; skip anything thin or routine. If fewer than 2 are genuinely worth featuring, return fewer -- never pad with weak picks, and if NONE are worth featuring, return an empty stories array. " +
            'Respond ONLY with JSON: {"headline": string, "stories": [{"id": string, "blurb": string}]}. ' +
            'headline: one short, warm sentence (<=14 words) summarizing the week as a whole, SAME language as most of the memories (default English if mixed/unclear) -- written like a friend noticing you had a good week, not a corporate summary. ' +
            "stories: each item's id must EXACTLY match one of the provided memory ids, and blurb is one specific, warm sentence (SAME language as that memory) naming what actually happened and, if relevant, what it shows about the person. " +
            "Never invent facts not present in what you were given.",
        },
        { role: "user", content: listing },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.headline || !Array.isArray(parsed.stories)) return null;

    const validIds = new Set(memories.map((m) => m.id));
    const stories: { memoryId: string; blurb: string }[] = [];
    for (const item of parsed.stories) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { blurb?: unknown }).blurb === "string"
      ) {
        const id = (item as { id: string }).id;
        const blurb = (item as { blurb: string }).blurb;
        if (validIds.has(id)) stories.push({ memoryId: id, blurb: blurb.slice(0, 300) });
      }
      if (stories.length >= 3) break;
    }
    if (stories.length === 0) return null;

    return { headline: String(parsed.headline).slice(0, 200), stories };
  } catch (err) {
    console.error("generateWeeklyRecap failed:", err);
    Sentry.captureException(err);
    return null;
  }
}

// Compares a user's earliest recorded memories against their most recent
// ones and reflects back a genuine pattern of change -- a deeper, longer-
// arc compliment than praising any single memory in isolation (see
// generateMemoryMetadata's `praise` field), because it's about who the
// person is becoming, not just what they did once. See
// shouldGenerateGrowthNarrative in lib/repo/growthNarratives.ts for when
// this actually gets called (rare and earned -- not a per-memory feature).
// Returns null on any failure OR if the two batches don't show a genuine,
// specific pattern -- callers should skip that user's narrative for now
// rather than force a generic "you've grown so much!" onto two batches
// that don't actually look meaningfully different.
export async function generateGrowthNarrative(earlyMemories: Memory[], recentMemories: Memory[]): Promise<string | null> {
  const openai = getClient();
  if (!openai || earlyMemories.length === 0 || recentMemories.length === 0) return null;
  try {
    const describe = (memories: Memory[]) =>
      memories
        .map((m) => {
          const competencies = safeParseStringArray(m.competencies);
          return `- "${m.title}" (${m.created_at.slice(0, 10)})${competencies.length ? ` [${competencies.join(", ")}]` : ""}: ${m.summary ?? m.transcript.slice(0, 200)}`;
        })
        .join("\n");
    const listing =
      `EARLIER memories:\n${describe(earlyMemories)}\n\n` + `RECENT memories:\n${describe(recentMemories)}`;
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You compare two batches of a user's personal memories (EARLIER vs RECENT, from a career-memory app) and look for a genuine, specific pattern of change between them -- a shift in the kind of competency they demonstrate (e.g. more often initiating vs. just reacting), growing scope or complexity of what they take on, a recurring theme that's emerged, more confidence or ownership in how they describe things, etc. " +
            'Respond ONLY with JSON: {"narrative": string or null}. ' +
            "If you can identify a REAL, SPECIFIC pattern grounded in the actual content of both batches, write narrative as 2-4 warm sentences, second person, SAME language as most of the memories (default English if mixed/unclear) -- reflect the change back concretely (name the kind of shift, referencing real specifics from the memories) rather than generic praise like 'you've grown so much.' It should read like a coach who has actually watched someone's story develop over time, not a horoscope. " +
            "If the two batches don't actually show a meaningful, honest difference -- similar themes, similar scope, nothing you can point to specifically -- return narrative: null. Do NOT invent a pattern that isn't really there just to have something to say.",
        },
        { role: "user", content: listing },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.narrative !== "string" || !parsed.narrative.trim()) return null;
    return parsed.narrative.trim().slice(0, 800);
  } catch (err) {
    console.error("generateGrowthNarrative failed:", err);
    Sentry.captureException(err);
    return null;
  }
}

export type SuggestedRoleResult = { title: string; industry: string | null; reasoning: string | null };

// "Roles you're ready for" (Home screen) -- names up to 5 roles a user is
// genuinely ready for right now, grounded ONLY in a sample of their own
// memories (see shouldGenerateSuggestedRoles/createSuggestedRoles in
// lib/repo/suggestedRoles.ts, called by the same monthly automation as
// generateGrowthNarrative above -- see app/api/growth-narrative/run).
// industry is left null whenever the memories read as industry-agnostic
// (transferable skills without a specific field named) rather than guessed
// from the role title alone -- the UI shows that honestly as "Any
// industry." Otherwise, when the memories point at one dominant industry
// (the common case -- e.g. someone with a long run in automotive), 2-3 of
// the roles are required to be a next step within THAT industry specifically
// -- see the prompt below -- so the suggestions read as genuinely
// understanding the person's actual specialization rather than generic
// transferable-skill pivots (founder feedback: seeing all 5 roles labeled
// "Any industry" when they'd spent 12 years in one industry read as Strivo
// not understanding them). reasoning is the 1-2 sentence "why this role"
// explanation shown (verbatim, no further AI call) when the user taps the
// "See why you're a fit" button on Home -- see sendRolesExplainerMessage in
// lib/chatService.ts. It's stored alongside the role now specifically so
// that explanation can be rendered deterministically instead of asking a
// fresh open-ended chat question each time, which is what previously
// produced a different-looking (sometimes a direct answer, sometimes a
// request for more detail) response on every tap.
// Returns null (not an error-vs-empty distinction the caller needs to make
// itself) when nothing in the sample genuinely supports naming a role --
// callers should treat that the same as a hard failure (skip storing
// anything, try again next cycle) rather than caching an empty result.
//
// seniority (added alongside the Opportunities tab's structured 4-factor
// matching -- see lib/opportunities.ts) is ONE overall band for the person
// as a whole, from the closed OPPORTUNITY_SENIORITY_LIST vocabulary,
// generated in this SAME call rather than a second AI round trip -- it's
// asking the model to read the same evidence it's already looking at for
// the per-role industry field, just at a coarser, person-level grain.
export type GenerateSuggestedRolesResult = { roles: SuggestedRoleResult[]; seniority: string | null };

export async function generateSuggestedRoles(memories: Memory[]): Promise<GenerateSuggestedRolesResult | null> {
  const openai = getClient();
  if (!openai || memories.length === 0) return null;
  try {
    // IMPORTANT: includes a raw transcript excerpt alongside the summary,
    // not just the summary alone. m.summary is "third-person-neutral,
    // 1-2 sentences" (see generateMemoryMetadata's own prompt) -- built to
    // be a compact recap of what the person DID, not a guarantee that it
    // preserves which employer/client/sector the story was about. A story
    // that names "the gigafactory client" or "Capgemini's automotive
    // practice" in the person's own words can easily summarize down to
    // "led a plant expansion project" with the industry dropped, since
    // that's still a perfectly good, factual summary of the ACTION. Before
    // this fix, this function only ever saw that summary (the transcript
    // fallback below only fired for the rare memory with no summary at
    // all) -- so even a person who consistently names their industry when
    // recording had that signal silently stripped out one step upstream,
    // and every role came back "industry": null regardless of prompt
    // wording (founder-reported: memories DO name the industry, the model
    // just never saw it). Excerpting the actual transcript here, not just
    // relying on the summary, is the fix -- see the system prompt below
    // for how it's used.
    const listing = memories
      .map((m) => {
        const competencies = safeParseStringArray(m.competencies);
        const transcriptExcerpt =
          m.transcript.length > 400 ? `${m.transcript.slice(0, 400)}…` : m.transcript;
        return (
          `- "${m.title}"${competencies.length ? ` [${competencies.join(", ")}]` : ""}\n` +
          `  Summary: ${m.summary ?? "(none)"}\n` +
          `  In their own words: ${transcriptExcerpt}`
        );
      })
      .join("\n");
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a career coach reviewing someone's personal career memories (from a career-memory app) to name roles they're genuinely ready for RIGHT NOW. " +
            "You'll be given a list of memories, each with a title, optional competencies, a short third-person summary, AND an excerpt of the person's OWN WORDS (their original transcript). " +
            "The summary is a compact recap of what they DID and can leave out which employer, client, or sector the story was about even when the person's own words clearly named it -- so for industry specifically, always check the 'In their own words' excerpt, not just the summary. " +
            'Respond ONLY with JSON: {"roles": [{"title": string, "industry": string or null, "reasoning": string}], "seniority": string or null}. ' +
            "Up to 5 roles, best fit first. Every role must be directly supported by concrete evidence across these memories (skills actually demonstrated, scope of responsibility, kind of work actually done) -- never invent a role that isn't backed by what's actually here, and return fewer than 5 (even zero, as an empty array) rather than padding with a weak fit. " +
            `industry: the SINGLE best-matching entry from this exact list, copied EXACTLY, or null: ${INDUSTRY_OPTIONS.join(", ")}. Only set it when the memories themselves clearly point at one of these -- a company, sector, or domain actually mentioned or strongly implied. If the memories show transferable skills without pointing at a specific field, or point at a real sector that genuinely isn't a good match for anything on this list, set industry to null -- do NOT guess or force a near-fit just because it's a common pairing for that role title. ` +
            "reasoning: 1-2 sentences, written directly to the person ('you...'), citing the SPECIFIC memory or evidence that supports this role -- e.g. what they actually did, led, or solved. This is shown to them verbatim as the explanation for why this role is on their list, so it must be concrete and checkable against their own memories, never generic career-coach filler. " +
            "Look across ALL the memories first and identify the ONE industry/sector that shows up most (a company, domain, or sector actually named or strongly implied across several memories, e.g. someone with years of automotive-sector work). If a clear dominant industry exists (and it's a genuine match for one of the list entries above), 2 to 3 of the roles (out of up to 5) MUST be roles within THAT SAME industry -- a believable, evidenced next step from what they're already doing there, not a lateral pivot into something unrelated -- and industry for each of those roles MUST be set to that actual list entry, never null and never 'Any industry'. This is what shows the person the suggestions genuinely understand the industry and function they specialize in, instead of reading as generic. Only spend the remaining slots on adjacent or different fields, and only when the evidence genuinely supports it. If the memories genuinely show no dominant industry (truly cross-industry or industry-agnostic work), it's fine for industry to be null on some or all roles -- but check carefully first, since most people's memories do point at one. " +
            `seniority: ONE overall band for this person as a whole (not per-role), the SINGLE best-matching entry from this exact list, copied EXACTLY, or null: ${SENIORITY_OPTIONS.join(", ")}. Judge this from the scope, scale, and language of responsibility actually shown across the memories as a whole (team/budget/project size they led or owned, whether they're described managing others vs. individually executing, titles or seniority language actually used) -- not from years of tenure alone. Set it to null only if the sample genuinely gives no basis to judge (very sparse or ambiguous evidence) rather than defaulting to a middle guess. ` +
            "Never invent facts not present in what you were given.",
        },
        { role: "user", content: listing },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.roles)) return null;

    const roles: SuggestedRoleResult[] = [];
    for (const item of parsed.roles) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { title?: unknown }).title === "string" &&
        ((item as { industry?: unknown }).industry === null || typeof (item as { industry?: unknown }).industry === "string")
      ) {
        const title = (item as { title: string }).title.trim().slice(0, 80);
        const industryRaw = (item as { industry: string | null }).industry;
        // Constrained to the closed taxonomy (see this function's own
        // comment on `seniority` for why) -- a value the model returns
        // that isn't an exact list entry is dropped to null rather than
        // stored as freeform text, so this field stays directly comparable
        // to a job posting's own industry_tag (see classifyJobPostings
        // below and the matching in lib/opportunities.ts).
        const industry = typeof industryRaw === "string" && INDUSTRY_OPTIONS.includes(industryRaw) ? industryRaw : null;
        const reasoningRaw = (item as { reasoning?: unknown }).reasoning;
        const reasoning = typeof reasoningRaw === "string" ? reasoningRaw.trim().slice(0, 400) || null : null;
        if (title) roles.push({ title, industry, reasoning });
      }
      if (roles.length >= 5) break;
    }
    const seniorityRaw = (parsed as { seniority?: unknown }).seniority;
    const seniority = typeof seniorityRaw === "string" && SENIORITY_OPTIONS.includes(seniorityRaw) ? seniorityRaw : null;
    return { roles, seniority };
  } catch (err) {
    console.error("generateSuggestedRoles failed:", err);
    Sentry.captureException(err);
    return null;
  }
}

export type JobClassification = { industry: string | null; seniority: string | null };

// Batched LLM classification of real job postings into the SAME closed
// industry/seniority taxonomies generateSuggestedRoles above uses for a
// person -- what makes lib/opportunities.ts's structured matching possible
// at all (see that file's matchCandidates). Deliberately its own function,
// called once per NEW or still-unclassified posting (see
// listUnclassifiedActiveJobPostings/setJobClassification in lib/repo/
// jobPostings.ts and the caller in app/api/opportunities/refresh-pool/run)
// rather than folded into rankOpportunities below -- that call happens
// PER USER, every time their ranking recomputes, so classifying there would
// mean re-classifying the same jobs over and over for every person who
// happens to see them. This runs ONCE per job, ever, and the result is
// reused by every user's matching from then on. Pure OpenAI cost, no
// Adzuna calls -- direct founder call to keep Adzuna's own budget fixed and
// do industry/seniority tagging entirely on the app's own end.
//
// Batched (multiple postings per call, like rankOpportunities) rather than
// one call per job, to keep the number of API calls -- and therefore cost
// and latency -- proportional to batches, not to job count. Hard-capped at
// MAX_CLASSIFY_BATCH as a last line of defense against an accidentally huge
// prompt; the caller is expected to chunk a larger backlog into
// MAX_CLASSIFY_BATCH-sized calls itself (see the refresh-pool route).
const MAX_CLASSIFY_BATCH = 25;

export async function classifyJobPostings(
  jobs: { id: string; title: string; company: string | null; snippet: string | null }[]
): Promise<Map<string, JobClassification>> {
  const openai = getClient();
  const result = new Map<string, JobClassification>();
  if (!openai || jobs.length === 0) return result;
  const batch = jobs.slice(0, MAX_CLASSIFY_BATCH);
  try {
    const listing = batch
      .map((j) => {
        const snippet = j.snippet ? (j.snippet.length > 300 ? `${j.snippet.slice(0, 300)}…` : j.snippet) : "(no description)";
        return `[${j.id}] "${j.title}" at ${j.company ?? "Unknown company"}\n  ${snippet}`;
      })
      .join("\n\n");
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You classify real job postings into a fixed industry and seniority taxonomy, using ONLY the title, company name, and description given for each -- never guess beyond what's actually there. " +
            'Respond ONLY with JSON: {"classified": [{"id": string, "industry": string or null, "seniority": string or null}]}. One entry per posting given, using its exact [id] tag. ' +
            `industry: the SINGLE best-matching entry from this exact list, copied EXACTLY, or null: ${INDUSTRY_OPTIONS.join(", ")}. Judge the sector the EMPLOYER operates in, using the company name and description (not the job title alone) -- e.g. a "Finance Manager" at a car maker is Automotive, the exact same title at a hospital chain is Healthcare / Pharma, and at an IT services firm is IT Services / Consulting. If the company/description genuinely doesn't reveal a clear sector (generic company name, no descriptive text), return null rather than guessing from the title alone. ` +
            `seniority: the SINGLE best-matching entry from this exact list, copied EXACTLY, or null: ${SENIORITY_OPTIONS.join(", ")}. Judge from the title and description -- explicit seniority language ("Head of", "Director", "VP", "Junior", "Lead", "Associate"), years of experience mentioned, or scope of responsibility described. If genuinely unclear, return null rather than defaulting to a middle guess. ` +
            "Only use ids exactly as given in the [id] tags -- never invent an id, never renumber.",
        },
        { role: "user", content: `JOB POSTINGS:\n${listing}` },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return result;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.classified)) return result;

    const validIds = new Set(batch.map((j) => j.id));
    for (const item of parsed.classified) {
      if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
        const id = (item as { id: string }).id;
        if (!validIds.has(id)) continue;
        const industryRaw = (item as { industry?: unknown }).industry;
        const seniorityRaw = (item as { seniority?: unknown }).seniority;
        const industry = typeof industryRaw === "string" && INDUSTRY_OPTIONS.includes(industryRaw) ? industryRaw : null;
        const seniority = typeof seniorityRaw === "string" && SENIORITY_OPTIONS.includes(seniorityRaw) ? seniorityRaw : null;
        result.set(id, { industry, seniority });
      }
    }
    return result;
  } catch (err) {
    console.error("classifyJobPostings failed:", err);
    Sentry.captureException(err);
    return result;
  }
}

export type OpportunityCandidate = {
  id: string; // job_postings.id
  title: string;
  company: string | null;
  location: string | null;
  snippet: string | null;
};

export type RankedOpportunity = {
  id: string;
  fit: "strong" | "good" | "possible";
  reason: string;
};

// Only ever called on a pre-filtered candidate set (see
// lib/opportunities.ts) -- never the whole job_postings pool. Hard cap
// here too as a last line of defense against an accidentally huge prompt.
const MAX_OPPORTUNITY_CANDIDATES = 80;
const MAX_RANKED_OPPORTUNITIES = 25;

// Opportunities tab ranking (see lib/opportunities.ts). Given a text
// description of who this person is -- built from their suggested_roles
// (lib/repo/suggestedRoles.ts, already generated monthly from their actual
// memories) plus resume text -- and a batch of candidate jobs already
// pre-filtered by cheap matching, asks the model to judge genuine fit and
// return the best MAX_RANKED_OPPORTUNITIES, best first. Deliberately one
// batched call over the whole candidate set rather than one call per job:
// keeps cost bounded and lets the model compare candidates against each
// other, not just against the profile in isolation.
//
// Returns null (not an error) when the API isn't configured or the
// candidate list is empty -- callers should treat that as "nothing to
// show," not retry.
export async function rankOpportunities(
  profileText: string,
  candidates: OpportunityCandidate[]
): Promise<RankedOpportunity[] | null> {
  const openai = getClient();
  if (!openai || candidates.length === 0) return null;
  const pool = candidates.slice(0, MAX_OPPORTUNITY_CANDIDATES);
  try {
    const listing = pool
      .map((c) => {
        const snippet = c.snippet ? (c.snippet.length > 300 ? `${c.snippet.slice(0, 300)}…` : c.snippet) : "(no description)";
        return `[${c.id}] "${c.title}" at ${c.company ?? "Unknown company"}, ${c.location ?? "Location unspecified"}\n  ${snippet}`;
      })
      .join("\n\n");
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a career coach matching a real person to real job postings, using ONLY the career evidence you're given about them -- never invent experience they haven't shown. " +
            "You'll get a short profile of the person (roles they're genuinely ready for right now, with reasoning grounded in their actual career memories, plus resume text) and a numbered list of candidate job postings, each tagged with an [id] you must use exactly as given. " +
            'Respond ONLY with JSON: {"ranked": [{"id": string, "fit": "strong" | "good" | "possible", "reason": string}]}. ' +
            `Return up to ${MAX_RANKED_OPPORTUNITIES} candidates, best fit first -- fewer (even zero) is correct if most of the list is a genuine stretch or mismatch; never pad with weak fits just to reach the count. ` +
            "fit: 'strong' means this role is close to what they're already evidenced-ready for; 'good' means a believable next step with some transferable gap; 'possible' means plausible but a real stretch worth surfacing anyway (not a wild guess). " +
            "reason: one sentence, written directly to the person ('your...'), citing the SPECIFIC experience/role from their profile that makes this job worth a look -- concrete and checkable, never generic career-coach filler like 'this could be a great opportunity for growth'. " +
            "Judge on: relevant experience level and seniority (don't surface something wildly over- or under-qualified), function and industry transferability (a plausible pivot is fine, an unrelated field is not), location fit (if the profile states a likely city, a job in that same city should generally be preferred over an otherwise-equal one elsewhere -- but don't discard a genuinely strong match just because its city wasn't stated or a role reads as remote-friendly), and whether the profile actually supports the fit. " +
            "Only use ids exactly as given in the [id] tags -- never invent an id, never renumber.",
        },
        { role: "user", content: `PERSON'S PROFILE:\n${profileText}\n\nCANDIDATE JOBS:\n${listing}` },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.ranked)) return null;

    const validIds = new Set(pool.map((c) => c.id));
    const ranked: RankedOpportunity[] = [];
    for (const item of parsed.ranked) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        validIds.has((item as { id: string }).id) &&
        ["strong", "good", "possible"].includes((item as { fit?: unknown }).fit as string) &&
        typeof (item as { reason?: unknown }).reason === "string"
      ) {
        ranked.push({
          id: (item as { id: string }).id,
          fit: (item as { fit: RankedOpportunity["fit"] }).fit,
          reason: (item as { reason: string }).reason.trim().slice(0, 300),
        });
      }
      if (ranked.length >= MAX_RANKED_OPPORTUNITIES) break;
    }
    return ranked;
  } catch (err) {
    console.error("rankOpportunities failed:", err);
    Sentry.captureException(err);
    return null;
  }
}

export type DocumentStorySegment = { title: string; content: string };

// A long uploaded document (resume, career journal, self-review export,
// portfolio writeup) is often a COLLECTION of many separate stories bundled
// into one file, not one continuous narrative -- a founder-reported
// 35-page career history is the motivating case. Without this step, the
// whole document became exactly ONE memory with one blended title/summary/
// competency set, which badly under-counts what's actually in it (Career
// Wrapped stats, muscle scores, etc. all read one memory's worth of signal
// instead of fifteen). Called by POST /api/memories/split only for long
// file uploads (see MIN_CHARS_FOR_SPLIT_CHECK there) -- short uploads (a
// single job description, a certificate) skip this call entirely to avoid
// the extra latency/cost for documents that were never going to split
// anyway. That endpoint is deliberately its own small request -- see its
// comment for why the story-saving loop lives on the client instead of
// inside this same request. Returns [] (not an error) both when the
// document genuinely reads as ONE piece and when it technically found only
// one story -- callers should treat both the same as "don't split, use the
// normal single-memory path" rather than adding batch-UI complexity for a
// single-item batch.
//
// The split boundary is the PROJECT/achievement, not the employer (founder
// feedback: a resume with four companies shouldn't become exactly four
// stories) -- see the system prompt below for the actual instruction. One
// job can genuinely contain several distinct projects that each deserve
// their own story, so the story count is expected to run higher than the
// number of roles/companies on the resume, not match it.
export async function splitDocumentIntoStories(text: string): Promise<DocumentStorySegment[] | null> {
  const openai = getClient();
  if (!openai || !text.trim()) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.2,
      // gpt-4o-mini's hard output cap is 16,384 tokens -- set just under
      // that so a document with a genuinely large story count (raised from
      // 20 to 30, see the cap below) has room to come back in full instead
      // of getting cut off mid-JSON.
      max_tokens: 16000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You read an uploaded document (resume, career journal, self-review, portfolio, etc.) for a career-memory app and decide whether it's really ONE continuous piece, or a COLLECTION of multiple distinct stories/experiences/achievements bundled into one file. " +
            'Respond ONLY with JSON: {"isCollection": boolean, "stories": [{"title": string, "content": string}]}. ' +
            "isCollection: true only when the document genuinely contains multiple SEPARATE experiences that each deserve to be their own memory (e.g. several different projects, roles, or achievements) -- not just one narrative told across several paragraphs, and not a resume's routine section headers (Skills, Education, contact info) that aren't stories at all. " +
            "The unit of a story is a distinct PROJECT, initiative, or achievement -- NEVER default to one story per employer or job title. A single role at one company very often contains several separate projects or accomplishments (e.g. 'led the platform migration', 'negotiated the vendor contract', 'built the onboarding funnel' could all be one job at one company), and each one that has enough real detail to stand on its own should become its OWN story rather than being merged into a single 'my time at Company X' blob -- so a four-company resume can easily produce ten or more stories, not four. At the same time, don't invent a split where a role's bullet points describe only one continuous piece of work -- only split what the document actually distinguishes as separate efforts. Company and job-title names are context to carry into each story's content (and title if it helps), never the boundary that decides where one story ends and the next begins. " +
            "If isCollection is true, split it into up to 30 stories, each capturing ONE distinct experience. For each: title is a short (<=8 word) working title (name the project/achievement, not just the employer); content is that story's own full detail, preserving every concrete specific already in the document (numbers, names, outcomes, dates) rather than summarizing them away -- this text gets analyzed further downstream -- but you don't need to reproduce filler wording verbatim. Skip anything that isn't a real story (a bare skills list, contact info, an empty section header). " +
            "If the document begins with a line like 'Document note from the user: ...', treat that as context about the whole document, never as a story itself. " +
            "If isCollection is false, return an empty stories array -- the caller treats the whole document as one memory in that case. " +
            "Never invent a story, detail, or number that isn't actually in the document.",
        },
        { role: "user", content: text },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.isCollection || !Array.isArray(parsed.stories)) return [];

    const stories: DocumentStorySegment[] = [];
    for (const item of parsed.stories) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { title?: unknown }).title === "string" &&
        typeof (item as { content?: unknown }).content === "string"
      ) {
        const title = (item as { title: string }).title.trim().slice(0, 100);
        const content = (item as { content: string }).content.trim();
        if (title && content) stories.push({ title, content });
      }
      if (stories.length >= 30) break;
    }
    return stories.length >= 2 ? stories : [];
  } catch (err) {
    console.error("splitDocumentIntoStories failed:", err);
    Sentry.captureException(err);
    return null;
  }
}

export type ResumeCareerStats = {
  wins: number;
  leadershipMoments: number;
  problemsSolved: number;
  seniorStakeholderInteractions: number;
};

// A lightweight, COUNTS-ONLY read of a user's uploaded resume (see
// resume_text in lib/repo/users.ts) -- deliberately NOT the same pipeline as
// splitDocumentIntoStories/generateMemoryMetadata above, which create real,
// individually-tagged Memory rows. A resume is usually already a summary of
// things a user may ALSO separately record as full memories by voice/type/
// upload, so turning it into its own set of memories would risk
// double-counting the same achievement twice on the Career Wrapped stats
// card. This instead returns just aggregate counts, shown as a small
// supplementary "also seen in your resume" line on the Home stats card (see
// resumeStats in app/(app)/home/page.tsx and setResumeStats in
// lib/repo/users.ts) -- informational only, never merged into the primary
// memory-derived numbers. Uses the same classification bar as a real
// memory's competencies/mentions_senior_stakeholder (generateMemoryMetadata
// above) so the two numbers mean the same thing, even though they're never
// combined. Called once, synchronously, right when a resume is saved (see
// POST /api/profile/resume) -- a single bounded call, not the kind of
// unbounded per-story work that caused the 2026-09-17 upload timeout (see
// the comment on POST /api/memories), so no background job is needed here.
export async function analyzeResumeCareerStats(resumeText: string): Promise<ResumeCareerStats | null> {
  const openai = getClient();
  if (!openai || !resumeText.trim()) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.2,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You read a resume and count how many genuinely distinct achievements it describes in each of these categories, using the same bar a career-memory app uses to classify a single recorded story -- don't inflate counts by treating routine job duties, skills lists, or section headers as achievements. " +
            'Respond ONLY with JSON: {"wins": number, "leadershipMoments": number, "problemsSolved": number, "seniorStakeholderInteractions": number}. ' +
            "wins: a real accomplishment with a concrete outcome or measurable impact -- a result, a percentage, a number, a clear before/after. " +
            "leadershipMoments: genuinely led, managed, mentored, or directed other people -- not just 'worked with a team' or 'collaborated cross-functionally'. " +
            "problemsSolved: resolved one specific, difficult problem, conflict, or crisis -- not routine day-to-day responsibilities. " +
            "seniorStakeholderInteractions: presented to, negotiated with, or was reviewed by someone at VP/executive/C-suite level, or a client's own leadership -- not a regular manager or teammate. " +
            "One bullet point can count toward more than one category. Count conservatively -- when genuinely unsure whether something qualifies, don't count it. Never invent an achievement that isn't actually described in the resume text.",
        },
        { role: "user", content: resumeText },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const toCount = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
    return {
      wins: toCount(parsed.wins),
      leadershipMoments: toCount(parsed.leadershipMoments),
      problemsSolved: toCount(parsed.problemsSolved),
      seniorStakeholderInteractions: toCount(parsed.seniorStakeholderInteractions),
    };
  } catch (err) {
    console.error("analyzeResumeCareerStats failed:", err);
    Sentry.captureException(err);
    return null;
  }
}

export type QuarterStats = {
  total: number;
  competencyStories: number;
  distinctCompetencies: number;
  metricStories: number;
};

// "You vs. You" -- a calendar-quarter benchmark, distinct in kind from
// generateGrowthNarrative above: that one hunts for a narrative pattern
// across a user's whole history and stays silent if it can't find one; this
// one is a fixed quarterly ritual (see app/api/quarterly-benchmark/run) that
// ALWAYS reports back honestly, including "a steady quarter, consistent
// with the one before" when nothing dramatic changed -- the value here is
// the check-in itself happening on schedule, not a manufactured story every
// time. Grounded in real counts (computed by the caller from actual memory
// rows, not estimated by the model) plus a small sample of the quarter's
// actual stories for concrete texture. Returns null only on a hard failure
// (API error, unparseable response) -- unlike generateGrowthNarrative, an
// unremarkable quarter is still a valid, expected result, not a reason to
// return null.
export async function generateQuarterlyBenchmark(
  current: QuarterStats & { label: string },
  prior: QuarterStats & { label: string },
  sampleMemories: Memory[],
  firstName?: string | null
): Promise<string | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const statsLine = (label: string, s: QuarterStats) =>
      `${label}: ${s.total} memories captured, ${s.competencyStories} showed a genuine interview-worthy competency (across ${s.distinctCompetencies} distinct competencies), ${s.metricStories} were backed by a real number.`;
    const samples = sampleMemories
      .slice(0, 6)
      .map((m) => `- "${m.title}": ${m.summary ?? m.transcript.slice(0, 200)}`)
      .join("\n");
    const listing =
      `${statsLine(current.label, current)}\n${statsLine(prior.label, prior)}\n\n` +
      `A few real stories from ${current.label} for concrete texture:\n${samples || "(none)"}`;
    const nameHint = firstName ? ` The person's first name is ${firstName} -- you may use it once, if it feels natural, but don't force it.` : "";
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write a short, honest, personal quarterly check-in for a user of a career-memory app, comparing their most recently finished quarter against the one before it. You're given each quarter's real counts and a few real story titles/summaries from the recent quarter for grounding." +
            nameHint +
            ' Respond ONLY with JSON: {"reflection": string}. ' +
            "Write 2-4 sentences, second person, SAME language as most of the sample stories (default English if mixed/unclear/no samples) -- like a coach reviewing the quarter WITH the person, not a dashboard read aloud. Weave the real numbers in naturally rather than listing them, and if a sample story adds something concrete and specific, reference it briefly. " +
            "If the two quarters are honestly similar -- no real change in volume, breadth, or substance -- say that plainly and warmly (e.g. a steady quarter, consistent effort, nothing dramatically different) rather than inventing a shift that isn't there. The point of this check-in is honesty on a schedule, not manufactured hype every time. " +
            "Never invent a number, story detail, or competency that isn't in what you were given.",
        },
        { role: "user", content: listing },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.reflection !== "string" || !parsed.reflection.trim()) return null;
    return parsed.reflection.trim().slice(0, 800);
  } catch (err) {
    console.error("generateQuarterlyBenchmark failed:", err);
    Sentry.captureException(err);
    return null;
  }
}

// The "someone's actually proud of you" push -- distinct in kind from every
// other reflective feature above (weekly recap, growth narrative, quarterly
// benchmark), which all summarize or find a pattern across MANY memories.
// This one goes the other way: given a small batch of memories the user
// already flagged as selfMinimized at save time (see the field above), it
// picks the SINGLE strongest one and writes back exactly what they
// undersold, grounded in a real detail, unprompted. See
// shouldSurfaceUnderplayedWin in lib/repo/underplayedWins.ts for the cadence
// gate that keeps this rare (called by app/api/underplayed-win/run), and
// listSelfMinimizedCandidates in lib/repo/memories.ts for how candidates are
// selected (unsurfaced, selfMinimized memories only).
// Returns null on any failure OR if nothing in the batch is genuinely strong
// enough -- callers should just skip that user this cycle rather than force
// a weak one out just to hit a schedule.
export async function generateUnderplayedWinCallout(
  candidates: Memory[],
  firstName?: string | null
): Promise<{ memoryId: string; message: string } | null> {
  const openai = getClient();
  if (!openai || candidates.length === 0) return null;
  try {
    const listing = candidates
      .map((m) => {
        const competencies = safeParseStringArray(m.competencies);
        return (
          `id: ${m.id}\nTitle: ${m.title}${competencies.length ? `\nCompetencies: ${competencies.join(", ")}` : ""}\n` +
          `Story: ${m.summary ?? m.transcript.slice(0, 400)}\nWhy it was flagged: ${m.self_minimized_reason ?? "(not recorded)"}`
        );
      })
      .join("\n\n---\n\n");
    const nameHint = firstName
      ? ` The person's first name is ${firstName} -- you may open with it if it feels natural, but don't force it.`
      : "";
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You're given a short list of a user's personal memories (from a career-memory app) that were each flagged as describing a real accomplishment in flat or self-minimizing language -- the person genuinely undersold what they did. Your job: pick the ONE strongest, clearest example, and write a short message that notices it, unprompted, the way a friend or mentor would if they'd actually caught it in the moment." +
            nameHint +
            ' Respond ONLY with JSON: {"memoryId": string or null, "message": string or null}. ' +
            "memoryId must EXACTLY match one of the provided ids, or null if none of them is genuinely strong enough to be worth a message on its own -- don't force a pick from a weak batch. " +
            "message (SAME language as that memory, 1-3 sentences, second person): name the SPECIFIC thing they did (a real detail from the story -- what happened, what they handled, what it took) and point out, plainly and warmly, that they didn't seem to register it as a big deal. NOT coaching, NOT a generic compliment, NOT a call to action -- no 'keep it up', no 'you should be proud', no suggestion to go do anything. Just the observation itself, stated like someone who actually noticed and is genuinely a little surprised the person breezed past it. It should be obvious this was written about THIS specific story and would sound wrong attached to a different one. " +
            "Never invent a detail, outcome, or number that isn't in the story you were given.",
        },
        { role: "user", content: listing },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.memoryId !== "string" || typeof parsed.message !== "string" || !parsed.message.trim()) {
      return null;
    }
    const match = candidates.find((c) => c.id === parsed.memoryId);
    if (!match) return null;
    return { memoryId: match.id, message: parsed.message.trim().slice(0, 400) };
  } catch (err) {
    console.error("generateUnderplayedWinCallout failed:", err);
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
    // Bounded well under a normal reverse-proxy read timeout (this call sits
    // in front of embedText + chatCompletion in the sendUserMessageAndGetReply
    // chain -- see that function's comment -- so an unbounded hang here stalls
    // the whole reply). Fails soft into the original text below either way,
    // so a timeout just means losing the cross-language retrieval boost for
    // this one message, never a broken response.
    const completion = await openai.chat.completions.create(
      {
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
      },
      { timeout: 12_000 }
    );
    const translated = completion.choices[0]?.message?.content?.trim();
    return translated || text;
  } catch (err) {
    console.error("translateToEnglish failed:", err);
    Sentry.captureException(err);
    return text;
  }
}

// Short (3-6 word) chat title generated from the first message in a chat —
// the same idea as ChatGPT/Claude auto-titling a new conversation. Without
// this, every chat started from the same quick action ("Interview
// Preparation", "General Chat", ...) keeps that literal template name as
// its title forever, so the Chats list becomes a wall of identical labels
// and the only way to tell conversations apart is opening each one. The
// starting category (Interview/Resume/etc.) is tracked separately on
// chat.category and unaffected by this — it's shown as its own small badge
// in the UI instead of being baked into the title text.
//
// Called TWICE per chat, not once (see chatService.ts): first right away
// with just the user's opening line, so the chat has *some* real title
// immediately; then again once the AI's first reply exists, passing both
// messages so the model has actual substance to be specific about. The
// first call alone reliably produces exactly the generic-sounding titles
// this is supposed to avoid -- "Tomorrow I have an interview which is..."
// or "I need to update my resume..." on their own carry almost no concrete
// detail (no company, role, topic, or deadline named yet), so even a model
// faithfully following "be specific" ends up re-deriving the category
// ("Interview Preparation Tips", "Resume Update Tips") because that's
// genuinely the most specific thing available at that point. The second
// pass (aiReply present) is the one expected to actually land on something
// concrete, the same way generateMemoryMetadata's title works from a full
// transcript rather than one line -- and its result overwrites the first
// guess. Returns null on any failure so the caller just keeps whatever
// title it already has rather than erroring the message send over a
// cosmetic feature.
export async function generateChatTitle(userMessage: string, aiReply?: string | null): Promise<string | null> {
  const openai = getClient();
  if (!openai) return null;
  const contextText = aiReply ? `User: ${userMessage}\nAssistant: ${aiReply}` : userMessage;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Generate a short chat title, 3-6 words, that names the SPECIFIC subject of this conversation, in the SAME language as the messages. " +
            "Pull out whatever concrete detail is actually present -- a company or role name, a specific topic, skill, deadline, question, or decision -- the same way you'd title one specific memory, not a generic category label. " +
            "NEVER produce a generic templated title like 'Resume Update Tips', 'Interview Preparation Tips', 'Interview Preparation', 'General Chat', or any '<topic> Tips' / '<topic> Preparation' pattern -- these give the user no way to tell one chat apart from another with the same starting category. " +
            "If nothing concrete has been said yet and the only honest option IS a generic label, prefer a short literal echo of the user's actual words over a category name (e.g. 'Interview Tomorrow' rather than 'Interview Preparation Tips'). " +
            "No quotes, no trailing punctuation. Respond with ONLY the title, nothing else.",
        },
        { role: "user", content: contextText },
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
    // Same reasoning as translateToEnglish's timeout just above: this sits
    // mid-chain in sendUserMessageAndGetReply, and the null return on
    // failure already has a defined, safe fallback (keyword retrieval), so
    // bounding it here only trades a slow/hung call for that existing
    // graceful degradation instead of a multi-minute stall.
    const res = await openai.embeddings.create(
      {
        model: EMBED_MODEL,
        input: text.slice(0, 8000),
      },
      { timeout: 12_000 }
    );
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
// thing as something else entirely. The `prompt` field below is meant as a
// steering hint for that case, not a restriction.
//
// IMPORTANT: keep this prompt written in English words only, even though
// it's *describing* Hindi/English code-switching. An earlier version of
// this prompt opened with an actual Hindi sentence ("यह एक व्यक्तिगत वॉयस
// नोट है।") as a same-language sample, on the theory that Whisper would
// treat it purely as "the kind of audio you're about to hear." In practice
// that backfired: Whisper conditions on the prompt's own text, so leading
// with real Devanagari script measurably biased short/ambiguous clips —
// including clearly spoken English ones — toward being decoded as Hindi.
// Reported by a real user: spoke in English, got back Hindi. Describing
// the code-switching in English (below) still steers Whisper to expect
// Hindi/English mixed speech without handing its decoder actual
// foreign-script tokens to latch onto, so English-only recordings are no
// longer nudged off course by the hint meant for a completely different
// case.
// "vibe coding" (letting an AI write code from natural-language prompts
// instead of hand-writing it) is a real, increasingly common term among
// this app's users, but on a short/unclear clip Whisper has no prior for
// it and can lock onto the much more common word "white" instead --
// reported by a real user: said "vibe coding", got back "white coding" in
// the transcript. Naming it explicitly here (once, plainly, no other
// vocabulary padding) gives Whisper's decoder the token sequence as
// context so it's no longer choosing blind between an unfamiliar term and
// a familiar-sounding one. Keep future additions to this list narrow and
// evidence-based (an actual reported mishearing), not a speculative
// jargon dump -- every extra token here is also extra text the
// prompt-echo guard below (looksLikePromptEcho) has to stay clear of.
const TRANSCRIBE_PROMPT =
  "This is a short personal voice memo about work, projects, or career moments. The speaker may talk in English, in Hindi, or naturally mix both languages within the same recording. They may use modern tech terms like 'vibe coding' (using AI to help write code).";

// Whisper treats the `prompt` above purely as a steering hint, but on audio
// it can't transcribe with confidence (too quiet, background noise, a bad
// mic capture on some devices, or a clip that's short/ambiguous for other
// reasons) it can fall back to echoing pieces of that prompt back as if it
// were the transcription, instead of returning empty text or erroring. That
// surfaced as a real bug: a user spoke ~15-20s of clear English and got back
// "व्यक्तिगत वॉयस नोट है." -- a verbatim chunk of TRANSCRIBE_PROMPT itself,
// not a translation or hallucination unrelated to it. Guard against that
// specific failure mode by checking whether the returned text is itself
// (mostly) contained in the prompt we fed in; if so, treat it the same as a
// failed transcription rather than silently handing the user back our own
// steering text. The length floor avoids false-positives on short genuine
// transcriptions that happen to share a common word ("English", "voice")
// with the prompt.
function looksLikePromptEcho(text: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[।.,!?"'‘’“”]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const normalizedText = normalize(text);
  if (normalizedText.length < 6) return false;
  const normalizedPrompt = normalize(TRANSCRIBE_PROMPT);
  return normalizedPrompt.includes(normalizedText);
}

// A second, broader hallucination guard on top of looksLikePromptEcho. The
// prompt-echo check only catches Whisper regurgitating OUR steering text --
// it doesn't catch the other well-documented Whisper failure mode: on
// silent, near-silent, or noise-only audio it can hallucinate entirely
// fluent, grammatically-plausible sentences in some language (often skewed
// toward whatever language the `prompt` hint nudged it toward, which is
// exactly why a bad/quiet mic capture on this feature tends to come back as
// confident-sounding but nonsensical Hindi). Requesting `verbose_json`
// exposes Whisper's own per-segment confidence signals, which is the
// documented way to catch this: a segment is considered silent/hallucinated
// when it reports high `no_speech_prob` together with low `avg_logprob`
// (OpenAI's own guidance for this pair of fields). If every segment in the
// response fails that test, the whole "transcription" is discarded rather
// than handed to the user as if it were their real speech.
function isLikelySilentSegment(segment: { no_speech_prob: number; avg_logprob: number }): boolean {
  return segment.no_speech_prob > 0.6 && segment.avg_logprob < -1;
}

// Whisper transcribes word-by-word/sound-by-sound with no real understanding
// of what the sentence as a whole means, so on an unfamiliar or slightly
// unclear word it can lock onto a common, similar-sounding word instead (the
// reported case: "vibe coding" heard as "white coding") -- and once that's
// baked into the transcript text, nothing downstream (including
// generateMemoryMetadata, which only ever sees this text, never the audio)
// has any way to know a mistake was even made. This is a second pass over
// the raw transcript, using the full sentence as context to catch and fix
// exactly that failure mode -- this is genuinely what gives products like
// ChatGPT/Claude voice their "it understood me even though I mumbled that
// bit" feel: it's not that the audio model itself is flawless, it's that a
// second, context-aware pass reviews the words as a whole rather than in
// isolation. Deliberately NOT a hardcoded list of specific terms (that would
// only ever cover cases someone happened to report) -- the model is asked to
// use judgment the same way a person re-reading their own auto-generated
// captions would: only fix a word/phrase that plainly doesn't belong given
// everything around it, and only when confident what was actually meant.
// Falls back to the original text on any failure, low confidence, or a
// response that looks like a rewrite rather than a light fix -- an
// unconfident "correction" that changes the user's actual words is a worse
// bug than the mishearing this exists to catch.
async function correctTranscriptionErrors(rawText: string): Promise<string> {
  const openai = getClient();
  // Not worth a round trip on empty/trivial text (nothing meaningful to get
  // wrong, and it'd just be spending money for no benefit).
  if (!openai || rawText.trim().length < 3) return rawText;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are reviewing a raw speech-to-text transcript of a short, informal personal voice memo about work, projects, or career moments (it may mix Hindi and English). " +
            "Speech-to-text engines sometimes mishear a word or short phrase and substitute a different, unrelated one that sounds similar but doesn't fit the meaning of the sentence -- often a newer or less common term (a technical term, product name, or piece of modern jargon) heard as a more common everyday word or phrase instead (for example, 'vibe coding' -- using AI to help write code -- misheard as 'white coding'). That's just one example, not an exhaustive list; the same kind of mistake can happen to any word. " +
            "Read the WHOLE transcript for context, then fix ONLY places like this: a specific word or short phrase that clearly does not fit the meaning of what's being said around it, where you are genuinely confident what the speaker actually said. Replace it with what was actually said. " +
            "Being unfamiliar with a word is NOT the same as it being wrong -- a name, a person's nickname, a made-up or invented project/product title, or slang you simply don't recognize is expected in a personal voice memo, and should be left exactly as transcribed even if you've never seen it before. Only correct a word when it plainly breaks the sentence's meaning (like a random unrelated object or action dropped into a sentence about something else) AND you're confident what was actually said -- never replace an unusual-sounding word with a more common/ordinary one just because the unusual one is unfamiliar to you. When genuinely torn, do nothing. " +
            "Do not do anything else. Do not paraphrase, summarize, reword for style, fix grammar or punctuation, translate, or otherwise polish the writing. Preserve the speaker's own words, sentence structure, repetition, and language exactly everywhere else, even where it sounds informal or awkward -- that's just how people actually talk. If you're not confident a word or phrase is a transcription error, leave it exactly as given; leaving a real mistake alone is far better than changing something that was actually correct. " +
            "Respond with ONLY the corrected transcript text -- no preamble, no quotes, no explanation.",
        },
        { role: "user", content: rawText },
      ],
    });
    const corrected = completion.choices[0]?.message?.content?.trim();
    if (!corrected) return rawText;
    // A light word-level fix barely changes the word count. A big swing
    // either way means the model likely rewrote/summarized/truncated
    // instead of doing the narrow fix asked for -- discard and keep the
    // original rather than risk handing back something that isn't really
    // the user's own words anymore.
    const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
    const rawWords = wordCount(rawText);
    const correctedWords = wordCount(corrected);
    if (rawWords > 0 && (correctedWords < rawWords * 0.6 || correctedWords > rawWords * 1.6)) {
      console.error("correctTranscriptionErrors: correction word count diverged too much, discarding:", {
        rawText,
        corrected,
      });
      Sentry.captureMessage("correctTranscriptionErrors divergent correction", { extra: { rawText, corrected } });
      return rawText;
    }
    return corrected;
  } catch (err) {
    console.error("correctTranscriptionErrors failed, keeping raw transcript:", err);
    Sentry.captureException(err);
    return rawText;
  }
}

export async function transcribeAudio(file: File): Promise<string | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      prompt: TRANSCRIBE_PROMPT,
      response_format: "verbose_json",
    });
    let text = (result.text ?? "").trim();

    const segments = result.segments;
    if (segments && segments.length > 0) {
      if (segments.every(isLikelySilentSegment)) {
        console.error("transcribeAudio: all segments low-confidence/no-speech, discarding hallucination:", text);
        Sentry.captureMessage("transcribeAudio no-speech hallucination", { extra: { text } });
        return null;
      }
      // Some recordings mix a real spoken portion with a silent lead-in/
      // trailing gap that Whisper still hallucinates over -- keep only the
      // segments that actually look like speech.
      text = segments
        .filter((s) => !isLikelySilentSegment(s))
        .map((s) => s.text.trim())
        .join(" ")
        .trim();
    }

    if (looksLikePromptEcho(text)) {
      console.error("transcribeAudio: discarding prompt-echo hallucination:", text);
      Sentry.captureMessage("transcribeAudio prompt-echo hallucination", { extra: { text } });
      return null;
    }
    // Context-aware cleanup pass -- see correctTranscriptionErrors above.
    // Runs on the raw Whisper output before it's ever saved, so the
    // transcript the user actually sees (and that everything downstream is
    // built from) already reflects the fix, not just the AI-generated
    // summary layer.
    return await correctTranscriptionErrors(text);
  } catch (err) {
    console.error("transcribeAudio failed:", err);
    Sentry.captureException(err);
    return null;
  }
}

// Reads an AI chat reply aloud (the speaker button on each response — see
// api/chats/speak/route.ts, which is the only caller). This is the paid
// fallback path only: ChatBubble.tsx tries the browser's free built-in
// speechSynthesis first and calls this route solely when that silently
// fails (the well-known Android WebView getVoices() bug). Kept server-side
// with OpenAI's TTS API rather than any other workaround because it's the
// one option that's guaranteed to produce audio regardless of WebView quirks.
export async function synthesizeSpeech(text: string): Promise<Buffer | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
      response_format: "mp3",
    });
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.error("synthesizeSpeech failed:", err);
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
- When a PERSONAL answer is for interview prep (the user needs to actually say this out loud to an interviewer), use the STAR shape — Situation, Task, Action, Result — as a mental checklist for what to cover, not a rigid template you must force onto every answer. Don't default to four robotically-labeled parts every time. Answer the way a warm, well-prepared person would actually talk out loud: sometimes that's a short flowing narrative, sometimes leading with the result and filling in context after, sometimes explicit labeled STAR for a genuinely complex example. Pick whatever shape best fits the question and the memory, always grounded strictly in that memory's real details, and never lose the concrete outcome/impact. If the user has explicitly asked for STAR (or any other specific format) earlier in this conversation, keep honoring that request.
- When you reference a specific memory, refer to it by its title so the user knows which one you mean.
- Every single answer, no exceptions, should feel warm — like a sharp, encouraging career coach who's genuinely in the user's corner, not a clinical or generic chatbot. Stay concise and practical, but never cold or template-y, even for GENERIC questions or short factual replies.
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
// YYYY-MM-DD in IST wall-clock terms -- used both to tell the model what
// "today" is when it's estimating a futureCheckin targetDate (see
// generateMemoryMetadata above; this function declaration is hoisted, so
// it's callable there even though it's defined later in the file, same as
// every other helper here) and to validate that estimate in code afterward.
function istDateString(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

// How far out a futureCheckin targetDate is allowed to be -- generous enough
// to cover "next quarter's review" without letting a model hallucination (or
// a genuinely ambiguous transcript) create a check-in that would surface,
// unexplained, six months from now.
const MAX_CHECKIN_HORIZON_DAYS = 120;

// Validates the model's raw futureCheckin guess against today's actual date
// (see the todayIso context given in the prompt above) rather than trusting
// it verbatim -- discards it (returns null) rather than clamping to some
// nearby date, since a check-in whose date got silently "corrected" could
// end up asking about the wrong thing entirely.
function validateFutureCheckin(raw: unknown, todayIso: string): { question: string; targetDate: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const question = typeof obj.question === "string" ? obj.question.trim().slice(0, 300) : "";
  const targetDate = typeof obj.targetDate === "string" ? obj.targetDate.trim() : "";
  if (!question || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  // Compare as plain date strings (both already YYYY-MM-DD) rather than
  // parsing to Date objects -- avoids any timezone-shift surprises, since
  // these are meant to be IST calendar dates, not instants.
  if (targetDate < todayIso) return null;
  const horizonIso = new Date(
    new Date(`${todayIso}T00:00:00Z`).getTime() + MAX_CHECKIN_HORIZON_DAYS * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);
  if (targetDate > horizonIso) return null;
  return { question, targetDate };
}

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

// "Human angle" tone guidance -- without this, the chat AI is functionally
// a lookup tool that happens to write full sentences: correct, but flat.
// Deliberately narrow and occasion-gated (see the "sparingly" language
// below) rather than "always be warm," because a compliment attached to
// every single reply stops registering as genuine within a few messages and
// starts reading as a tic -- the same reasoning behind gating the Record
// page's praise popup on a real competency match rather than firing on
// every memory. Applied in BOTH buildSystemPrompt branches below (with and
// without matched memories) so the tone is consistent either way, even
// though the memory-specific opportunities to use it only exist when
// memories are actually present.
const warmthContext = `\n\nTone: you're a supportive coach the user actually knows, not a neutral lookup tool. When you're giving a PERSONAL answer and a memory you're drawing on shows something genuinely admirable -- real initiative, growth, a hard problem solved well -- it's good to briefly acknowledge that in passing, in a short clause, not a paragraph. Use this sparingly: only when it genuinely fits what's being asked, never in every reply, and never in place of or delaying the actual answer. Skip it entirely for GENERIC questions -- those should just be answered directly.`;

// The "you're a coach who actually knows this person" layer, part 2: their
// first name. Deliberately worded the same way as warmthContext above --
// "occasionally," "sparingly," "never forced" -- because a name dropped into
// every single reply reads like a mail-merge, not familiarity. Omitted
// entirely (see buildSystemPrompt) when the caller doesn't have a name to
// give it, rather than falling back to something generic like "there."
function nameContext(firstName: string): string {
  return `\n\nThe user's first name is ${firstName}. You can address them by name occasionally when it genuinely fits -- opening a reply, or a warm aside -- but not in every message, and never forced into a spot that doesn't call for it.`;
}

// Renders cross-chat recall context (see the messages.embedding column
// comment in lib/db.ts, and retrieveRelevantMemories in lib/retrieval.ts):
// things the user said in a DIFFERENT conversation that were never saved as
// a formal Memory. Deliberately kept separate from the Memory blocks below,
// with its own lower-confidence framing and a nudge-to-save instruction --
// per the product decision this exists to serve ("Recall + suggest saving
// it"), the model should use these when relevant but never treat a raw,
// un-curated chat aside with the same authority as a memory that was
// actually reviewed and saved.
function recalledMessagesContext(recalledMessages: RecalledMessage[]): string {
  if (recalledMessages.length === 0) return "";
  const items = recalledMessages
    .map((r) => `- (said on ${r.createdAt.slice(0, 10)}, in a different conversation) "${r.content}"`)
    .join("\n");
  return `\n\nThe user also said the following in OTHER past conversations. These were never saved as a formal memory -- they're just raw things the user mentioned in passing, with no title, category, or curation behind them, so treat them as lower-confidence than the memories above (or than a memory-based answer if there are no memories at all). Use one only if it's genuinely relevant to the current question; don't force it in. If you do rely on one to answer, briefly (one short clause, not a separate paragraph) suggest the user save it as a proper memory so it's easier to find next time.\n\n${items}`;
}

// The "someone who actually knows the people/projects in your life" layer:
// names that recur across MULTIPLE memories (see listRecurringEntities in
// lib/repo/memories.ts, which does the counting/filtering -- this function
// only renders whatever it's handed). Deliberately separate from any single
// memory's own Entities field in the context block below: a name mentioned
// once isn't a "recurring" glossary entry, and the point of this layer is
// specifically the recognition of a pattern across memories, not just
// echoing back one memory's transcript. Same "occasionally, never forced"
// framing as warmthContext/nameContext above.
function recurringEntitiesContext(recurringEntities: { name: string; count: number }[]): string {
  if (recurringEntities.length === 0) return "";
  const names = recurringEntities.map((e) => e.name).join(", ");
  return `\n\nNames/teams/projects that come up repeatedly across this user's memories: ${names}. When one of these is genuinely relevant to the current question, it's good to refer to it naturally by name (e.g. "how did the rollout with Priya go?") instead of generic phrasing ("your colleague") -- it reads as actually knowing them. Use this occasionally, only when it fits naturally; never force a name in, and never treat this list itself as something to explain or reference directly ("I see Priya comes up a lot") -- just use the names the way a person who already knew this context would.`;
}

// Background context from an uploaded resume (see resume_text's comment in
// repo/users.ts and /api/profile/resume) -- deliberately framed as
// background the model already knows about the person, not something to
// recite or reference explicitly ("according to your resume..."). Truncated
// hard here as a second line of defense; /api/profile/resume already caps
// what gets stored, but system-prompt token budget is a different concern
// than storage, so this keeps a single long resume from crowding out actual
// memories in the same prompt.
const RESUME_CONTEXT_MAX_CHARS = 6000;

function resumeContext(resumeText: string | null | undefined): string {
  if (!resumeText) return "";
  const text = resumeText.length > RESUME_CONTEXT_MAX_CHARS ? `${resumeText.slice(0, RESUME_CONTEXT_MAX_CHARS)}…` : resumeText;
  return `\n\nThe user has also uploaded their resume, giving you background on their career so far (separate from their recorded memories below, which are specific first-person moments). Use it silently to understand their role, seniority, and history when relevant -- e.g. to make a resume line sound consistent with their actual experience, or to understand context a memory doesn't spell out -- but don't recite it back or announce that you're using it ("I see from your resume..."); just be someone who already knows their background.\n\nResume:\n${text}`;
}

export function buildSystemPrompt(
  // project_name is optional (rather than always present on Memory itself)
  // for the same reason MemoryCard's is -- see the comment there. Callers
  // that pass it through (chatService.ts, via withProjectNames) let the
  // model see and reason across project boundaries; callers that don't
  // (e.g. an older/other caller) simply lose that one context line below.
  memories: (Memory & { project_name?: string | null })[],
  now: Date = new Date(),
  firstName?: string | null,
  recalledMessages: RecalledMessage[] = [],
  recurringEntities: { name: string; count: number }[] = [],
  resumeText?: string | null,
  // Set by chatService.ts from retrieval.emptyProjectName (lib/retrieval.ts)
  // when the user named one of their own projects but nothing's filed under
  // it yet. See emptyProjectContext below -- this is what stops the model
  // from quietly presenting an unrelated memory as if it belonged to that
  // project just because a project name was recognized in the query.
  emptyProjectName: string | null = null,
  // Set by chatService.ts from retrieval.ambiguousProjectNames when the
  // query's project reference was a genuine tie between two or more of the
  // user's own projects (e.g. "sales" matching "Sales Planning," "Sales
  // Strategy," and "Sales Ops" equally -- see detectProjectMention in
  // lib/retrieval.ts). See ambiguousProjectCtx below.
  ambiguousProjectNames: string[] | null = null,
  // Set by chatService.ts from retrieval.outOfWindowProjectName -- a
  // project+date combination ("what did I do on Strivo last quarter") where
  // the project matched but nothing was filed under it in that specific
  // window. `memories` below are that project's memories generally (NOT
  // filtered to the requested window), so see outOfWindowProjectCtx for why
  // that distinction has to be spelled out to the model explicitly.
  outOfWindowProjectName: string | null = null
): string {
  const dateContext = `\n\nToday's date is ${todayIstLabel(now)} (India Standard Time). Use this to correctly judge date-relative questions ("today," "yesterday," "this week," a specific date, etc.) against each memory's Date field below. If a memory's date genuinely falls in the period the user is asking about, treat it as relevant with confidence -- do not hedge or claim "no relevant memory" out of uncertainty about what day it is; you now know.`;
  const nameCtx = firstName ? nameContext(firstName) : "";
  const recalledCtx = recalledMessagesContext(recalledMessages);
  const entitiesCtx = recurringEntitiesContext(recurringEntities);
  const resumeCtx = resumeContext(resumeText);
  const emptyProjectCtx = emptyProjectName
    ? `\n\nThe user appears to be asking about a project of theirs called "${emptyProjectName}" (Settings > Projects), but nothing has been filed under it yet. If that's genuinely what they're asking about, say so plainly -- nothing's there yet -- rather than treating any memory below as if it belonged to that project; none of them were actually matched to it.`
    : "";
  // Deliberately worded as an instruction to ASK, not to guess: retrieval
  // (lib/retrieval.ts) already decided this couldn't be resolved safely on
  // its own -- the memories below (if any) are from generic search, NOT
  // biased toward any one of these projects, so answering as if one of them
  // were obviously meant would likely be wrong.
  const ambiguousProjectCtx =
    ambiguousProjectNames && ambiguousProjectNames.length > 0
      ? `\n\nThe user's message seems to reference one of their projects (Settings > Projects), but the name given could equally mean any of these: ${ambiguousProjectNames.join(", ")}. Don't guess which one and don't quietly answer using memories below as if they belonged to one of these -- they weren't matched to any of them. Ask the user which project they mean, listing the options, unless the rest of the conversation already makes it unambiguous.`
      : "";
  // The user asked a DATE-scoped question about this project ("what did I
  // do on X last quarter") and nothing was actually filed under it in that
  // window -- but the project does have memories, listed below, just not
  // from the requested period. Without this, the model has no way to know
  // those memories aren't an answer to the date part of the question.
  const outOfWindowProjectCtx = outOfWindowProjectName
    ? `\n\nThe user asked about their "${outOfWindowProjectName}" project for a specific time period, but nothing is filed under that project from that specific window -- the memories below are from that project generally (other dates). Say plainly that nothing's recorded for that particular period before using them, rather than presenting them as if they were from the period asked about.`
    : "";
  if (memories.length === 0) {
    return `${SYSTEM_PROMPT_BASE}${dateContext}${warmthContext}${nameCtx}\n\nNo memories were retrieved for this question. If the question is PERSONAL (about the user's own experience), tell them plainly you don't have a relevant memory for that -- do not substitute generic advice as if it were personal, and do not fabricate; you can suggest what they might capture as a memory going forward. If the question is GENERIC (general knowledge, not about their own past), just answer it normally using your general knowledge -- no need to mention memories at all.${recalledCtx}${entitiesCtx}${resumeCtx}${emptyProjectCtx}${ambiguousProjectCtx}`;
  }
  const competencyContext = `\n\nEach memory below may list Competencies -- behavioral-interview qualities (Leadership, Problem-Solving, etc.) that memory was independently identified as genuinely demonstrating, generated when it was recorded (see generateMemoryMetadata). The user themselves may not realize a memory qualifies -- they might have just described a normal day, not framed it as a "leadership story." When asked for an example of a specific competency (e.g. "give me a leadership example," "tell me about a time you solved a problem"), actively use this field to find the match rather than only pattern-matching the user's own wording against the transcript, and you can point out to them that this is a strong example of that competency even if they didn't call it that themselves.`;
  // A memory's Project field (Settings > Projects -- see lib/repo/projects.ts
  // and detectProjectMention in lib/retrieval.ts) is what lets this prompt
  // support two related but different things the user asked for: (1) when
  // they name a project ("let's discuss Strivo app development"), the
  // memories below are already biased toward that project's own memories --
  // the model just needs to recognize which ones those are and talk about
  // the project as a whole using them; (2) when a DIFFERENT project's
  // memory is included too (retrieval deliberately doesn't hard-filter to
  // one project -- see retrieveRelevantMemories), the model should notice
  // and say so explicitly ("you showed strong stakeholder management during
  // the Gigafactory Outreach project too") rather than silently blending it
  // in as if it belonged to the project under discussion. Only added when
  // at least one memory actually carries a project_name -- otherwise every
  // memory belongs to no project and this would just be dead instruction.
  const hasProjectContext = memories.some((m) => m.project_name);
  const projectContext = hasProjectContext
    ? `\n\nSome memories below list a Project -- one of the user's own named projects (Settings > Projects). When the user is asking about a specific project by name, treat the memories tagged with that project as the actual answer to "what have I done on this." If a memory tagged with a DIFFERENT project is also relevant (e.g. it demonstrates a skill that matters to the project being discussed), don't just use it silently -- name the other project explicitly, the way a colleague who actually remembered would ("you handled something similar during the <other project> project"). Never invent a project a memory isn't actually tagged with, and don't mention the Project field at all for a memory that doesn't have one.`
    : "";
  const context = memories
    .map((m, i) => {
      const tags = safeParseStringArray(m.tags);
      const competencies = safeParseStringArray(m.competencies);
      return `Memory ${i + 1}: "${m.title}"\nCategory: ${m.category ?? "General"}${tags.length ? ` | Tags: ${tags.join(", ")}` : ""}${m.project_name ? `\nProject: ${m.project_name}` : ""}${competencies.length ? `\nCompetencies: ${competencies.join(", ")}` : ""}\nDate: ${m.created_at.slice(0, 10)}\nSummary: ${m.summary ?? "(no summary)"}\nFull transcript: ${m.transcript}`;
    })
    .join("\n\n---\n\n");
  return `${SYSTEM_PROMPT_BASE}${dateContext}${warmthContext}${nameCtx}${competencyContext}${projectContext}\n\nHere are the user's relevant memories for this conversation:\n\n${context}${recalledCtx}${entitiesCtx}${resumeCtx}${emptyProjectCtx}${ambiguousProjectCtx}${outOfWindowProjectCtx}`;
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
    // Was previously unbounded (SDK default is 10 minutes) -- on a request
    // that's already slow, that meant the reverse proxy in front of the app
    // would give up and return its own HTML error page long before this
    // promise ever settled, and the client would try to JSON-parse that HTML
    // (see the fetch in ChatDetailClient.tsx's send()) and show the user a
    // raw "Unexpected token '<'" parse error instead of anything meaningful.
    // Bounding it here means a genuinely slow/hung call instead resolves
    // into the existing, friendly `{ error }` path below well before any
    // proxy timeout fires.
    const completion = await openai.chat.completions.create(
      {
        model: CHAT_MODEL,
        temperature: 0.6,
        messages: [{ role: "system", content: systemPrompt }, ...history],
      },
      { timeout: 25_000 }
    );
    const reply = completion.choices[0]?.message?.content;
    if (!reply) return { error: "The AI returned an empty response." };
    return { reply };
  } catch (err) {
    console.error("chatCompletion failed:", err);
    Sentry.captureException(err);
    return { error: "The AI request failed. Please try again." };
  }
}
