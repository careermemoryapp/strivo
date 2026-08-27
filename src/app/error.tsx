"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { LogoMark } from "@/components/Logo";

// Catches any render/runtime error thrown while rendering a page (not API
// routes, which already return their own JSON error responses) and shows a
// branded message instead of Next's bare default error screen or a raw
// stack trace. global-error.tsx (same pattern) only covers the rarer case
// of the root layout itself crashing -- this one covers everything else.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // reset() alone just re-renders the same broken screen in place — for a
  // deterministic bug (the same error every time, not a one-off glitch) it
  // hits the identical error again instantly, which looks to someone
  // tapping the button like it did nothing at all. A real reload instead:
  // re-fetches the page fresh from the server (picking up a deploy that
  // just went out, for instance) and gives the button a visible, honest
  // effect either way, instead of silently failing the same way twice.
  function handleRetry() {
    reset();
    window.location.reload();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <LogoMark size={40} />
      <h1 className="mt-5 text-[22px] font-bold text-ink">Something went wrong</h1>
      <p className="mt-1.5 max-w-xs text-[13px] text-ink-soft">
        We&apos;ve been notified. Please try again — your data is safe.
      </p>
      <button
        onClick={handleRetry}
        className="mt-6 rounded-pill px-5 py-3 text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
      >
        Try again
      </button>
    </div>
  );
}
