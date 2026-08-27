"use client";

import { useCurrentUserContext } from "@/lib/CurrentUserContext";

// Small shared hook so every screen's header avatar shows real initials
// instead of falling back to "?" — used anywhere a page renders <Avatar />
// without already having the user's name from a bigger page-data fetch
// (Home fetches it as part of /api/home and doesn't need this).
//
// Backed by CurrentUserProvider (set once in (app)/layout.tsx from the
// server-side user lookup already done there for plan/trial gating) rather
// than its own client fetch — see CurrentUserContext.tsx for why: a fresh
// fetch on every page mount was causing the Avatar's "?" fallback to flash
// briefly on every tab switch before the real initials loaded in.
export function useCurrentUser() {
  return useCurrentUserContext();
}
