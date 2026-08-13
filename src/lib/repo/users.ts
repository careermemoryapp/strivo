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
  created_at: string;
};

export type SubscriptionInfo = {
  status: "trial" | "active" | "expired";
  trialEndsAt: string | null;
  daysLeft: number | null;
  priceLabel: string;
};

const ANNUAL_PRICE_LABEL = "$14.99/year";

export function getSubscriptionInfo(user: Pick<User, "subscription_status" | "trial_ends_at">): SubscriptionInfo {
  if (user.subscription_status === "active") {
    return { status: "active", trialEndsAt: user.trial_ends_at, daysLeft: null, priceLabel: ANNUAL_PRICE_LABEL };
  }
  const endMs = user.trial_ends_at ? new Date(user.trial_ends_at).getTime() : null;
  if (endMs && endMs > Date.now()) {
    const daysLeft = Math.max(0, Math.ceil((endMs - Date.now()) / (24 * 60 * 60 * 1000)));
    return { status: "trial", trialEndsAt: user.trial_ends_at, daysLeft, priceLabel: ANNUAL_PRICE_LABEL };
  }
  return { status: "expired", trialEndsAt: user.trial_ends_at, daysLeft: 0, priceLabel: ANNUAL_PRICE_LABEL };
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
  // Every new account starts with a 6-month free trial.
  const trialEnd = new Date();
  trialEnd.setMonth(trialEnd.getMonth() + 6);
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
