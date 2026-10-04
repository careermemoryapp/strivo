import { Capacitor } from "@capacitor/core";

// Minimal shape of the global Capacitor injects into every page loaded
// inside the native app's WebView (including this remote strivo.ai page —
// the bridge is attached to the WebView itself, not to locally-bundled
// assets). Absent entirely on a normal desktop/mobile browser. Shared by
// anything that needs to branch on "am I running inside the Android app"
// (Google sign-in, the resume-reload fix, push notification registration).
type CapacitorGlobal = { isNativePlatform?: () => boolean };
declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());
}

// "ios" | "android" | "web" -- lets platform-specific copy (e.g. which
// storefront a subscription renews through) render correctly instead of
// hardcoding one platform's wording for everyone. Uses the real
// @capacitor/core Capacitor object (not the minimal CapacitorGlobal shape
// above) since getPlatform() isn't part of that trimmed-down type; safe to
// import at module scope because @capacitor/core no-ops to "web" outside a
// native shell rather than throwing, so this works identically in a plain
// desktop/mobile browser.
export function getNativePlatform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}

// A handful of legitimate in-app actions deliberately send the app to the
// background for a moment -- the native file picker (FilePicker.pickFiles,
// used by Record/first-record/Settings > Resume) and Google Sign-In's
// system-browser hand-off (Browser.open in login/page.tsx) both do this --
// and Android fires the exact same CapacitorApp "resume" event when the app
// comes back to the foreground from those as it does when someone genuinely
// switches to another app and back. Providers.tsx's useReloadOnNativeResume
// can't tell those apart on its own and used to hard window.location.reload()
// on every single resume -- which wiped out the in-flight file pick (and
// raced the Google sign-in deep-link callback) before either could finish,
// silently dropping the user back on a blank version of whatever screen they
// were on. This was the real root cause of the "picker opens, then reverts,
// nothing uploaded" bug that survived multiple unrelated picker
// implementations, since none of them ever got a chance to run.
//
// Callers that are about to trigger one of these expected hand-offs mark it
// here first; the resume handler checks (and clears) this before deciding to
// reload, so it skips the reload exactly for the hand-off it was just told
// to expect. Expires on its own so a flag that never gets consumed (the
// picker or browser dialog never actually returned control the way we
// expected) can't permanently disable the real staleness check this exists
// for.
//
// This used to expire after 60s, which is shorter than a real Google
// sign-in can easily take from the moment the button is tapped (account
// picker, password, a 2FA prompt, a slow connection) -- well within normal,
// not even "slow phone" territory. Whenever that happened, the clock here
// ran out before the user got back, so the "resume" fired by the deep-link
// hand-off landed as an UNEXPECTED resume: useReloadOnNativeResume() reloads
// the WebView right as (or just before) MainActivity is delivering the
// auth-callback token to it, discarding or racing the in-flight sign-in --
// silently bouncing the user back to a logged-out screen with no error and
// no Sentry event (mobile-consume's token-missing warning only fires if the
// token actually reaches that route; this drops it before it gets there).
// This is almost certainly the real mechanism behind "Google sign-in
// sometimes needs several tries on Android," and it can fail on an install
// that otherwise did everything right -- a plausible chunk of the
// install-to-signup gap. Widened to comfortably exceed mobileAuth.ts's own
// 2-minute token TTL (TTL_MS there), so this client-side guard is never the
// tighter constraint; the server-side token expiry is still the real
// backstop for a hand-off that's abandoned for good.
const EXPECTED_RESUME_WINDOW_MS = 4 * 60 * 1000;
let expectedResumeUntil = 0;

export function markExpectedResume() {
  expectedResumeUntil = Date.now() + EXPECTED_RESUME_WINDOW_MS;
}

export function consumeExpectedResume(): boolean {
  if (Date.now() < expectedResumeUntil) {
    expectedResumeUntil = 0;
    return true;
  }
  return false;
}
