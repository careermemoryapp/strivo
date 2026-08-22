import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Normally ".next". scripts/deploy.sh and scripts/rollback.sh override
  // this to a scratch directory (NEXT_DIST_DIR=.next-build) so a fresh
  // build never overwrites the live ".next" the currently-running server
  // is still reading from mid-request -- see the comment in deploy.sh for
  // why that in-place overwrite was causing real, if rare, errors.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // pdf-parse (via pdfjs-dist) resolves its worker script relative to its
  // own module location at runtime. Webpack/Turbopack normally bundle
  // dependencies into hashed chunk files, which breaks that relative path
  // and crashes PDF parsing in production ("Setting up fake worker failed").
  // Marking these as server-external tells Next.js to leave them as plain
  // node_modules requires instead of bundling them, so the worker path
  // resolves correctly.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],

  // Security headers applied to every response. Deliberately not adding a
  // strict Content-Security-Policy here — Strivo doesn't embed third-party
  // scripts/iframes today, but a CSP is easy to get subtly wrong (breaking
  // Google sign-in, the mobile WebView, etc.) and hard for a non-engineer
  // to debug in production, so it's left as a follow-up to introduce
  // carefully rather than blind. The headers below are safe, high-value,
  // and don't change how any existing feature behaves.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stops the browser from guessing content types (e.g. treating
          // an uploaded file as HTML/JS instead of what it's declared as).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Strivo is never meant to be embedded in another site's iframe
          // — this blocks clickjacking attempts that try to do that.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Don't leak full referrer URLs (which can contain tokens/paths)
          // to other origins when a Strivo page links out.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Explicitly allow microphone for the app's own origin (the
          // Record feature needs it) and deny camera/geolocation, which
          // Strivo never uses.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
          // Force HTTPS for two years including subdomains — the whole
          // site already only runs over HTTPS via the Let's Encrypt cert.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "strivo-4i",
  project: "javascript-nextjs",

  // No SENTRY_AUTH_TOKEN is configured yet, so this stays quiet instead of
  // warning on every build. Source map upload (for readable stack traces
  // instead of minified ones) is a later, optional improvement — it needs
  // an auth token treated as a secret, which is its own separate step.
  silent: true,
});
