import { getDb, newId, nowIso } from "@/lib/db";
import { FOUNDING_MEMBER_CAP } from "@/lib/config";
import { getUserById } from "@/lib/repo/users";
import type { FoundingMemberCardData } from "@/lib/founderCardImage";

export type FoundingMemberShare = {
  id: string;
  user_id: string;
  member_number: number;
  card_data: string;
  view_count: number;
  revoked: number;
  created_at: string;
};

// Public, real-time stats for the homepage's live counter (see the mid-page
// incentive lines in MarketingHome.tsx and the sticky bar). Deliberately
// a plain COUNT, not a MAX of founding_member_number -- see createUser()'s
// comment in repo/users.ts for why MAX is the right choice for handing out
// the NEXT number (safe against a hard-deleted row), but COUNT is the right
// choice for "how many people have actually joined" (a deleted account's
// number should still count as a seat that was taken, not quietly free one
// back up for display purposes). Capped display-side at FOUNDING_MEMBER_CAP
// even if the real count ever exceeds it (it won't under normal operation,
// since nothing here stops signups once the cap is hit -- see the
// migration comment on founding_member_number in lib/db.ts; a real
// enforced cutoff, if the founder ever wants one, is a separate change).
export function getFoundingMemberStats(): { count: number; cap: number } {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE founding_member_number IS NOT NULL`).get() as {
    c: number;
  };
  return { count: Math.min(row.c, FOUNDING_MEMBER_CAP), cap: FOUNDING_MEMBER_CAP };
}

// Deliberately NOT scoped by user_id -- this is the one read path meant to
// be reachable by a logged-out visitor via the public /fm/[shareId] link
// (same posture as getCareerWrappedShareById in repo/careerWrapped.ts).
// `revoked` is what keeps a pulled-down link from resolving, not an auth
// check.
export function getFoundingMemberShareById(id: string): FoundingMemberShare | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM founding_member_shares WHERE id = ? AND revoked = 0`).get(id) as
    | FoundingMemberShare
    | undefined;
}

export function incrementFoundingMemberShareViews(id: string): void {
  const db = getDb();
  db.prepare(`UPDATE founding_member_shares SET view_count = view_count + 1 WHERE id = ?`).run(id);
}

function getFoundingMemberShareForUser(userId: string): FoundingMemberShare | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM founding_member_shares WHERE user_id = ? AND revoked = 0`).get(userId) as
    | FoundingMemberShare
    | undefined;
}

// Idempotent by design -- unlike a Career Card (regenerated as evidence
// grows, so career_wrapped_shares allows many rows per user), a Founding
// Member number never changes, so there's exactly one share per user,
// enforced by founding_member_shares' own unique index on user_id as well
// as this lookup-before-insert. Called from the in-app page itself (a
// Server Component, see (app)/founding-member/page.tsx) rather than
// requiring an explicit "Generate" click the way Career Wrapped's card flow
// does -- there's no private data to review here, just this user's own
// name and number, so showing it immediately is the right default.
export function getOrCreateFoundingMemberShare(userId: string): FoundingMemberShare | null {
  const existing = getFoundingMemberShareForUser(userId);
  if (existing) return existing;

  const user = getUserById(userId);
  if (!user || user.founding_member_number === null) return null;

  const cardData: FoundingMemberCardData = {
    firstName: user.first_name || "Strivo",
    memberNumber: user.founding_member_number,
    cap: FOUNDING_MEMBER_CAP,
    joinedDateLabel: new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };

  const db = getDb();
  const id = newId("fmshare");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO founding_member_shares (id, user_id, member_number, card_data, view_count, revoked, created_at)
     VALUES (?, ?, ?, ?, 0, 0, ?)`
  ).run(id, userId, user.founding_member_number, JSON.stringify(cardData), ts);
  return db.prepare(`SELECT * FROM founding_member_shares WHERE id = ?`).get(id) as FoundingMemberShare;
}
