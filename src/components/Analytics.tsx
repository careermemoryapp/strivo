"use client";
import { usePathname } from "next/navigation";
import GoogleAnalytics from "./GoogleAnalytics";
import CookieConsent from "./CookieConsent";
import { isNativeApp } from "@/lib/nativePlatform";

// Marketing-site-only. Deliberately skipped on the signed-in app and the
// admin dashboard -- same privacy-conscious call made earlier for Sentry
// session replay: no reason to run a marketing analytics tag or show a
// cookie-consent banner meant for anonymous website visitors against
// logged-in product usage or admin activity.
//
// Two separate checks, because neither one alone covers everything:
// - isNativeApp() catches the native Android app, whatever screen it's on.
//   The app's real routes (/home, /record, /chats, /settings, ...) come
//   from the (app) route GROUP, which is just an organizational folder --
//   it does NOT add "/app" to the actual URL, so a pathname check alone
//   was silently never matching any of them (the bug that shipped the
//   cookie banner + GA4 into the app on every screen). isNativeApp() is
//   route-independent, so it can't drift out of sync with the URL
//   structure the way the old check did.
// - pathname still covers /admin, and covers someone visiting /app,
//   /home, /record etc. from an ordinary desktop/mobile BROWSER (not the
//   native app) -- isNativeApp() alone wouldn't catch that case.
export default function Analytics() {
  const pathname = usePathname();
  const isExcluded = isNativeApp() || pathname?.startsWith("/app") || pathname?.startsWith("/admin");
  if (isExcluded) return null;

  return (
    <>
      <GoogleAnalytics />
      <CookieConsent />
    </>
  );
}
