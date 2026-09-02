import { MEMORY_CATEGORIES_LIST } from "@/lib/config";
import { countMemoriesByCategory } from "@/lib/repo/memories";

// Category-imbalance insight -- the layer behind /api/category-insight/run.
// If someone's logged twenty Work memories and zero Personal or Learning
// ones, that's a real, individual pattern worth reflecting back ("you've
// been heads-down on delivery lately — anything you've learned along the
// way worth capturing?") rather than treating every user's memory mix as
// equally healthy. This module does the actual pattern detection; the route
// just wires it up to notifyUser on a schedule.

// "General" is the AI's catch-all default for ambiguous transcripts (see
// CATEGORY_OPTIONS/generateMemoryMetadata in lib/ai.ts) -- its presence or
// absence isn't a meaningful signal about what someone is or isn't
// capturing, so it's excluded from both the dominant-category and
// absent-category checks below entirely.
const MEANINGFUL_CATEGORIES: string[] = MEMORY_CATEGORIES_LIST.filter((c) => c !== "General");

// Don't react to noise from someone with only a handful of memories total --
// a brand-new user with 3 Work memories and 0 Personal ones hasn't
// established a "pattern" yet, they've just started. This is the minimum
// count (across all meaningful categories combined) before this insight
// even looks at the distribution.
const MIN_TOTAL_MEMORIES = 8;

// How concentrated the dominant category needs to be (as a share of all
// meaningful-category memories) before it counts as "heads-down on one
// thing" rather than just "has more of one kind, as most people naturally
// will."
const DOMINANT_SHARE_THRESHOLD = 0.65;

// Needs at least this many OTHER meaningful categories sitting at exactly
// zero, not just "fewer than the dominant one" -- matches the product idea's
// own example ("zero Personal or Learning ones"). A category with a couple
// of entries isn't actually being neglected.
const MIN_ABSENT_CATEGORIES = 2;

// Natural-language framing for when a category is the DOMINANT one --
// "you've been ___ lately". Deliberately not just "logging a lot of Work
// memories," which reads clinical -- these are meant to sound like
// something a person who'd actually noticed the pattern would say.
const DOMINANT_PHRASE: Record<string, string> = {
  Work: "heads-down on delivery",
  Meeting: "living in meetings",
  Career: "focused on your career moves",
  Idea: "full of ideas",
  Review: "deep in reviews and feedback",
  Learning: "in learning mode",
  Achievement: "racking up wins",
  Personal: "capturing personal moments",
};

// Natural-language framing for when a category is the ABSENT one -- fills
// in "anything ___ worth capturing?". Phrased as a fragment that follows
// "anything", not a standalone sentence.
const ABSENT_NUDGE: Record<string, string> = {
  Work: "about what you've been working on",
  Meeting: "from a conversation that stuck with you",
  Career: "about how your career's moving",
  Idea: "from an idea you've been sitting on",
  Review: "from feedback you've given or received",
  Learning: "you've learned along the way",
  Achievement: "about a win",
  Personal: "outside of work",
};

// When more than MIN_ABSENT_CATEGORIES are absent, prefer calling out the
// more emotionally resonant ones first (Learning/Personal/Achievement read
// as genuinely worth prompting for) over the more procedural ones
// (Meeting/Review), which are less likely to feel like something was
// actually missed.
const ABSENT_PRIORITY = ["Learning", "Personal", "Achievement", "Idea", "Career", "Review", "Meeting", "Work"];

export type CategoryImbalanceInsight = {
  title: string;
  body: string;
  dominantCategory: string;
  absentCategory: string;
};

export function detectCategoryImbalance(userId: string): CategoryImbalanceInsight | null {
  const counts = countMemoriesByCategory(userId);
  const meaningfulTotal = MEANINGFUL_CATEGORIES.reduce((sum, c) => sum + (counts[c] ?? 0), 0);
  if (meaningfulTotal < MIN_TOTAL_MEMORIES) return null;

  let dominantCategory: string | null = null;
  let dominantCount = 0;
  for (const c of MEANINGFUL_CATEGORIES) {
    const n = counts[c] ?? 0;
    if (n > dominantCount) {
      dominantCount = n;
      dominantCategory = c;
    }
  }
  if (!dominantCategory || dominantCount / meaningfulTotal < DOMINANT_SHARE_THRESHOLD) return null;

  const absentCategories = MEANINGFUL_CATEGORIES.filter((c) => c !== dominantCategory && (counts[c] ?? 0) === 0);
  if (absentCategories.length < MIN_ABSENT_CATEGORIES) return null;

  const absentCategory = ABSENT_PRIORITY.find((c) => absentCategories.includes(c)) ?? absentCategories[0];

  return {
    title: "Noticed a pattern",
    body: `You've been ${DOMINANT_PHRASE[dominantCategory]} lately — anything ${ABSENT_NUDGE[absentCategory]} worth capturing?`,
    dominantCategory,
    absentCategory,
  };
}

// How long to wait before this insight can fire again for the same user,
// regardless of whether the underlying pattern is still there -- prevents
// re-flagging the identical "heads-down on Work" observation every time the
// job runs just because they still haven't logged a Personal memory. Not
// tied to whether the specific dominant/absent pair changed, since even a
// repeat of the same true pattern would feel repetitive sent more often
// than this.
const CATEGORY_INSIGHT_COOLDOWN_DAYS = 21;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isDueForCategoryInsight(lastSentAtIso: string | null, now: Date = new Date()): boolean {
  if (!lastSentAtIso) return true;
  const days = Math.floor((now.getTime() - new Date(lastSentAtIso).getTime()) / DAY_MS);
  return days >= CATEGORY_INSIGHT_COOLDOWN_DAYS;
}
