// Singular Reporting API integration -- powers the "Installed the app" stage
// of the admin Growth Funnel (see lib/repo/growthFunnel.ts and
// singularInstallsSnapshot.ts). This is a DIFFERENT credential from the
// SINGULAR_SDK_KEY/SECRET in lib/singular.ts: those are the app-embedded
// SDK Integration keys (public by design); this is the Reporting API key,
// generated in Singular -> Developer Tools -> Reporting API Keys, and is a
// real secret, stored as SINGULAR_REPORTING_API_KEY on the server.
//
// Unlike GA4's Data API (lib/ga4.ts), Singular's Reporting API is
// ASYNCHRONOUS: you create a report job, poll until it's done, then
// download the actual data from a URL the poll response hands you. That
// doesn't fit a "load fresh on every page view" pattern the way GA4 does --
// a single report can legitimately take anywhere from a few seconds to
// (per Singular's own docs) up to ~30 minutes. So this is triggered
// on-demand (an admin clicks "Refresh installs"), not on every dashboard
// load -- see the growth-funnel admin route and singularInstallsSnapshot.ts
// for how the result gets cached and read back instantly after that.
//
// Reference: https://support.singular.net/hc/en-us/articles/360045245692
// and https://support.singular.net/hc/en-us/articles/207553433 (fetched
// 2026-09-26). The exact shape of the Get Report Status response beyond
// report_id/status wasn't fully confirmed verbatim against the docs (the
// page truncated) -- this parses defensively (checks a few plausible field
// name variants for the status value and the download URL) and throws a
// descriptive error including the RAW response when nothing matches,
// rather than guessing and returning a silently-wrong number. The first
// real run of this should be watched closely; see its caller for how a
// parse failure surfaces to the admin instead of pretending to succeed.

export function singularReportingConfigured(): boolean {
  return !!process.env.SINGULAR_REPORTING_API_KEY;
}

const BASE = "https://api.singular.net/api/v2.0";

type SingularEnvelope<T> = { status: number; substatus?: number; value?: T; error_message?: string };

async function createAsyncReport(apiKey: string, startDate: string, endDate: string, source: string): Promise<string> {
  const url = new URL(`${BASE}/create_async_report`);
  url.searchParams.set("api_key", apiKey);
  const body = new URLSearchParams({
    dimensions: "source",
    metrics: "custom_clicks,custom_installs",
    start_date: startDate,
    end_date: endDate,
    time_breakdown: "all",
    format: "json",
    source, // filter to just this custom source, e.g. "blog" -- also Singular's own recommendation (one source per query)
  });
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as SingularEnvelope<{ report_id?: string }> | null;
  if (!res.ok || !json || json.status !== 0 || !json.value?.report_id) {
    throw new Error(
      `Singular create_async_report failed (HTTP ${res.status}): ${JSON.stringify(json ?? (await res.text().catch(() => "")))}`
    );
  }
  return json.value.report_id;
}

type ReportStatusResult = { done: boolean; failed: boolean; downloadUrl: string | null; raw: unknown };

async function getReportStatus(apiKey: string, reportId: string): Promise<ReportStatusResult> {
  const url = new URL(`${BASE}/get_report_status`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("report_id", reportId);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as SingularEnvelope<Record<string, unknown>> | null;
  if (!res.ok || !json) {
    throw new Error(`Singular get_report_status failed (HTTP ${res.status}): ${JSON.stringify(json)}`);
  }
  const value = json.value ?? {};
  // Defensive: the exact field name for status wasn't confirmed verbatim
  // against the docs (page truncated before that table) -- check the
  // plausible spellings rather than assume one.
  const statusRaw = String(value.status ?? value.report_status ?? "").toUpperCase();
  const done = statusRaw === "DONE" || statusRaw === "COMPLETED" || statusRaw === "SUCCESS";
  const failed = statusRaw === "FAILED" || statusRaw === "ERROR";
  const downloadUrl =
    (value.download_url as string | undefined) ||
    (value.report_url as string | undefined) ||
    (value.url as string | undefined) ||
    null;
  return { done, failed, downloadUrl, raw: json };
}

// Polls every 4s for up to ~2 minutes -- generous for a single-source,
// single-week-or-month, time_breakdown=all query (should realistically
// finish in seconds), while still bounded so an admin-triggered "Refresh"
// click can't hang forever. If Singular is genuinely still processing after
// that, the caller reports a clear timeout rather than pretending success.
async function pollUntilDone(apiKey: string, reportId: string, maxAttempts = 30, intervalMs = 4000): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await getReportStatus(apiKey, reportId);
    if (result.failed) {
      throw new Error(`Singular report failed: ${JSON.stringify(result.raw)}`);
    }
    if (result.done && result.downloadUrl) {
      return result.downloadUrl;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Singular report for ${reportId} didn't finish within the wait window -- try Refresh again shortly.`);
}

// The downloaded report's row shape isn't documented with an example
// either -- handles the plausible cases (a bare JSON array of row objects,
// or an object wrapping the rows under a "results"/"data"/"rows" key) and
// throws with the raw payload (truncated) if neither matches, rather than
// silently returning 0.
function parseReportRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    for (const key of ["results", "data", "rows"]) {
      const v = (payload as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  throw new Error(`Unrecognized Singular report shape: ${JSON.stringify(payload).slice(0, 500)}`);
}

export type SingularInstallsResult = { clicks: number; installs: number; rows: Record<string, unknown>[] };

// Full create -> poll -> download -> parse flow for one custom source over
// one date range. `source` should match the Source Name you gave the
// tracking link in Singular (e.g. "blog" -- see the Blog CTA Buttons link
// created 2026-09-26).
export async function fetchSingularInstalls(days: number, source = "blog"): Promise<SingularInstallsResult> {
  const apiKey = process.env.SINGULAR_REPORTING_API_KEY;
  if (!apiKey) throw new Error("SINGULAR_REPORTING_API_KEY is not configured");

  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const reportId = await createAsyncReport(apiKey, fmt(start), fmt(end), source);
  const downloadUrl = await pollUntilDone(apiKey, reportId);

  const downloadRes = await fetch(downloadUrl, { cache: "no-store" });
  if (!downloadRes.ok) {
    throw new Error(`Downloading the Singular report failed (HTTP ${downloadRes.status})`);
  }
  const payload = await downloadRes.json().catch(async () => {
    // format=json was requested, but fall back to text in case Singular
    // served something else -- surfacing raw text beats a cryptic parse
    // crash.
    throw new Error(`Singular report download wasn't valid JSON: ${(await downloadRes.text()).slice(0, 500)}`);
  });
  const rows = parseReportRows(payload);

  let clicks = 0;
  let installs = 0;
  for (const row of rows) {
    clicks += Number(row.custom_clicks ?? row.clicks ?? 0);
    installs += Number(row.custom_installs ?? row.installs ?? 0);
  }
  return { clicks, installs, rows };
}
