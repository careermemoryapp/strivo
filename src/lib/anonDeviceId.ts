// A stable, anonymous per-install identifier for the pre-signup onboarding
// funnel (see ONBOARDING_EVENTS in lib/config.ts and computeOnboardingFunnel
// in repo/onboardingFunnel.ts) -- NOT a general analytics/device-fingerprint
// utility, and deliberately not wired into trackEvent() itself or any other
// event family (Career Wrapped, Career Profile, Founding Member).
//
// Added 2026-10-09 after the founder flagged the onboarding admin screen as
// "something is wrong": "Reached sign-in screen" (28) was showing MORE
// events than "Opened the app" (23), and "Returned to app without
// finishing" (21) was showing more than "Tapped Continue with Google" (18)
// -- a funnel that gets WIDER partway through. Root cause confirmed by
// reading the actual instrumentation, not guessed: every onboarding_* event
// was a raw COUNT(*) of analytics_events rows with zero de-duplication (see
// that table's schema in lib/db.ts -- user_id is null for all of these,
// since they fire before sign-in, and there was no session/device column at
// all). Two call sites fire more than once per real visit by design:
// login/page.tsx's onboarding_login_viewed fires on every fresh mount of
// the login screen (an empty-deps useEffect), and onboarding_resumed_
// incomplete fires on every native "resume" event while still on that
// screen -- including an ordinary phone lock or app-switch, not just a
// cancelled sign-in (see that event's own comment in login/page.tsx). A
// WebView reload while the user is away in the system browser during the
// Google OAuth hand-off is the most likely way a single real visit produces
// more than one of either event, per Browser.open()'s documented tendency
// to background (and risk Android reclaiming) the WebView process.
//
// The fix: count DISTINCT devices that reached each step instead of raw
// event fires. That needs an id that survives a WebView reload (a
// module-scoped or in-memory id would just regenerate on that same reload
// and not fix anything) but doesn't need to survive a reinstall or persist
// server-side -- localStorage is exactly that durability, and it already
// works inside a Capacitor WebView without a native plugin.
const STORAGE_KEY = "strivo_onboarding_device_id";

export function getAnonDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Private browsing / storage disabled / some WebView edge case -- a
    // fresh id every call in that case, same as having no de-duplication at
    // all for that one visit. Never throw into caller code over this.
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}
