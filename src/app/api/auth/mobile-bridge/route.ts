import { NextRequest, NextResponse } from "next/server";
import { createMobileAuthToken } from "@/lib/repo/mobileAuth";

// NextAuth names its session cookie based on whether NEXTAUTH_URL is https.
// Ours is (https://strivo.ai), so the real cookie is the "__Secure-"
// prefixed one; we also check the plain name so this keeps working if this
// route is ever hit over plain http (e.g. local dev).
const SECURE_COOKIE = "__Secure-next-auth.session-token";
const PLAIN_COOKIE = "next-auth.session-token";

// Nginx proxies strivo.ai to this app on localhost:3000, and this server
// doesn't reliably see "strivo.ai" as the request's own host — building a
// redirect from req.url ends up pointing at http://localhost:3000, which is
// unreachable from a phone. NEXTAUTH_URL is already the one fixed, correct
// public URL every other part of this app (NextAuth itself) trusts, so we
// use that instead of anything derived from the incoming request.
const SITE_URL = process.env.NEXTAUTH_URL || "https://strivo.ai";

// The Android app's Google sign-in has to run in the system browser (Google
// blocks its own sign-in screen inside embedded WebViews). This route is
// where that system-browser flow lands right after NextAuth finishes OAuth
// there — callbackUrl on the /login page points here. At this point the
// system browser already has a valid NextAuth session cookie; we can't hand
// that cookie to the app's WebView directly (separate cookie jars), so we
// mint a short-lived one-time token carrying the cookie value and bounce
// out to the app via a custom-scheme deep link. The app (MainActivity)
// catches that link and loads /api/auth/mobile-consume, which sets the same
// cookie value inside its own WebView.
export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get(SECURE_COOKIE)?.value ?? req.cookies.get(PLAIN_COOKIE)?.value;
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", SITE_URL));
  }
  const { token } = createMobileAuthToken(sessionCookie);
  return NextResponse.redirect(`ai.strivo.app://auth-callback?token=${token}`);
}
