// Talks to Sentry's REST API (not the @sentry/nextjs SDK — that's a
// separate concern for *reporting* errors) so the admin dashboard can show
// "what's currently broken" without leaving Strivo. Read-only, admin-only.
//
// Requires a Sentry API token with `project:read` and `event:read` scopes,
// set as SENTRY_API_TOKEN. Until that's configured, everything here just
// reports "not configured" instead of failing.

const SENTRY_ORG = "strivo-4i";
const SENTRY_PROJECT = "javascript-nextjs";

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  count: number;
  userCount: number;
  lastSeen: string;
  firstSeen: string;
  permalink: string;
};

export function sentryConfigured(): boolean {
  return !!process.env.SENTRY_API_TOKEN;
}

// Raw shape of what Sentry's issues endpoint actually returns -- only the
// fields we use, since the real response has many more.
type SentryApiIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  count: string;
  userCount: number;
  lastSeen: string;
  firstSeen: string;
  permalink: string;
};

export async function fetchRecentSentryIssues(limit = 10): Promise<SentryIssue[]> {
  const token = process.env.SENTRY_API_TOKEN;
  if (!token) {
    throw new Error("SENTRY_API_TOKEN is not configured");
  }

  const params = new URLSearchParams({
    query: "is:unresolved",
    statsPeriod: "24h",
    sort: "freq",
    limit: String(limit),
  });
  const url = `https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Sentry API returned ${res.status}`);
  }

  const data = (await res.json()) as SentryApiIssue[];
  return data.map((issue) => ({
    id: issue.id,
    shortId: issue.shortId,
    title: issue.title,
    culprit: issue.culprit ?? null,
    level: issue.level,
    count: Number(issue.count),
    userCount: issue.userCount,
    lastSeen: issue.lastSeen,
    firstSeen: issue.firstSeen,
    permalink: issue.permalink,
  }));
}
