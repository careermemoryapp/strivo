"use client";

import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { isNativeApp } from "@/lib/nativePlatform";

// Reports this device's app version once per native session, regardless of
// whether the person has granted notification permission — unlike
// usePushRegistration.ts's token flow, this always fires for every native
// user, so it's what powers the "App version" column in the admin Users
// table (see repo/admin.ts). No-op on web (App.getInfo() isn't meaningful
// there, and there's no build version worth tracking for a browser tab).
export function useAppVersionPing(enabled: boolean) {
  const sent = useRef(false);

  useEffect(() => {
    if (!enabled || !isNativeApp() || sent.current) return;
    sent.current = true;

    App.getInfo()
      .then((info) =>
        fetch("/api/user/app-version", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: info.version }),
        })
      )
      .catch(() => {
        // Best effort — worst case the admin panel just shows this
        // person's version as unknown until a later successful ping.
      });
  }, [enabled]);
}
