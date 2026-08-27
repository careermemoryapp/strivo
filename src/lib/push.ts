import type { App } from "firebase-admin/app";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import * as Sentry from "@sentry/nextjs";
import { deletePushTokens } from "@/lib/repo/pushTokens";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";

// Lazily initialized so a deploy without FIREBASE_SERVICE_ACCOUNT_JSON set
// yet (e.g. before the Firebase setup steps are finished) doesn't crash on
// boot — it just no-ops sends until the credential is added, while the
// in-app Home banner (see nudges.ts / home/page.tsx) keeps working
// regardless.
let firebaseApp: App | null | undefined;

function getFirebaseApp(): App | null {
  if (firebaseApp !== undefined) return firebaseApp;
  if (getApps().length > 0) {
    firebaseApp = getApps()[0];
    return firebaseApp;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    firebaseApp = null;
    return null;
  }
  try {
    firebaseApp = initializeApp({ credential: cert(JSON.parse(raw)) });
  } catch (e) {
    console.error("Failed to initialize Firebase Admin — check FIREBASE_SERVICE_ACCOUNT_JSON.", e);
    Sentry.captureException(e);
    firebaseApp = null;
  }
  return firebaseApp;
}

// FCM's multicast send accepts at most 500 tokens per request.
const BATCH_SIZE = 500;

// Sends a real notification-bar push to every registered device. Best
// effort: if Firebase isn't configured yet, or a batch send throws, this
// logs and returns rather than throwing — a failed push should never break
// the admin's ability to set the in-app nudge (see /api/admin/nudge).
export async function sendPushToAllDevices(
  tokens: string[],
  input: { title?: string; body: string; route?: string }
): Promise<void> {
  if (tokens.length === 0) return;
  // Admin kill switch (see lib/repo/featureFlags.ts) -- checked here so it
  // covers every caller (admin nudges, and any future automatic pushes) in
  // one place. Same best-effort no-op shape as the "Firebase not
  // configured" branch below: a paused push never breaks whatever
  // triggered the send.
  if (!isFeatureEnabled("push_notifications")) {
    console.warn("Push notifications are turned off via the admin kill switch — skipping push send.");
    return;
  }
  const app = getFirebaseApp();
  if (!app) {
    console.warn("Push notifications aren't configured yet (FIREBASE_SERVICE_ACCOUNT_JSON missing) — skipping push send.");
    return;
  }

  const messaging = getMessaging(app);
  const staleTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: batch,
        // No fallback title here — the admin nudge composer requires a
        // Headline (see /api/admin/nudge), so falling back to the app name
        // would just duplicate the "Strivo" line Android already shows
        // automatically above every notification. If a future caller omits
        // it, Android simply shows the body with no bold line.
        notification: { title: input.title, body: input.body },
        // The small status-bar icon (res/drawable/ic_notification.xml) is
        // forced to a flat white silhouette by Android — this `color` is
        // what gives it its little brand-purple circle background instead
        // of the OS default gray, matching the gradient mark everywhere
        // else in the app.
        android: { priority: "high", notification: { color: "#7c3aed" } },
        // A plain data field, not part of the "notification" payload —
        // read client-side by the pushNotificationActionPerformed listener
        // (see usePushRegistration.ts) when the user taps the notification,
        // so a recording nudge opens Record directly instead of just
        // launching the app to Home. Optional so non-nudge pushes (if any
        // get added later) can omit it and fall back to the default tap
        // behavior (open the app).
        ...(input.route ? { data: { route: input.route } } : {}),
      });
      res.responses.forEach((r, idx) => {
        const code = r.error?.code;
        if (!r.success && (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token")) {
          staleTokens.push(batch[idx]);
        }
      });
    } catch (e) {
      console.error("Push send batch failed:", e);
      Sentry.captureException(e);
    }
  }

  if (staleTokens.length > 0) deletePushTokens(staleTokens);
}
