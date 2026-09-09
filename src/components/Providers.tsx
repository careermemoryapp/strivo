"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { ReactNode, useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import * as Sentry from "@sentry/nextjs";
import { isNativeApp, getNativePlatform, consumeExpectedResume } from "@/lib/nativePlatform";
import { usePushRegistration } from "@/lib/usePushRegistration";
import { useAppVersionPing } from "@/lib/useAppVersionPing";

// Tags every client-side error Sentry captures (instrumentation-client.ts)
// with which platform and native app build it came from, so the admin
// panel's Sentry list -- and Sentry's own dashboard -- can actually answer
// "is this an iOS thing, an Android thing, or a web thing" instead of just
// "something broke somewhere." Deliberately NOT gated on being signed in
// (unlike useAppVersionPing, which reports to Strivo's own DB and needs a
// user to attach to) -- a crash on the login screen before anyone's
// authenticated should still be tagged, so this runs unconditionally on
// mount. Calls App.getInfo() itself rather than sharing
// useAppVersionPing's call since that one only fires once authenticated;
// this is a cheap local native-bridge read, not a network request, so a
// second call here costs nothing.
function useSentryDeviceTags() {
  useEffect(() => {
    Sentry.setTag("platform", getNativePlatform());
    if (isNativeApp()) {
      CapacitorApp.getInfo()
        .then((info) => Sentry.setTag("app_version", info.version))
        .catch(() => {
          // Best effort -- worst case this device's errors just show up
          // untagged for app_version, same as before this existed.
        });
    }
  }, []);
}

// Android doesn't destroy/reload the app's WebView when it's backgrounded
// (home button, app switcher) — it just freezes whatever was on screen and
// un-freezes the exact same frozen page when the app is reopened. That
// means a page rendered while logged in stays showing "logged in" even
// after a session was cleared (or expired) in a different visit, since
// nothing ever re-checks. Forcing a real reload every time the app comes
// back to the foreground makes it always re-run the current page's session
// check against whatever cookie state actually exists right now.
//
// BUT this same "resume" event also fires after a handful of expected,
// in-app hand-offs -- the native file picker and Google Sign-In's
// system-browser round trip -- that briefly background the app on purpose.
// Reloading unconditionally there wiped out the in-flight picker result /
// auth callback before it could ever run, which was the real cause of the
// "picker opens, then reverts, nothing uploaded" bug (see nativePlatform.ts
// for the full story). consumeExpectedResume() lets those call sites opt
// their own resume out of this reload.
function useReloadOnNativeResume() {
  useEffect(() => {
    if (!isNativeApp()) return;
    const handle = CapacitorApp.addListener("resume", () => {
      if (consumeExpectedResume()) return;
      window.location.reload();
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, []);
}

// Registers this device for push notifications once someone's actually
// signed in (registering while logged out would have no user to attach the
// device token to). Needs to live inside <SessionProvider> to read the
// session, so it's a small child component rather than being called
// directly in Providers below.
function PushRegistration() {
  const { status, data } = useSession();
  usePushRegistration(status === "authenticated");
  useAppVersionPing(status === "authenticated");

  // Attaches the signed-in user's id to every Sentry event from here on,
  // so an error in the admin panel's Sentry list can be traced back to
  // "which user" hit it (useful for support -- reproducing a report
  // against their actual data) without Sentry ever seeing email/name.
  // Cleared on sign-out so a shared/reused device doesn't keep attributing
  // the next person's errors to whoever was previously logged in.
  useEffect(() => {
    if (status === "authenticated" && data?.user?.id) {
      Sentry.setUser({ id: data.user.id });
    } else if (status === "unauthenticated") {
      Sentry.setUser(null);
    }
  }, [status, data?.user?.id]);

  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  useReloadOnNativeResume();
  useSentryDeviceTags();
  return (
    <SessionProvider>
      <PushRegistration />
      {children}
    </SessionProvider>
  );
}
