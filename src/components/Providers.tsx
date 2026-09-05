"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { ReactNode, useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { isNativeApp, consumeExpectedResume } from "@/lib/nativePlatform";
import { usePushRegistration } from "@/lib/usePushRegistration";
import { useAppVersionPing } from "@/lib/useAppVersionPing";

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
  const { status } = useSession();
  usePushRegistration(status === "authenticated");
  useAppVersionPing(status === "authenticated");
  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  useReloadOnNativeResume();
  return (
    <SessionProvider>
      <PushRegistration />
      {children}
    </SessionProvider>
  );
}
