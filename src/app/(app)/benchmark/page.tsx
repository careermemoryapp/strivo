import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getLatestQuarterlyBenchmark } from "@/lib/repo/quarterlyBenchmarks";
import { BenchmarkClient } from "./BenchmarkClient";

// "You vs. You" -- see app/api/quarterly-benchmark/run for how the
// benchmark itself gets generated (a fixed quarterly external automation,
// same pattern as the blog/weekly-recap/growth-narrative automations).
// This page just displays the most recent one already saved for this user,
// and is also where a quarterly-benchmark push notification's tap
// deep-links to (see route: "/benchmark" in that route file).
export default async function BenchmarkPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const benchmark = getLatestQuarterlyBenchmark(userId);

  return (
    <BenchmarkClient
      benchmark={
        benchmark
          ? {
              quarterLabel: benchmark.quarter_label,
              priorQuarterLabel: benchmark.prior_quarter_label,
              reflectionText: benchmark.reflection_text,
              current: {
                total: benchmark.current_total,
                competencyStories: benchmark.current_competency_stories,
                distinctCompetencies: benchmark.current_distinct_competencies,
                metricStories: benchmark.current_metric_stories,
              },
              prior: {
                total: benchmark.prior_total,
                competencyStories: benchmark.prior_competency_stories,
                distinctCompetencies: benchmark.prior_distinct_competencies,
                metricStories: benchmark.prior_metric_stories,
              },
              createdAt: benchmark.created_at,
            }
          : null
      }
    />
  );
}
