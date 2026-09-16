import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { getOrComputeCareerWrappedSnapshot } from "@/lib/repo/careerWrapped";
import { ALL_TIME_PERIOD_KEY, getCareerWrappedDataTier, getCareerWrappedYearOptions, periodKeyForYear } from "@/lib/careerWrapped";
import { CareerWrappedClient } from "./CareerWrappedClient";

// The full, immersive Career Wrapped experience (spec section 2) -- reached
// either from the Home preview (see CareerWrappedHomePreview.tsx) or a
// career_wrapped_signal push notification's deep link. `year=YYYY` or
// `year=all` selects the period; defaults to the current calendar year, same
// default as the Home preview. Feature-flagged off means this route redirects
// away entirely rather than rendering something broken -- see the
// career_wrapped flag's own description in lib/repo/featureFlags.ts.
export default async function CareerWrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) redirect("/login");
  if (!isFeatureEnabled("career_wrapped")) redirect("/home");

  const user = getUserById(userId);
  const { year: yearParam } = await searchParams;
  const yearOptions = getCareerWrappedYearOptions();
  const selectedYear = yearParam && yearParam !== ALL_TIME_PERIOD_KEY ? Number(yearParam) : null;
  const periodKey =
    yearParam === ALL_TIME_PERIOD_KEY
      ? ALL_TIME_PERIOD_KEY
      : selectedYear && yearOptions.includes(selectedYear)
        ? periodKeyForYear(selectedYear)
        : periodKeyForYear(yearOptions[0]);

  const snapshot = getOrComputeCareerWrappedSnapshot(userId, periodKey);
  const tier = getCareerWrappedDataTier(snapshot.memory_count_at_generation);

  return (
    <CareerWrappedClient
      firstName={user?.first_name ?? null}
      periodKey={periodKey}
      periodLabel={periodKey === ALL_TIME_PERIOD_KEY ? "All Time" : periodKey}
      yearOptions={yearOptions}
      tier={tier}
      snapshot={{
        winsCount: snapshot.wins_count,
        leadershipCount: snapshot.leadership_count,
        problemsSolvedCount: snapshot.problems_solved_count,
        seniorStakeholderCount: snapshot.senior_stakeholder_count,
        memoryCount: snapshot.memory_count_at_generation,
        strongestMuscle: snapshot.strongest_muscle,
        growingMuscle: snapshot.growing_muscle,
        underrepresentedMuscle: snapshot.underrepresented_muscle,
      }}
    />
  );
}
