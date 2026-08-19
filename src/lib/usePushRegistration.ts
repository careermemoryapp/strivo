"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import { isNativeApp } from "@/lib/nativePlatform";

// Registers this device's push token with the backend so admin nudges (see
// /admin) can reach it as a real notification-bar alert, not just the
// in-app Home banner. Only runs inside the native Android app — the web
// build of this plugin doesn't support push, and a browser tab doesn't
// need a device token — and only once someone is signed in, since a token
// is useless without a user to attach it to (see PushRegistration in
// Providers.tsx, which passes `enabled` from the session status).
export function usePushRegistration(enabled: boolean) {
  const started = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !isNativeApp() || started.current) return;
    started.current = true;

    const regListener = PushNotifications.addListener("registration", async (token) => {
      // App.getInfo().version is the versionName (e.g. "1.5.1"), sent along
      // so the admin panel can show which build each user is actually
      // running (see repo/pushTokens.ts). Best-effort — if it fails for any
      // reason, the token still registers, just without a version tag.
      const appVersion = await App.getInfo()
        .then((info) => info.version)
        .catch(() => undefined);
      fetch("/api/user/push-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.value, platform: "android", appVersion }),
      }).catch(() => {});
    });
    const errListener = PushNotifications.addListener("registrationError", (err) => {
      // Not fatal — this person just won't get notification-bar nudges
      // until it succeeds on a later app open.
      console.warn("Push registration failed:", err);
    });
    // Fires when someone taps a notification (app was backgrounded/killed
    // or already open). The `route` data field is set server-side for
    // recording nudges (see sendPushToAllDevices in lib/push.ts) so tapping
    // takes them straight to Record instead of just opening the app to
    // Home — falls back to /home if a push doesn't specify one.
    const tapListener = PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const route = action.notification?.data?.route;
      router.push(typeof route === "string" && route ? route : "/home");
    });

    (async () => {
      const perm = await PushNotifications.checkPermissions();
      let receive = perm.receive;
      if (receive === "prompt" || receive === "prompt-with-rationale") {
        receive = (await PushNotifications.requestPermissions()).receive;
      }
      if (receive !== "granted") return;
      await PushNotifications.register();
    })();

    return () => {
      regListener.then((h) => h.remove());
      errListener.then((h) => h.remove());
      tapListener.then((h) => h.remove());
    };
  }, [enabled, router]);
}
