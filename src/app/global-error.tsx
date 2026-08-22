"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

// Catches errors that escape every other error boundary in the App
// Router (a crash in the root layout itself, for example) and reports
// them to Sentry before falling back to Next's built-in error page.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* NextError's type requires a statusCode prop, but the App Router
            doesn't expose real status codes for errors caught here, so we
            pass 0 to render a generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
