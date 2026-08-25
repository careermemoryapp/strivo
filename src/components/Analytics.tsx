"use client";
import { usePathname } from "next/navigation";
import GoogleAnalytics from "./GoogleAnalytics";
import CookieConsent from "./CookieConsent";

// Marketing-site-only. Deliberately skipped on the signed-in app (/app) and
// the admin dashboard (/admin) -- same privacy-conscious call made earlier
// for Sentry session replay: no reason to run a marketing analytics tag
// against logged-in product usage or admin activity.
export default function Analytics() {
  const pathname = usePathname();
  const isExcluded = pathname?.startsWith("/app") || pathname?.startsWith("/admin");
  if (isExcluded) return null;

  return (
    <>
      <GoogleAnalytics />
      <CookieConsent />
    </>
  );
}
