import { getDb, nowIso } from "@/lib/db";

// What a user directly told Strivo they're looking for -- see the
// user_job_preferences table comment in lib/db.ts and the fuller
// explanation in lib/opportunities.ts (getOpportunitiesForUser) for how
// this combines with memory-derived suggested_roles. Each field is
// optional free text; "not stated" is null, never an empty string, so
// callers can tell "explicitly cleared" apart from "never set" the same
// way the rest of this codebase treats optional text columns.
export type JobPreferences = {
  city: string | null;
  function: string | null;
  industry: string | null;
};

const MAX_FIELD_LEN = 100;

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, MAX_FIELD_LEN);
  return trimmed.length > 0 ? trimmed : null;
}

export function getJobPreferences(userId: string): JobPreferences | null {
  const db = getDb();
  const row = db.prepare(`SELECT city, function, industry FROM user_job_preferences WHERE user_id = ?`).get(userId) as
    | JobPreferences
    | undefined;
  return row ?? null;
}

// Whether any field is actually set -- the common check callers want
// rather than reaching into the object themselves (e.g. "was anything
// stated at all" to decide whether the Opportunities tab should treat this
// person as matchable).
export function hasStatedPreferences(prefs: JobPreferences | null): boolean {
  return !!prefs && !!(prefs.city || prefs.function || prefs.industry);
}

// One row per user, overwritten in full each time -- this is "what they
// want right now," not a history (see the table comment in lib/db.ts).
// Passing null for a field clears it; omitting it from the input object is
// the same as passing null (this always writes all three columns).
export function setJobPreferences(
  userId: string,
  input: { city?: string | null; function?: string | null; industry?: string | null }
): JobPreferences {
  const db = getDb();
  const prefs: JobPreferences = {
    city: clean(input.city),
    function: clean(input.function),
    industry: clean(input.industry),
  };
  db.prepare(
    `INSERT INTO user_job_preferences (user_id, city, function, industry, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       city = excluded.city,
       function = excluded.function,
       industry = excluded.industry,
       updated_at = excluded.updated_at`
  ).run(userId, prefs.city, prefs.function, prefs.industry, nowIso());
  return prefs;
}
