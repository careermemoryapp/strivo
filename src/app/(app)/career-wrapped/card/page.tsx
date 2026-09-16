import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById } from "@/lib/repo/users";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { getCareerWrappedSecondaryInsights, getOrComputeCareerWrappedSnapshot } from "@/lib/repo/careerWrapped";
import {
  ALL_TIME_PERIOD_KEY,
  buildCareerAchievementPotential,
  buildCareerArchetype,
  buildCareerPersonaHeadline,
  getCareerWrappedDataTier,
  type CareerMuscle,
} from "@/lib/careerWrapped";
import type { CareerCardData } from "@/lib/careerCardImage";
import { CareerWrappedCardClient } from "./CareerWrappedCardClient";

// Entry point for the "Generate My Career Card" reward-loop flow (spec
// section 6) -- reached from RewardLoopCard's button in CareerWrappedClient.
// Always the user's whole career now (ALL_TIME_PERIOD_KEY) -- see the
// card-preview route's comment for why the year filter was pulled.
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
export default async function CareerWrappedCardPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");
  if (!isFeatureEnabled("career_wrapped")) redirect("/home");

  const user = getUserById(userId);
  const snapshot = getOrComputeCareerWrappedSnapshot(userId, ALL_TIME_PERIOD_KEY);
  const tier = getCareerWrappedDataTier(snapshot.memory_count_at_generation);
  const secondary = getCareerWrappedSecondaryInsights(snapshot);

  // Nothing worth putting on a card yet -- send them back to Career Wrapped
  // itself rather than rendering an empty/broken card flow. RewardLoopCard
  // (the only in-app link to this page) is already only shown once tier
  // isn't "empty", so this only fires on a stale bookmark/back-navigation.
  if (tier === "empty") redirect("/career-wrapped");

  const previewData: CareerCardData = {
    title: `${user?.first_name ? `${user.first_name}'s` : "Your"} Career`,
    periodLabel: "All Time",
    archetype: buildCareerArchetype(snapshot.strongest_muscle as CareerMuscle | null),
    strongestMuscle: snapshot.strongest_muscle,
    personaHeadline: buildCareerPersonaHeadline({
      strongestMuscle: snapshot.strongest_muscle as CareerMuscle | null,
      secondStrongestMuscle: secondary.secondStrongestMuscle,
      winsCount: snapshot.wins_count,
      leadershipCount: snapshot.leadership_count,
    }),
    achievementPotential: buildCareerAchievementPotential(
      snapshot.strongest_muscle as CareerMuscle | null,
      secondary.secondStrongestMuscle
    ),
  };

  return <CareerWrappedCardClient previewData={previewData} />;
}
