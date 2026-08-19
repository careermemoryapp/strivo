import type { App } from "firebase-admin/app";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { deletePushTokens } from "@/lib/repo/pushTokens";
import { APP_NAME } from "@/lib/config";

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
export async function sendPushToAllDevices(tokens: string[], input: { title?: string; body: string }): Promise<void> {
  if (tokens.length === 0) return;
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
        notification: { title: input.title || APP_NAME, body: input.body },
        android: { priority: "high" },
      });
      res.responses.forEach((r, idx) => {
        const code = r.error?.code;
        if (!r.success && (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token")) {
          staleTokens.push(batch[idx]);
        }
      });
    } catch (e) {
      console.error("Push send batch failed:", e);
    }
  }

  if (staleTokens.length > 0) deletePushTokens(staleTokens);
}
