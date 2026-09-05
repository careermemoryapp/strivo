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
// to expect. Expires on its own after 60s so a flag that never gets consumed
// (the picker or browser dialog never actually returned control the way we
// expected) can't permanently disable the real staleness check this exists
// for.
let expectedResumeUntil = 0;

export function markExpectedResume() {
  expectedResumeUntil = Date.now() + 60_000;
}

export function consumeExpectedResume(): boolean {
  if (Date.now() < expectedResumeUntil) {
    expectedResumeUntil = 0;
    return true;
  }
  return false;
}
