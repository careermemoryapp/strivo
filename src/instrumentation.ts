// Next.js instrumentation hook (runs once when the server starts, in
// each pm2 worker process). Loads the right Sentry config for whichever
// runtime this process is — plain Node.js or the edge runtime — and wires
// up server-side error capture.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, Route Handlers, and proxy.ts.
export const onRequestError = Sentry.captureRequestError;
