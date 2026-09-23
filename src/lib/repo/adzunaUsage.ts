import { getDb, newId, nowIso } from "@/lib/db";

// Self-tracked Adzuna call counter -- see the adzuna_api_calls comment in
// lib/db.ts for why this exists at all (Adzuna's API exposes no usage/
// quota-remaining data of its own). Every row is one call WE made; nothing
// here talks to Adzuna.

// Call once right after each real Adzuna request completes (see the
// caller in app/api/opportunities/refresh-pool/run/route.ts), regardless
// of whether that request succeeded -- a 429 or other failure still means
// a request went out over the network and, per Adzuna's default-limits
// tiers (25/min, 250/day, 1000/week, 2500/month -- see ADZUNA_APP_ID's
// comment in .env.example), a failed request in-flight is as likely to
// count against those windows as a successful one. Better to slightly
// over-count our own usage than tell the founder they have budget left
// when they don't.
export function recordAdzunaCall(): void {
  const db = getDb();
  db.prepare(`INSERT INTO adzuna_api_calls (id, called_at) VALUES (?, ?)`).run(newId("adzcall"), nowIso());
}

export function countAdzunaCallsSince(sinceIso: string): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as c FROM adzuna_api_calls WHERE called_at >= ?`).get(sinceIso) as {
    c: number;
  };
  return row.c;
}

export type AdzunaUsage = {
  callsThisMonth: number;
  callsToday: number;
  monthlyLimit: number;
  dailyLimit: number;
};

// Adzuna's own documented default limits (developer.adzuna.com/docs/
// terms_of_service): 25/minute, 250/day, 1,000/week, 2,500/month. Only the
// day and month windows are surfaced here -- a per-minute figure isn't
// meaningful to show on a dashboard that refreshes on a page load, and the
// weekly figure doesn't map cleanly onto how this product actually spends
// budget (one lump run, once a month), so month (the real ceiling on total
// spend) and today (the window a single refresh run could realistically
// blow through in one go, since one run is 975 calls -- see FUNCTIONS in
// refresh-pool/run) are the two that matter for deciding whether it's
// safe to click "Refresh job pool now" right now.
export function getAdzunaUsage(): AdzunaUsage {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  return {
    callsThisMonth: countAdzunaCallsSince(monthStart),
    callsToday: countAdzunaCallsSince(dayStart),
    monthlyLimit: 2500,
    dailyLimit: 250,
  };
}
