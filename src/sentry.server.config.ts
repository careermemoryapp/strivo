// Server-side Sentry setup (Node.js runtime — API routes, server
// components, etc). Reports unhandled server errors so they show up in
// Sentry instead of only in pm2's local logs.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://1948f1d36fe97df78378b3151f2af60e@o4511953299963904.ingest.us.sentry.io/4511953311760384",
  environment: process.env.NODE_ENV,
});
