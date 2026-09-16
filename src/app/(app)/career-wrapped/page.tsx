import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { getCareerWrappedSecondaryInsights, getOrComputeCareerWrappedSnapshot } from "@/lib/repo/careerWrapped";
import {
  ALL_TIME_PERIOD_KEY,
  buildCareerArchetype,
  buildCareerPersonaHeadline,
  getCareerWrappedDataTier,
  type CareerMuscle,
} from "@/lib/careerWrapped";
import { CareerWrappedClient } from "./CareerWrappedClient";

// The full, immersive Career Wrapped experience (spec section 2) -- reached
// either from the Home preview (see CareerWrappedHomePreview.tsx) or a
// career_wrapped_signal push notification's deep link.
//
// Always the user's whole career now (ALL_TIME_PERIOD_KEY), not a
// per-year view -- product feedback: a brand-new account has no prior-year
// data, so a year switcher was a dead end for everyone until they build up
// multi-year history. The underlying per-year aggregation in
// lib/careerWrapped.ts (getCareerWrappedYearOptions, periodKeyForYear) is
// untouched, so a year filter can come back later without redoing the math.
//
// Feature-flagged off means this route redirects away entirely rather than
// rendering something broken -- see the career_wrapped flag's own
// description in lib/repo/featureFlags.ts.
export default async function CareerWrappedPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");
  if (!isFeatureEnabled("career_wrapped")) redirect("/home");

  const user = getUserById(userId);
  const snapshot = getOrComputeCareerWrappedSnapshot(userId, ALL_TIME_PERIOD_KEY);
  const tier = getCareerWrappedDataTier(snapshot.memory_count_at_generation);
  const secondary = getCareerWrappedSecondaryInsights(snapshot);

  return (
    <CareerWrappedClient
      firstName={user?.first_name ?? null}
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
        archetype: buildCareerArchetype(snapshot.strongest_muscle as CareerMuscle | null),
        personaHeadline: buildCareerPersonaHeadline({
          strongestMuscle: snapshot.strongest_muscle as CareerMuscle | null,
          secondStrongestMuscle: secondary.secondStrongestMuscle,
          winsCount: snapshot.wins_count,
          leadershipCount: snapshot.leadership_count,
        }),
      }}
    />
  );
}
