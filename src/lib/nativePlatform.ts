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
