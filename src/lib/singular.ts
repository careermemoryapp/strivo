// Singular MMP integration (X Ads "App installs" objective needs a
// conversion event to optimize/report against -- see the Manage MMP screen
// in X Ads Manager, which links to whichever provider sends it install
// events). Singular's Cordova plugin (installed as singular_cordova_sdk --
// Capacitor supports Cordova plugins as regular npm deps, see
// https://capacitorjs.com/docs/plugins/cordova) attaches its JS bridge to
// the native WebView the same way @capacitor/browser and
// @capacitor/push-notifications do, so this works from this remote
// strivo.ai page exactly like nativePlatform.ts's Capacitor bridge does --
// no locally-bundled native app code needed beyond the plugin itself.
//
// SDK Key/Secret below are the *SDK Integration* credentials from Singular's
// dashboard (Developer Tools > SDK Integration > SDK Keys) -- these are
// app-embedded identifiers by design (same trust model as the Sentry DSN or
// Firebase config already shipped in this app), NOT the separate Reporting
// API key, which is a real secret and must never go here.
import { isNativeApp } from "./nativePlatform";

const SINGULAR_SDK_KEY = "strivo_657e7fcc";
const SINGULAR_SDK_SECRET = "b8246b120079b9bbda6ebed454b41839";

interface SingularConfig {
  sdidReceivedCallback?: (sdid: string) => void;
  withLoggingEnabled?: () => SingularConfig;
}

interface SingularCordovaSdkBridge {
  SingularConfig: new (sdkKey: string, sdkSecret: string) => SingularConfig;
  init: (config: SingularConfig) => void;
}

declare global {
  interface Window {
    cordova?: {
      plugins?: {
        SingularCordovaSdk?: SingularCordovaSdkBridge;
      };
    };
  }
}

// Call once, as early as possible in the app's lifecycle, every time the
// native app launches -- Singular's docs are explicit that init() should run
// on every launch (not just first install), since each call starts a new
// attribution session used for retention metrics. No-ops entirely on web
// (isNativeApp() false) and safely no-ops if the plugin bridge isn't present
// yet (e.g. before `npx cap sync` has actually wired the native SDK in --
// see the AndroidManifest.xml comment next to the permissions this needs).
export function initSingular(): void {
  if (!isNativeApp()) return;
  const bridge = window.cordova?.plugins?.SingularCordovaSdk;
  if (!bridge) return;

  try {
    const config = new bridge.SingularConfig(SINGULAR_SDK_KEY, SINGULAR_SDK_SECRET);
    config.sdidReceivedCallback = (sdid: string) => {
      console.log("[singular] SDID received:", sdid);
    };
    bridge.init(config);
  } catch (err) {
    // Best effort -- a failure here shouldn't block app startup, same
    // stance as the other native-bridge calls in Providers.tsx.
    console.error("[singular] init failed:", err);
  }
}
