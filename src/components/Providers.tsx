"use client";
import { SessionProvider } from "next-auth/react";
import { ReactNode, useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";

// Minimal shape of the global Capacitor injects into every page loaded
// inside the native app's WebView. Absent entirely on a normal browser.
type CapacitorGlobal = { isNativePlatform?: () => boolean };
declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

function isNativeApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());
}

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

export default function Providers({ children }: { children: ReactNode }) {
  useReloadOnNativeResume();
  return <SessionProvider>{children}</SessionProvider>;
}
