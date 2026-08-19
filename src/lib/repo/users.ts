import { getDb, newId, nowIso } from "@/lib/db";

export type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  profile_image: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  dismissed_nudge_id: string | null;
  app_version: string | null;
  last_active_at: string | null;
  created_at: string;
};

export type SubscriptionInfo = {
  status: "trial" | "active" | "expired";
  trialEndsAt: string | null;
  daysLeft: number | null;
  priceLabel: string;
  monthlyPriceLabel: string;
  annualPriceLabel: string;
  annualListPriceLabel: string;
  trialMonths: number;
};

// Single source of truth for pricing. Billed exclusively through Google Play
// Billing (no Stripe/Razorpay) once payments go live, so these labels are
// display-only until the Play Billing integration is wired up.
export const TRIAL_MONTHS = 2;
export const MONTHLY_PRICE_LABEL = "$6.99/month";
export const ANNUAL_PRICE_LABEL = "$41.99/year";
// What 12 months would cost at the monthly rate — shown struck through next
// to the annual price so the "50% off" framing is self-evident.
export const ANNUAL_LIST_PRICE_LABEL = "$83.88/year";

export function getSubscriptionInfo(user: Pick<User, "subscription_status" | "trial_ends_at">): SubscriptionInfo {
  const shared = {
    priceLabel: ANNUAL_PRICE_LABEL,
    monthlyPriceLabel: MONTHLY_PRICE_LABEL,
    annualPriceLabel: ANNUAL_PRICE_LABEL,
    annualListPriceLabel: ANNUAL_LIST_PRICE_LABEL,
    trialMonths: TRIAL_MONTHS,
  };
  if (user.subscription_status === "active") {
    return { status: "active", trialEndsAt: user.trial_ends_at, daysLeft: null, ...shared };
  }
  const endMs = user.trial_ends_at ? new Date(user.trial_ends_at).getTime() : null;
  if (endMs && endMs > Date.now()) {
    const daysLeft = Math.max(0, Math.ceil((endMs - Date.now()) / (24 * 60 * 60 * 1000)));
    return { status: "trial", trialEndsAt: user.trial_ends_at, daysLeft, ...shared };
  }
  return { status: "expired", trialEndsAt: user.trial_ends_at, daysLeft: 0, ...shared };
}

export function createUser(input: {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
}): User {
  const db = getDb();
  const id = newId("user");
  const created_at = nowIso();
  // Every new account starts with a free trial (see TRIAL_MONTHS above).
  const trialEnd = new Date();
  trialEnd.setMonth(trialEnd.getMonth() + TRIAL_MONTHS);
  db.prepare(
    `INSERT INTO users (id, first_name, last_name, email, password_hash, profile_image, subscription_status, trial_ends_at, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'trial', ?, ?)`
  ).run(
    id,
    input.firstName,
    input.lastName,
    input.email.toLowerCase().trim(),
    input.passwordHash,
    trialEnd.toISOString(),
    created_at
  );
  return getUserById(id)!;
}

export function getUserByEmail(email: string): User | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(email.toLowerCase().trim()) as User | undefined;
}

export function getUserById(id: string): User | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as User | undefined;
}

export function updateUserProfile(
  id: string,
  input: Partial<Pick<User, "first_name" | "last_name" | "profile_image">>
): User | undefined {
  const db = getDb();
  const current = getUserById(id);
  if (!current) return undefined;
  const first_name = input.first_name ?? current.first_name;
  const last_name = input.last_name ?? current.last_name;
  const profile_image = input.profile_image ?? current.profile_image;
  db.prepare(
    `UPDATE users SET first_name = ?, last_name = ?, profile_image = ? WHERE id = ?`
  ).run(first_name, last_name, profile_image, id);
  return getUserById(id);
}

export function updateUserPassword(id: string, passwordHash: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, id);
}

export function deleteUser(id: string) {
  const db = getDb();
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

// Records that this user has seen & dismissed the given nudge, so it won't
// show again on Home even after the admin's active nudge changes to
// something newer (a fresh nudge id means it wasn't this one, so it'll
// show again — that's intentional).
export function setDismissedNudge(id: string, nudgeId: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET dismissed_nudge_id = ? WHERE id = ?`).run(nudgeId, id);
}

// Pinged once per native app open/resume (see useAppVersionPing.ts) so the
// admin Users table can show which build every native user is actually
// running, regardless of whether they've granted notification permission.
// Also stamps last_active_at with "now" — this same ping is the best signal
// we have for "when did this person last open the app," which powers the
// nudge audience segments in repo/pushTokens.ts.
export function setUserAppVersion(id: string, version: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET app_version = ?, last_active_at = ? WHERE id = ?`).run(version, nowIso(), id);
}

// Manual override for the admin panel — lets the founder grant or revoke
// "active" (paid) status by hand until real Google Play Billing is wired
// up (see TRIAL_MONTHS/pricing comments above). Only ever sets 'trial' or
// 'active': "expired" is always computed from trial_ends_at in
// getSubscriptionInfo, never stored, so it's not a settable value here.
export function setUserSubscriptionStatus(id: string, status: "trial" | "active") {
  const db = getDb();
  db.prepare(`UPDATE users SET subscription_status = ? WHERE id = ?`).run(status, id);
  return getUserById(id);
}
