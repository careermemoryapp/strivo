import { getDb, newId, nowIso } from "@/lib/db";

export type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  profile_image: string | null;
  subscription_status: string;
  created_at: string;
};

export function createUser(input: {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
}): User {
  const db = getDb();
  const id = newId("user");
  const created_at = nowIso();
  db.prepare(
    `INSERT INTO users (id, first_name, last_name, email, password_hash, profile_image, subscription_status, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'free', ?)`
  ).run(id, input.firstName, input.lastName, input.email.toLowerCase().trim(), input.passwordHash, created_at);
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
