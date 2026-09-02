import { getUserById } from "@/lib/repo/users";
import { listMemoryDates } from "@/lib/repo/memories";

// Engagement-aware nudge cadence -- the layer behind /api/engagement-nudge/run.
// Before this existed, the only re-engagement mechanism was the admin's
// manual "nudge" composer (see repo/nudges.ts, app/api/admin/nudge): the
// founder hand-writes a message and blasts it to a whole segment (all /
// missed today / inactive) in one shot, with no per-user memory of who's
// already been reached or how recently. This module is what lets an
// AUTOMATED version of that same "nudge" notification type adapt itself to
// each person instead: someone recording daily gets left alone entirely,
// someone who's gone quiet for a week gets a light touch, and someone who's
// been gone for three weeks gets a much less frequent (but not silent)
// reminder -- rather than everyone getting the same message on the same
// schedule regardless of what they've actually been doing.
export type EngagementTier = "power" | "steady" | "cooling" | "dormant" | "new";

export type EngagementInfo = {
  tier: EngagementTier;
  // How many days must pass since the last automated nudge before another
  // one is due for this tier. 0 means "never nudge this tier at all" (see
  // isDueForEngagementNudge below) -- power users are already doing the
  // thing this nudge exists to encourage, so pinging them anyway would only
  // read as noise.
  cadenceDays: number;
  // Days since the signal this tier was computed from -- days since their
  // most recent memory for everyone with at least one, or days since
  // signup for someone with zero. Exposed mainly so callers/logs can see
  // WHY a tier was assigned, not just what it is.
  daysSinceSignal: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, now: Date): number {
  const diff = now.getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.floor(diff / DAY_MS));
}

// How long a brand-new, zero-memory account stays in the more encouraging
// "new" tier (frequent, first-memory-focused nudges) before falling back to
// the same cadence as a long-dormant user -- someone who's had a month to
// record a single memory and hasn't is a different situation than someone
// three days into their trial, and deserves a lighter touch, not more
// frequent pinging.
const NEW_USER_WINDOW_DAYS = 30;

// Classifies a user's current engagement into one of 5 tiers based on real
// usage (last_active_at / memory-recording frequency), not a fixed calendar
// schedule. See EngagementTier above for what each tier means; see
// ENGAGEMENT_MESSAGES below for the tone that goes with each.
export function computeEngagementTier(userId: string, now: Date = new Date()): EngagementInfo {
  const user = getUserById(userId);
  if (!user) return { tier: "dormant", cadenceDays: 12, daysSinceSignal: 999 };

  const dates = listMemoryDates(userId); // YYYY-MM-DD, most recent first
  if (dates.length === 0) {
    const daysSinceSignup = daysBetween(user.created_at, now);
    if (daysSinceSignup > NEW_USER_WINDOW_DAYS) {
      return { tier: "dormant", cadenceDays: 12, daysSinceSignal: daysSinceSignup };
    }
    return { tier: "new", cadenceDays: 3, daysSinceSignal: daysSinceSignup };
  }

  const daysSinceLastMemory = daysBetween(`${dates[0]}T00:00:00Z`, now);
  const recentCount = dates.filter((d) => daysBetween(`${d}T00:00:00Z`, now) <= 7).length;

  // Already doing the thing this nudge exists to encourage -- leave them
  // alone. cadenceDays: 0 is the explicit "never" signal isDueForEngagementNudge
  // checks for below, rather than relying on a very large number.
  if (daysSinceLastMemory <= 2 || recentCount >= 3) {
    return { tier: "power", cadenceDays: 0, daysSinceSignal: daysSinceLastMemory };
  }
  if (daysSinceLastMemory <= 7) {
    return { tier: "steady", cadenceDays: 7, daysSinceSignal: daysSinceLastMemory };
  }
  if (daysSinceLastMemory <= 20) {
    return { tier: "cooling", cadenceDays: 5, daysSinceSignal: daysSinceLastMemory };
  }
  return { tier: "dormant", cadenceDays: 12, daysSinceSignal: daysSinceLastMemory };
}

// Whether it's actually time to send this user another automated
// engagement nudge -- true only if their tier ever nudges at all
// (cadenceDays > 0) AND enough time has passed since the last one (or none
// has ever been sent). Kept separate from computeEngagementTier so the
// "should I send" decision and the "what tier are they" question can be
// tested/read independently.
export function isDueForEngagementNudge(info: EngagementInfo, lastNudgeAtIso: string | null, now: Date = new Date()): boolean {
  if (info.cadenceDays <= 0) return false;
  if (!lastNudgeAtIso) return true;
  return daysBetween(lastNudgeAtIso, now) >= info.cadenceDays;
}

type TierCopy = { title: string; variants: string[] };

// Two hand-written variants per tier (never the "power" tier, which is
// never nudged at all) -- rotated by a deterministic-but-changing pick (see
// pickEngagementMessage below) purely so a second nudge to the same person
// doesn't read as the exact same canned line as the first. Tone
// deliberately escalates in warmth/directness from "new" through "dormant",
// but stays low-pressure throughout -- "steady" toward "dormant" the point
// is a gentle door left open, not guilt about not having opened it yet.
const ENGAGEMENT_MESSAGES: Record<Exclude<EngagementTier, "power">, TierCopy> = {
  new: {
    title: "Your first memory",
    variants: [
      "Your first memory takes less than a minute to record — future-you will be glad you did.",
      "Nothing's saved yet. Even one quick memory today gives Strivo something to work with.",
    ],
  },
  steady: {
    title: "Got a minute?",
    variants: [
      "Something happened this week worth remembering? Takes less than a minute to capture.",
      "A quick one before it fades — what stood out this week?",
    ],
  },
  cooling: {
    title: "It's been a bit",
    variants: [
      "It's been a couple weeks — anything from that stretch worth capturing before it fades?",
      "Quiet couple of weeks here. Even a small moment is worth a minute to record.",
    ],
  },
  dormant: {
    title: "Still here when you are",
    variants: [
      "Whenever you're ready, Strivo's still here — even one memory a month adds up over time.",
      "No pressure — just a reminder that whatever you've been up to is worth capturing whenever you get to it.",
    ],
  },
};

// Deterministic-but-varying variant pick: alternates based on daysSinceSignal's
// parity rather than real randomness, so the choice is reproducible for a
// given call (easy to reason about/test) while still changing between sends
// as time passes, instead of a caller always getting the exact same string.
export function pickEngagementMessage(info: EngagementInfo): { title: string; body: string } | null {
  if (info.tier === "power") return null;
  const copy = ENGAGEMENT_MESSAGES[info.tier];
  const body = copy.variants[info.daysSinceSignal % copy.variants.length];
  return { title: copy.title, body };
}
