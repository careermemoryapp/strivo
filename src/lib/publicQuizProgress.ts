import { CAREER_PROFILE_QUIZ_ORDER, type CareerProfileQuizId } from "@/lib/careerProfile";

// Client-only progress store for the public, no-login /quiz flow on the
// marketing site (strivo.ai) -- see the career_profile_public_shares
// comment in lib/db.ts for why there's no server-side per-visitor row to
// read this back from instead. Each quiz's scored result (already
// recomputed server-side by /api/public/career-profile/[quizId]/score, not
// trusted client math) is kept here across the 5 quizzes so /quiz/reveal
// can send the full set to /api/public/career-profile/share at the end.
//
// Deliberately NOT shared with anything the logged-in app touches --
// same "two separate systems" posture as career_profile_public_shares
// being its own table rather than a shared one.

const STORAGE_KEY = "strivo_public_career_profile_v1";

export type PublicQuizResult = {
  quizId: CareerProfileQuizId;
  resultKey: string;
  title: string;
  emoji: string;
  description: string;
  resultLabel: string;
};

type StoredProgress = Partial<Record<CareerProfileQuizId, PublicQuizResult>>;

function readAll(): StoredProgress {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as StoredProgress) : {};
  } catch {
    // Private-browsing/quota/corrupt-JSON edge cases -- never let a reader
    // throw, just treat it as "nothing saved yet".
    return {};
  }
}

function writeAll(progress: StoredProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Same posture as readAll -- a failed save just means this quiz's
    // result won't carry forward; not worth surfacing an error for.
  }
}

export function getPublicQuizProgress(): StoredProgress {
  return readAll();
}

export function savePublicQuizResult(result: PublicQuizResult): void {
  const progress = readAll();
  progress[result.quizId] = result;
  writeAll(progress);
}

export function isPublicQuizProgressComplete(progress: StoredProgress): boolean {
  return CAREER_PROFILE_QUIZ_ORDER.every((id) => progress[id]);
}

export function clearPublicQuizProgress(): void {
  writeAll({});
}
