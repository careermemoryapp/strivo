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
  // Confirmed against the actual installed plugin
  // (node_modules/singular_cordova_sdk/www/SingularCordovaSdk.js) --
  // module.exports.event(eventName) is a real, top-level export, not a
  // guess.
  event: (eventName: string) => void;
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

// The event name Singular attributes back to whichever source (e.g. the
// website's "blog" tracking link) drove the install -- the same
// attribution Singular already does for the "Installed the app" stage of
// the admin Growth Funnel (see lib/singularReporting.ts and
// lib/repo/growthFunnel.ts). Firing this is step one of making that
// funnel's "Signed up" row honest -- it currently just counts every
// signup on Strivo regardless of source (see growthFunnel.ts's
// signupsSinceTrackingStart()), so a signup from an organic Play Store
// find looks identical to one that actually came from the website. Step
// two (pulling this event's count back out via Singular's Reporting API,
// scoped to the "blog" source, and adding it as its own funnel stage) is
// a separate follow-up once this has shipped and had a chance to fire for
// real -- see the 2026-09-26 conversation this was added in for why: that
// pull uses a different Reporting API mechanism (cohort_metrics, keyed by
// an auto-generated event ID from Singular's Cohort Metrics endpoint) than
// the custom_installs/custom_clicks metrics already wired up, and needs a
// live event to have fired at least once before that ID exists to look up.
const SIGN_UP_EVENT_NAME = "sign_up";

// localStorage, not the in-memory flags in nativePlatform.ts -- this has
// to survive app restarts. /first-record (the only caller, see its own
// comment) is gated on "preferred_plan is null and they have zero
// memories," which stays true across multiple app opens for anyone who
// backs out before finishing onboarding, so without a durable per-device
// flag a single real signup could fire this event several times and
// inflate whatever the dashboard eventually shows.
const SIGN_UP_EVENT_SENT_KEY = "strivo_singular_signup_event_sent";

// Call once, the moment the app is confident someone is a genuinely
// brand-new signup (currently: first-record/page.tsx mounting -- see its
// own comment for why that screen specifically is the right gate: it's
// shown once, right after account creation, before the plan picker).
// Idempotent per device via the localStorage flag above -- safe to call
// on every mount of that screen.
export function trackSingularSignUp(): void {
  if (!isNativeApp()) return;
  try {
    if (localStorage.getItem(SIGN_UP_EVENT_SENT_KEY)) return;
  } catch {
    // Private-mode-style localStorage failures shouldn't block the event --
    // worst case this fires more than once, which still beats never
    // telling Singular about a real signup at all.
  }
  const bridge = window.cordova?.plugins?.SingularCordovaSdk;
  if (!bridge) return;
  try {
    bridge.event(SIGN_UP_EVENT_NAME);
    localStorage.setItem(SIGN_UP_EVENT_SENT_KEY, "1");
  } catch (err) {
    console.error("[singular] sign_up event failed:", err);
  }
}
