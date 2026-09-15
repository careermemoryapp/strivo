import { getDb, newId, nowIso } from "@/lib/db";

// A real, permanent project a user creates (Settings > Projects) that
// memories can be assigned to -- see the migration comment on the
// `projects` table and memories.project_id in lib/db.ts for why this
// exists instead of relying purely on the AI's free-text `entities`
// extraction to notice recurring project names.
export type Project = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export function listProjects(userId: string): Project[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM projects WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC`)
    .all(userId) as Project[];
}

export function getProjectById(userId: string, id: string): Project | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).get(id, userId) as Project | undefined;
}

// Case-insensitive exact-name lookup -- used when resolving the AI's
// suggested existing-project NAME (see generateMemoryMetadata, lib/ai.ts)
// back to a real row, and when creating a project, so "atlas" and "Atlas"
// resolve to the same project instead of silently creating a near-duplicate.
export function getProjectByName(userId: string, name: string): Project | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM projects WHERE user_id = ? AND name = ? COLLATE NOCASE`)
    .get(userId, name.trim()) as Project | undefined;
}

export function createProject(userId: string, name: string): Project {
  const db = getDb();
  const id = newId("proj");
  const now = nowIso();
  const trimmed = name.trim();
  db.prepare(`INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    userId,
    trimmed,
    now,
    now
  );
  return { id, user_id: userId, name: trimmed, created_at: now, updated_at: now };
}

export function renameProject(userId: string, id: string, name: string): void {
  const db = getDb();
  db.prepare(`UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    name.trim(),
    nowIso(),
    id,
    userId
  );
}

// Deleting a project never deletes the memories that were filed under it --
// they just fall back to "No project" (project_id NULL), same state as a
// memory that was never assigned one in the first place.
export function deleteProject(userId: string, id: string): void {
  const db = getDb();
  db.prepare(`UPDATE memories SET project_id = NULL WHERE project_id = ? AND user_id = ?`).run(id, userId);
  db.prepare(`DELETE FROM projects WHERE id = ? AND user_id = ?`).run(id, userId);
}

// How many memories currently point at each project -- shown next to each
// row in Settings > Projects so deleting one that's actually in use is an
// informed choice, not a surprise.
export function countMemoriesByProject(userId: string): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT project_id, COUNT(*) as c FROM memories WHERE user_id = ? AND project_id IS NOT NULL GROUP BY project_id`
    )
    .all(userId) as { project_id: string; c: number }[];
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.project_id] = row.c;
  return counts;
}
