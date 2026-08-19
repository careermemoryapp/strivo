"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { ReactNode, useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { isNativeApp } from "@/lib/nativePlatform";
import { usePushRegistration } from "@/lib/usePushRegistration";

// Android doesn't destroy/reload the app's WebView when it's backgrounded
// (home button, app switcher) — it just freezes whatever was on screen and
// un-freezes the exact same frozen page when the app is reopened. That
// means a page rendered while logged in stays showing "logged in" even
// after a session was cleared (or expired) in a different visit, since
// nothing ever re-checks. Forcing a real reload every time the app comes
// back to the foreground makes it always re-run the current page's session
// check against whatever cookie state actually exists right now.
function useReloadOnNativeResume() {
  useEffect(() => {
    if (!isNativeApp()) return;
    const handle = CapacitorApp.addListener("resume", () => {
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
