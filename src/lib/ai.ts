import OpenAI from "openai";
import * as Sentry from "@sentry/nextjs";
import type { Memory } from "@/lib/repo/memories";
import type { RecalledMessage } from "@/lib/retrieval";
import { MEMORY_CATEGORIES_LIST, MEMORY_COMPETENCIES_LIST } from "@/lib/config";

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
};

const CATEGORY_OPTIONS: string[] = [...MEMORY_CATEGORIES_LIST];

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
  now: Date = new Date()
): Promise<MemoryMetadata | null> {
  const openai = getClient();
  if (!openai) return null;
  const todayIso = istDateString(now);
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
    };
  } catch (err) {
    console.error("generateMemoryMetadata failed:", err);
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
  memories: Memory[],
  now: Date = new Date(),
  firstName?: string | null,
  recalledMessages: RecalledMessage[] = [],
  recurringEntities: { name: string; count: number }[] = [],
  resumeText?: string | null
): string {
  const dateContext = `\n\nToday's date is ${todayIstLabel(now)} (India Standard Time). Use this to correctly judge date-relative questions ("today," "yesterday," "this week," a specific date, etc.) against each memory's Date field below. If a memory's date genuinely falls in the period the user is asking about, treat it as relevant with confidence -- do not hedge or claim "no relevant memory" out of uncertainty about what day it is; you now know.`;
  const nameCtx = firstName ? nameContext(firstName) : "";
  const recalledCtx = recalledMessagesContext(recalledMessages);
  const entitiesCtx = recurringEntitiesContext(recurringEntities);
  const resumeCtx = resumeContext(resumeText);
  if (memories.length === 0) {
    return `${SYSTEM_PROMPT_BASE}${dateContext}${warmthContext}${nameCtx}\n\nNo memories were retrieved for this question. If the question is PERSONAL (about the user's own experience), tell them plainly you don't have a relevant memory for that -- do not substitute generic advice as if it were personal, and do not fabricate; you can suggest what they might capture as a memory going forward. If the question is GENERIC (general knowledge, not about their own past), just answer it normally using your general knowledge -- no need to mention memories at all.${recalledCtx}${entitiesCtx}${resumeCtx}`;
  }
  const competencyContext = `\n\nEach memory below may list Competencies -- behavioral-interview qualities (Leadership, Problem-Solving, etc.) that memory was independently identified as genuinely demonstrating, generated when it was recorded (see generateMemoryMetadata). The user themselves may not realize a memory qualifies -- they might have just described a normal day, not framed it as a "leadership story." When asked for an example of a specific competency (e.g. "give me a leadership example," "tell me about a time you solved a problem"), actively use this field to find the match rather than only pattern-matching the user's own wording against the transcript, and you can point out to them that this is a strong example of that competency even if they didn't call it that themselves.`;
  const context = memories
    .map((m, i) => {
      const tags = safeParseStringArray(m.tags);
      const competencies = safeParseStringArray(m.competencies);
      return `Memory ${i + 1}: "${m.title}"\nCategory: ${m.category ?? "General"}${tags.length ? ` | Tags: ${tags.join(", ")}` : ""}${competencies.length ? `\nCompetencies: ${competencies.join(", ")}` : ""}\nDate: ${m.created_at.slice(0, 10)}\nSummary: ${m.summary ?? "(no summary)"}\nFull transcript: ${m.transcript}`;
    })
    .join("\n\n---\n\n");
  return `${SYSTEM_PROMPT_BASE}${dateContext}${warmthContext}${nameCtx}${competencyContext}\n\nHere are the user's relevant memories for this conversation:\n\n${context}${recalledCtx}${entitiesCtx}${resumeCtx}`;
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
