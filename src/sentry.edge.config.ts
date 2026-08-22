// Sentry setup for the Edge runtime (e.g. proxy.ts, if it ever runs on
// the edge runtime). Strivo doesn't use edge middleware today, but Next.js
// expects this file to exist alongside instrumentation.ts.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://1948f1d36fe97df78378b3151f2af60e@o4511953299963904.ingest.us.sentry.io/4511953311760384",
  environment: process.env.NODE_ENV,
});
