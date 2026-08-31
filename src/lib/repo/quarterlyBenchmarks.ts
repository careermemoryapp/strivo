import { getDb, newId, nowIso } from "@/lib/db";

export type QuarterlyBenchmark = {
  id: string;
  user_id: string;
  quarter_label: string;
  prior_quarter_label: string;
  reflection_text: string;
  current_total: number;
  current_competency_stories: number;
  current_distinct_competencies: number;
  current_metric_stories: number;
  prior_total: number;
  prior_competency_stories: number;
  prior_distinct_competencies: number;
  prior_metric_stories: number;
  created_at: string;
};

export type QuarterStats = {
  total: number;
  competencyStories: number;
  distinctCompetencies: number;
  metricStories: number;
};

export function createQuarterlyBenchmark(input: {
  userId: string;
  quarterLabel: string;
  priorQuarterLabel: string;
  reflectionText: string;
  current: QuarterStats;
  prior: QuarterStats;
}): QuarterlyBenchmark {
  const db = getDb();
  const id = newId("qb");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO quarterly_benchmarks (
       id, user_id, quarter_label, prior_quarter_label, reflection_text,
       current_total, current_competency_stories, current_distinct_competencies, current_metric_stories,
       prior_total, prior_competency_stories, prior_distinct_competencies, prior_metric_stories,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.quarterLabel,
    input.priorQuarterLabel,
    input.reflectionText,
    input.current.total,
    input.current.competencyStories,
    input.current.distinctCompetencies,
    input.current.metricStories,
    input.prior.total,
    input.prior.competencyStories,
    input.prior.distinctCompetencies,
    input.prior.metricStories,
    ts
  );
  return db.prepare(`SELECT * FROM quarterly_benchmarks WHERE id = ?`).get(id) as QuarterlyBenchmark;
}

export function getLatestQuarterlyBenchmark(userId: string): QuarterlyBenchmark | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM quarterly_benchmarks WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(userId) as QuarterlyBenchmark | undefined;
}

// Same "keep the impure Date.now() comparison out of a Server Component"
// pattern as getRecentWeeklyRecap / getRecentGrowthNarrative -- see the
// react-hooks/purity note on those.
export function getRecentQuarterlyBenchmark(userId: string, maxAgeMs: number): QuarterlyBenchmark | undefined {
  const benchmark = getLatestQuarterlyBenchmark(userId);
  if (!benchmark) return undefined;
  const isRecent = Date.now() - new Date(benchmark.created_at).getTime() < maxAgeMs;
  return isRecent ? benchmark : undefined;
}

// Idempotency guard for the quarterly automation (see
// app/api/quarterly-benchmark/run) -- if the job is ever re-run for the same
// quarter (a retry, a manual re-trigger), this stops a user from getting a
// second push/benchmark for a quarter they already got one for.
export function hasQuarterlyBenchmarkForQuarter(userId: string, quarterLabel: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT 1 FROM quarterly_benchmarks WHERE user_id = ? AND quarter_label = ? LIMIT 1`)
    .get(userId, quarterLabel);
  return !!row;
}
