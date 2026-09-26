// Google Analytics 4 Data API (read-only) integration for the admin growth
// funnel (see lib/repo/growthFunnel.ts) -- lets the dashboard show real
// website visitors and "Get the app" clicks (the google_play_click event
// fired by PlayStoreLink.tsx) without leaving Strivo or logging into GA4
// separately.
//
// Auth is a Google service account, not a browser OAuth login: create one
// in Google Cloud Console (APIs & Services -> Credentials -> Create
// Credentials -> Service Account), enable the "Google Analytics Data API"
// on that project, download its JSON key, then add that service account's
// email as a Viewer on the GA4 property (GA4 Admin -> Property Access
// Management -> "+" -> paste the service account email -> Viewer role).
// This file then signs its own short-lived access token (RS256 JWT bearer
// grant, straight from Node's crypto) instead of pulling in the full
// `googleapis` SDK for what's really two REST calls.
//
// Requires three env vars, set on the server (never committed):
//   GA4_PROPERTY_ID                 -- the numeric property id (GA4 Admin
//                                      -> Property details -> Property ID,
//                                      NOT the "G-XXXXXXX" measurement id)
//   GA4_SERVICE_ACCOUNT_EMAIL       -- "client_email" from the downloaded
//                                      JSON key
//   GA4_SERVICE_ACCOUNT_PRIVATE_KEY -- "private_key" from that same JSON
//                                      key, pasted as-is (its literal \n
//                                      sequences are un-escaped below)
// Until all three are set, everything here reports "not configured"
// instead of failing -- same convention as SENTRY_API_TOKEN in lib/sentry.ts.
import crypto from "node:crypto";

export function ga4Configured(): boolean {
  return !!(
    process.env.GA4_PROPERTY_ID &&
    process.env.GA4_SERVICE_ACCOUNT_EMAIL &&
    process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Signs a fresh 1-hour access token for the analytics.readonly scope on
// every call rather than caching one in memory -- the admin dashboard's
// growth-funnel route is hit at most a few times a minute by one person,
// so the extra ~200ms round trip to Google is simpler and safer than a
// stateful cache that could serve a stale/expired token after a deploy.
async function getAccessToken(): Promise<string> {
  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL!;
  const rawKey = process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY!;
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );
  const signInput = `${header}.${claim}`;
  const signature = base64url(crypto.sign("RSA-SHA256", Buffer.from(signInput), privateKey));
  const jwt = `${signInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Google token exchange returned ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export type Ga4Summary = {
  sessions: number;
  googlePlayClicks: number;
  // Per-placement click breakdown (hero / nav / blog_cta / blog_nav /
  // blog_post_nav -- see PlayStoreLink.tsx's `location` prop), read from
  // the "link_location" event parameter. This only comes back non-empty
  // once link_location has been registered as a custom dimension in GA4
  // Admin -> Custom definitions -> Create custom dimension (scope: Event,
  // parameter: link_location) -- an optional one-time step; without it
  // this array is just empty, never wrong.
  clicksByLocation: { location: string; count: number }[];
  // Sessions broken down by GA4's own channel grouping (Direct, Organic
  // Search, Paid Social, Email, Referral, ...) -- a BUILT-IN dimension, no
  // registration needed. This is the "where is my traffic actually coming
  // from" view the founder has asked for since the very start of this
  // funnel work (email blast vs. thestrategystory.com vs. social).
  visitorsBySource: { source: string; count: number }[];
};

async function runReport(propertyId: string, token: string, body: unknown) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GA4 Data API returned ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

type Ga4Row = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };

// startDate is an explicit "YYYY-MM-DD" (GA4's Data API only does
// whole-calendar-day ranges, no hour/minute granularity) rather than a
// relative "NdaysAgo" -- see growthFunnel.ts's FUNNEL_TRACKING_START for
// why this needs to be a fixed date, not a rolling window.
export async function fetchGa4Summary(startDate: string): Promise<Ga4Summary> {
  const token = await getAccessToken();
  const propertyId = process.env.GA4_PROPERTY_ID!;
  const dateRange = { startDate, endDate: "today" };

  const sessionsData = await runReport(propertyId, token, {
    dateRanges: [dateRange],
    metrics: [{ name: "sessions" }],
  });
  const sessions = Number((sessionsData.rows as Ga4Row[] | undefined)?.[0]?.metricValues?.[0]?.value ?? 0);

  const sourceData = await runReport(propertyId, token, {
    dateRanges: [dateRange],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }],
  });
  const visitorsBySource = ((sourceData.rows as Ga4Row[] | undefined) ?? [])
    .map((r) => ({
      source: r.dimensionValues?.[0]?.value || "(unassigned)",
      count: Number(r.metricValues?.[0]?.value ?? 0),
    }))
    .sort((a, b) => b.count - a.count);

  // eventName is a built-in GA4 dimension (no registration needed).
  // customEvent:link_location is an event-scoped custom dimension -- see
  // the clicksByLocation comment above for why it may legitimately come
  // back empty. Requesting both together, rather than two separate calls,
  // keeps this to two total requests to the Data API.
  let eventsData: { rows?: Ga4Row[] };
  try {
    eventsData = await runReport(propertyId, token, {
      dateRanges: [dateRange],
      dimensions: [{ name: "eventName" }, { name: "customEvent:link_location" }],
      metrics: [{ name: "eventCount" }],
    });
  } catch {
    // customEvent:link_location isn't registered yet -- fall back to just
    // eventName so the click TOTAL still comes through even without the
    // per-placement breakdown.
    eventsData = await runReport(propertyId, token, {
      dateRanges: [dateRange],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
    });
  }

  let googlePlayClicks = 0;
  const byLocation = new Map<string, number>();
  for (const r of eventsData.rows ?? []) {
    if (r.dimensionValues?.[0]?.value !== "google_play_click") continue;
    const n = Number(r.metricValues?.[0]?.value ?? 0);
    googlePlayClicks += n;
    const loc = r.dimensionValues?.[1]?.value;
    if (loc) byLocation.set(loc, (byLocation.get(loc) ?? 0) + n);
  }

  return {
    sessions,
    googlePlayClicks,
    clicksByLocation: [...byLocation.entries()]
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count),
    visitorsBySource,
  };
}
