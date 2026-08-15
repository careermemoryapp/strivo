import { NextRequest, NextResponse } from "next/server";
import { consumeMobileAuthToken } from "@/lib/repo/mobileAuth";

const SECURE_COOKIE = "__Secure-next-auth.session-token";

// Same reasoning as mobile-bridge/route.ts: don't derive the redirect
// target from req.url, since behind this app's Nginx setup that resolves
// to the internal http://localhost:3000 address instead of strivo.ai.
const SITE_URL = process.env.NEXTAUTH_URL || "https://strivo.ai";

// The app's WebView (via MainActivity's deep-link handler) loads this URL
// with the one-time token minted by /api/auth/mobile-bridge. If it's valid
// and unused, we set the exact same NextAuth session cookie value here —
// this request's response lands in the WebView's own cookie jar, which is
// the one the app actually reads sessions from — then send the user home
// already signed in. Anything wrong with the token sends them back to
// /login to try again rather than erroring out.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const result = token ? consumeMobileAuthToken(token) : undefined;
  if (!result) {
    return NextResponse.redirect(new URL("/login", SITE_URL));
  }
  const res = NextResponse.redirect(new URL("/home", SITE_URL));
  res.cookies.set({
    name: SECURE_COOKIE,
    value: result.sessionCookieValue,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // matches NextAuth's default JWT session maxAge
  });
  return res;
}
