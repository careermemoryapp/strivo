// Microsoft Clarity Data Export API -- powers the "Daily insights" panel on
// the admin dashboard (see /api/admin/clarity-insights and
// clarityInsightsSnapshot.ts), so the founder gets a same-page summary of
// real visitor behavior instead of having to open clarity.microsoft.com
// every day (direct founder request, 2026-09-27).
//
// Reference: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
// (fetched 2026-09-27) PLUS a real live response captured the same day
// (see the shapes below) -- Microsoft's own docs only document Traffic's
// fields and explicitly warn "Additional metrics and dimensions may be
// included in the full API response." The first real run confirmed the
// following shapes; anything Clarity adds later that isn't one of these
// still gets a generic fallback (summarizeGeneric) rather than being
// silently dropped.
//
// Confirmed shapes (2026-09-27, one real /project-live-insights pull, no
// dimension requested):
//   Traffic          -- documented by Microsoft: totalSessionCount,
//                        totalBotSessionCount, distantUserCount,
//                        PagesPerSessionPercentage, + a dimension-named key
//   DeadClickCount, RageClickCount, ExcessiveScroll, QuickbackClick,
//   ScriptErrorCount, ErrorClickCount
//                     -- all six share one shape: sessionsCount,
//                        sessionsWithMetricPercentage,
//                        sessionsWithoutMetricPercentage, pagesViews,
//                        subTotal
//   ScrollDepth       -- { averageScrollDepth }
//   EngagementTime    -- { totalTime, activeTime }
//   Browser, Device, OS, Country/Region, PageTitle, ReferrerUrl,
//   PopularPages
//                     -- WITHOUT a dimension parameter, each of these came
//                        back as a single row that just restates the
//                        overall session count Traffic already reports --
//                        no per-browser/per-page breakdown at all (that
//                        only happens when the metric's own name is passed
//                        as a dimension value, e.g. dimension1=Device,
//                        which is exactly what the second call below
//                        does for Device). Skipped from the no-dimension
//                        pull's output for that reason -- not
//                        uninteresting, just redundant without a
//                        dimension, and rendering them raw (as this code
//                        originally did) just showed a confusing
//                        "sessionsCount: 61" with no category attached.
//
// This parses all of the above properly and falls back to a GENERIC
// summary (sums whatever numeric fields exist) only for a metric name that
// isn't one of these -- same defensive-parsing approach as
// singularReporting.ts and for the same reason: an honest "here's what
// came back" beats a confident-looking number built on a guessed key that
// happens to be wrong. If a summary line ever looks off, the raw response
// is kept in the snapshot (see clarityInsightsSnapshot.ts) so the parsing
// can be fixed without spending another request.
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
  // Added 2026-09-28: the admin panel's "Refresh insights" button was
  // surfacing the frontend's generic "Clarity refresh failed." fallback
  // (see runClarityRefresh in admin/page.tsx) instead of a real reason --
  // that fallback only shows when the POST response body isn't valid JSON
  // at all, which happens when something between here and the browser
  // times out the request before this function returns anything (the
  // route.ts try/catch always resolves valid JSON on its own, so a plain
  // hang was the only remaining explanation). A 15s timeout here turns
  // that silent hang into a real, readable error instead.
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error("Clarity Data Export API didn't respond within 15s -- Clarity may be having issues, or the daily request cap (10/project/day, shared with clarity.microsoft.com) was hit.");
    }
    throw new Error(`Couldn't reach the Clarity Data Export API: ${e instanceof Error ? e.message : String(e)}`);
  }
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

// Metrics that only say anything beyond the overall session count when
// broken down by a dimension -- see the header comment for how this was
// confirmed. Skipped entirely when parsing the no-dimension pull.
const SKIP_WITHOUT_DIMENSION = new Set([
  "Browser",
  "Device",
  "OS",
  "Country/Region",
  "PageTitle",
  "ReferrerUrl",
  "PopularPages",
]);

// The six click/scroll/error "quality" metrics share one confirmed shape
// (see header comment): sessionsWithMetricPercentage is the % of sessions
// that hit the issue, subTotal is the raw occurrence count. Reported
// together as one line rather than six, so a clean day reads as one
// reassuring sentence instead of six near-identical zero lines.
const QUALITY_METRIC_LABELS: Record<string, string> = {
  DeadClickCount: "dead clicks",
  RageClickCount: "rage clicks",
  ExcessiveScroll: "excessive scrolling",
  QuickbackClick: "quick-backs",
  ScriptErrorCount: "script errors",
  ErrorClickCount: "error clicks",
};

// Every other metric: field names aren't documented or confirmed, so this
// renders generically -- sum whatever numeric fields exist across the
// returned rows and show them by name, rather than assuming a specific
// shape. Only reached for a metric name this module doesn't recognize yet.
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
  const qualityFlags: string[] = [];
  let scrollDepthLine: string | null = null;
  let engagementLine: string | null = null;
  const extra: string[] = [];

  for (const metric of overall) {
    if (metric.metricName === "Traffic") {
      insights.push(...summarizeTraffic(metric.information, numOfDays));
      continue;
    }
    if (SKIP_WITHOUT_DIMENSION.has(metric.metricName)) continue;

    if (metric.metricName in QUALITY_METRIC_LABELS) {
      const row = metric.information[0];
      const pct = row ? numberFrom(row.sessionsWithMetricPercentage) : null;
      const count = row ? numberFrom(row.subTotal) : null;
      if (pct !== null && pct > 0) {
        const countPart = count !== null && count > 0 ? `, ${formatCount(count)} total` : "";
        qualityFlags.push(`${QUALITY_METRIC_LABELS[metric.metricName]} (${Math.round(pct)}% of sessions${countPart})`);
      }
      continue;
    }

    if (metric.metricName === "ScrollDepth") {
      const depth = numberFrom(metric.information[0]?.averageScrollDepth);
      if (depth !== null) scrollDepthLine = `Average scroll depth: ${Math.round(depth)}%.`;
      continue;
    }

    if (metric.metricName === "EngagementTime") {
      const active = numberFrom(metric.information[0]?.activeTime);
      const total = numberFrom(metric.information[0]?.totalTime);
      if (active !== null && total !== null) {
        engagementLine = `Average engagement: ${Math.round(active)}s active of ${Math.round(total)}s per session.`;
      }
      continue;
    }

    extra.push(...summarizeGeneric(metric.metricName, metric.information));
  }

  insights.push(
    qualityFlags.length > 0
      ? `Session quality flags: ${qualityFlags.join(", ")}.`
      : "No dead clicks, rage clicks, script errors, or other UX issues detected in the last 24h."
  );
  if (scrollDepthLine) insights.push(scrollDepthLine);
  if (engagementLine) insights.push(engagementLine);
  insights.push(...extra);

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
