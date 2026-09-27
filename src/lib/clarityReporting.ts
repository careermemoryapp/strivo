// Microsoft Clarity Data Export API -- powers the "Daily insights" panel on
// the admin dashboard (see /api/admin/clarity-insights and
// clarityInsightsSnapshot.ts), so the founder gets a same-page summary of
// real visitor behavior instead of having to open clarity.microsoft.com
// every day (direct founder request, 2026-09-27).
//
// Reference: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
// (fetched 2026-09-27). IMPORTANT: only ONE metric's response shape is
// actually documented there -- Traffic, whose `information` rows have
// totalSessionCount / totalBotSessionCount / distantUserCount /
// PagesPerSessionPercentage / plus a key named after whichever dimension
// was requested (e.g. "Device"). The docs explicitly warn "Additional
// metrics and dimensions may be included in the full API response" and
// give no field names at all for any other metric (ScrollDepth,
// EngagementTime, DeadClickCount, RageClickCount, ExcessiveScroll,
// QuickbackClick, ScriptErrorCount, ErrorClickCount, PopularPages, ...).
// So this parses Traffic properly (the one shape that's confirmed) and
// falls back to a GENERIC summary for every other metric -- it sums
// whatever numeric fields actually come back instead of guessing field
// names, same defensive-parsing approach as singularReporting.ts and for
// the same reason: an honest "here's what came back" beats a
// confident-looking number built on a guessed key that happens to be
// wrong. The first real run of this should be watched closely -- if a
// metric's summary line looks off, the raw response is kept in the
// snapshot (see clarityInsightsSnapshot.ts) so the parsing can be fixed
// without spending another request.
//
// Hard limits (per Microsoft's docs, "Limitations and usage quotas"): max
// 10 requests/project/day (shared with any manual digging done directly on
// clarity.microsoft.com the same day), max 3 dimensions per request,
// numOfDays in {1,2,3} only, response capped at 1000 rows (no
// pagination). fetchClarityInsights() below makes exactly 2 requests per
// call, so it should only be triggered a handful of times a day at most --
// see /api/admin/clarity-insights's own rate-limiting for the actual
// enforcement.

export function clarityReportingConfigured(): boolean {
  return !!process.env.CLARITY_API_TOKEN;
}

const BASE = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

type ClarityMetric = { metricName: string; information: Record<string, unknown>[] };

async function fetchOnce(token: string, numOfDays: 1 | 2 | 3, dimension1?: string): Promise<ClarityMetric[]> {
  const url = new URL(BASE);
  url.searchParams.set("numOfDays", String(numOfDays));
  if (dimension1) url.searchParams.set("dimension1", dimension1);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(json)) {
    const rawText = json === null ? await res.text().catch(() => "") : JSON.stringify(json);
    throw new Error(`Clarity Data Export API failed (HTTP ${res.status}): ${rawText}`);
  }
  return json as ClarityMetric[];
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// Traffic's fields are documented (see header comment) -- sum
// totalSessionCount/totalBotSessionCount across every information row
// (there's one row per value of whichever dimension was requested, or a
// single row when no dimension was passed) into one real-vs-bot line.
function summarizeTraffic(rows: Record<string, unknown>[], numOfDays: number): string[] {
  let sessions = 0;
  let bots = 0;
  let sawAny = false;
  for (const row of rows) {
    const s = numberFrom(row.totalSessionCount);
    const b = numberFrom(row.totalBotSessionCount);
    if (s !== null) {
      sessions += s;
      sawAny = true;
    }
    if (b !== null) bots += b;
  }
  if (!sawAny) return [];
  const windowLabel = numOfDays === 1 ? "last 24h" : `last ${numOfDays * 24}h`;
  const real = Math.max(sessions - bots, 0);
  return [`${formatCount(real)} real sessions in the ${windowLabel} (${formatCount(bots)} filtered out as bot traffic).`];
}

// Every other metric: field names aren't documented, so this renders
// generically -- sum whatever numeric fields exist across the returned
// rows and show them by name, rather than assuming a specific shape.
function summarizeGeneric(metricName: string, rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      const n = numberFrom(value);
      if (n === null) continue;
      totals.set(key, (totals.get(key) ?? 0) + n);
    }
  }
  if (totals.size === 0) return [];
  const parts = [...totals.entries()].map(([key, total]) => `${key}: ${formatCount(total)}`);
  return [`${metricName} — ${parts.join(", ")}.`];
}

export type FetchedClarityInsights = { insights: string[]; raw: ClarityMetric[]; numOfDays: 1 | 2 | 3 };

// Makes 2 API calls: one with no dimension (overall numbers, whatever
// metrics Clarity includes that day), one broken down by Device (so the
// summary can call out a mobile-vs-desktop skew -- directly relevant to a
// Play Store install funnel). Both against a 1-day window, since this is
// meant to answer "what happened since yesterday," not a rolling average.
export async function fetchClarityInsights(): Promise<FetchedClarityInsights> {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) throw new Error("CLARITY_API_TOKEN isn't set on the server yet.");

  const numOfDays = 1 as const;
  const [overall, byDevice] = await Promise.all([fetchOnce(token, numOfDays), fetchOnce(token, numOfDays, "Device")]);

  const insights: string[] = [];
  for (const metric of overall) {
    if (metric.metricName === "Traffic") insights.push(...summarizeTraffic(metric.information, numOfDays));
    else insights.push(...summarizeGeneric(metric.metricName, metric.information));
  }

  const trafficByDevice = byDevice.find((m) => m.metricName === "Traffic");
  if (trafficByDevice) {
    const withDevice = trafficByDevice.information
      .map((row) => ({ device: typeof row.Device === "string" ? row.Device : null, sessions: numberFrom(row.totalSessionCount) }))
      .filter((row): row is { device: string; sessions: number } => row.device !== null && row.sessions !== null);
    const total = withDevice.reduce((sum, row) => sum + row.sessions, 0);
    if (withDevice.length > 0 && total > 0) {
      const sorted = [...withDevice].sort((a, b) => b.sessions - a.sessions);
      insights.push(`By device: ${sorted.map((row) => `${row.device} ${Math.round((row.sessions / total) * 100)}%`).join(", ")}.`);
    }
  }

  const raw = [...overall, ...byDevice];
  if (insights.length === 0) {
    throw new Error(`Clarity returned data but nothing here recognized it — raw response: ${JSON.stringify(raw).slice(0, 2000)}`);
  }

  return { insights, raw, numOfDays };
}
