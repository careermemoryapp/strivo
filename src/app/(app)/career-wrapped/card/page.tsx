import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { getOrComputeCareerWrappedSnapshot } from "@/lib/repo/careerWrapped";
import { ALL_TIME_PERIOD_KEY, getCareerWrappedDataTier, getCareerWrappedYearOptions, periodKeyForYear } from "@/lib/careerWrapped";
import type { CareerCardData } from "@/lib/careerCardImage";
import { CareerWrappedCardClient } from "./CareerWrappedCardClient";

// Entry point for the "Generate My Career Card" reward-loop flow (spec
// section 6) -- reached from RewardLoopCard's button in CareerWrappedClient.
// `year=YYYY`/`year=all` carries the period the user was looking at when
// they tapped Generate, same param convention as the parent /career-wrapped
// page, so the card defaults to whatever period they were already viewing.
//
// previewData below is deliberately built with the EXACT same shape/fields
// as the share route's own CareerCardData construction (see
// app/api/career-wrapped/share/route.ts) -- it's what the privacy preview
// step shows the user before anything is generated. It is never sent
// anywhere or trusted by the API: POST /api/career-wrapped/share rebuilds
// this itself server-side from the live snapshot at generate-time. Showing
// a client-trusted copy here would violate nothing (it's this user's own
// data, rendered on a page only they can reach), but the two are computed
// from the same authoritative snapshot so they can never actually diverge.
export default async function CareerWrappedCardPage({
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

  // Nothing worth putting on a card yet -- send them back to Career Wrapped
  // itself rather than rendering an empty/broken card flow. RewardLoopCard
  // (the only in-app link to this page) is already only shown once tier
  // isn't "empty", so this only fires on a stale bookmark/back-navigation.
  if (tier === "empty") redirect("/career-wrapped");

  const periodLabel = periodKey === ALL_TIME_PERIOD_KEY ? "All Time" : periodKey;
  const previewData: CareerCardData = {
    title: `${user?.first_name ? `${user.first_name}'s` : "Your"} ${periodLabel} Career`,
    periodLabel,
    winsCount: snapshot.wins_count,
    leadershipCount: snapshot.leadership_count,
    problemsSolvedCount: snapshot.problems_solved_count,
    strongestMuscle: snapshot.strongest_muscle,
    growingMuscle: snapshot.growing_muscle,
  };

  return <CareerWrappedCardClient periodKey={periodKey} previewData={previewData} />;
}
