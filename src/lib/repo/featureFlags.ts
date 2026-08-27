import { getDb } from "@/lib/db";

// The fixed set of "kill switches" exposed in the admin panel -- each one
// gates a code path that either costs real money per call (OpenAI chat/
// transcription) or can fail loudly for every user at once (push sends).
// Adding a new switch means: add a key here, add its row to the seed list
// in lib/db.ts, and add the actual `isFeatureEnabled()` check at the call
// site it should guard.
export const FEATURE_FLAGS = [
  {
    key: "ai_chat",
    label: "AI chat",
    description: "Answering questions in Chats. Turning this off shows a friendly \"temporarily unavailable\" reply instead of calling OpenAI.",
  },
  {
    key: "uploads",
    label: "Record uploads",
    description: "Voice transcription and file (PDF/Word/PowerPoint/Excel) parsing on the Record page.",
  },
  {
    key: "push_notifications",
    label: "Push notifications",
    description: "Sending real push notifications to phones (admin nudges). The in-app experience is unaffected either way.",
  },
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]["key"];

export type FeatureFlagRow = {
  key: string;
  enabled: number;
  updated_at: string;
};

// Read-through, no caching: this is checked on the hot path of chat/upload/
// push requests, but it's a single indexed primary-key lookup against
// SQLite on the same machine, not a network call -- not worth the
// staleness risk of caching a kill switch, which exists specifically to
// take effect immediately.
export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT enabled FROM feature_flags WHERE key = ?`).get(key) as
    | { enabled: number }
    | undefined;
  // Missing row (shouldn't happen once the seed in db.ts has run, but fail
  // open rather than silently breaking a feature if it somehow is) defaults
  // to enabled.
  return row ? row.enabled === 1 : true;
}

export function getAllFeatureFlags(): (FeatureFlagRow & { label: string; description: string })[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM feature_flags`).all() as FeatureFlagRow[];
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return FEATURE_FLAGS.map((f) => {
    const row = byKey.get(f.key);
    return {
      key: f.key,
      label: f.label,
      description: f.description,
      enabled: row ? row.enabled : 1,
      updated_at: row?.updated_at ?? "",
    };
  });
}

export function setFeatureFlag(key: FeatureFlagKey, enabled: boolean) {
  const db = getDb();
  db.prepare(
    `INSERT INTO feature_flags (key, enabled, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
  ).run(key, enabled ? 1 : 0, new Date().toISOString());
}
