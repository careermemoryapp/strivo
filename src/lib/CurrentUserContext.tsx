"use client";

import { createContext, useContext } from "react";

type CurrentUser = { firstName: string; lastName: string; email: string } | null;

const CurrentUserContext = createContext<CurrentUser>(null);

// Fed from (app)/layout.tsx, which already fetches the user server-side to
// decide whether to redirect to /welcome-trial, /trial-ended, etc. -- so
// this costs nothing extra. The layout stays mounted across tab switches
// (Home/Chat/Record/Memories/Settings are sibling routes under it), so the
// value is set once per session rather than refetched on every navigation.
//
// This replaces the old per-page client fetch to /api/user/profile, which
// started every page mount from `null` and briefly rendered the Avatar's
// "?" fallback until the fetch resolved -- visible as a flash on every tab
// switch. Reading from context instead means the name is already known by
// the time these pages render, so there's nothing to flash.
export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUserContext() {
  return useContext(CurrentUserContext);
}
