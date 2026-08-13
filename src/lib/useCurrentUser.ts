"use client";

import { useEffect, useState } from "react";

type CurrentUser = { firstName: string; lastName: string; email: string } | null;

// Small shared hook so every screen's header avatar shows real initials
// instead of falling back to "?" — used anywhere a page renders <Avatar />
// without already having the user's name from a bigger page-data fetch
// (Home fetches it as part of /api/home and doesn't need this).
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.user) return;
        setUser({
          firstName: data.user.first_name,
          lastName: data.user.last_name,
          email: data.user.email,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}
