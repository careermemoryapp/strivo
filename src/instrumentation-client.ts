// Client-side Sentry setup. Runs in the browser and reports unhandled
// JS errors from the React app (including inside the Android WebView).
//
// Deliberately minimal for now: error monitoring only. Session replay and
// performance tracing are both off — replay in particular can record what
// users see/type, which isn't something we want on by default for an app
// that stores people's career/personal memories. Can be turned on later
// as a deliberate choice, not a default.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://1948f1d36fe97df78378b3151f2af60e@o4511953299963904.ingest.us.sentry.io/4511953311760384",
  environment: process.env.NODE_ENV,
});

// Lets Sentry tag errors with which page/route the user was on when a
// client-side navigation happened.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
