import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Protects the app's PAGE routes (redirects unauthenticated visitors to
// /login). API routes are intentionally NOT matched here — each API route
// independently enforces auth via requireUserId() and returns a clean 401
// JSON response instead of an HTML redirect. That's the real security
// boundary (see lib/serverAuth.ts + every repo/*.ts "WHERE user_id = ?"
// query) — this proxy is purely a page-navigation convenience.
//
// Deliberately does NOT also check isTokenRevoked() (lib/auth.ts) here even
// though that's the whole point of logged_out_at -- this middleware runs on
// Next's Edge runtime, which can't load node:sqlite, so it can't query the
// database at all. The revoked-token case is instead caught one render
// step later, in (app)/layout.tsx's own requireUserId() call (a real Node
// Server Component) which every protected route shares -- see the redirect
// there. That's still before anything protected renders or any data loads,
// just not quite as early as this middleware.
export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    pages: { signIn: "/login" },
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/home",
    "/record",
    "/memories",
    "/memories/:path*",
    "/chats",
    "/chats/:path*",
    "/settings",
    "/settings/:path*",
  ],
};
