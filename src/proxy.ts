import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Protects the app's PAGE routes (redirects unauthenticated visitors to
// /login). API routes are intentionally NOT matched here — each API route
// independently enforces auth via requireUserId() and returns a clean 401
// JSON response instead of an HTML redirect. That's the real security
// boundary (see lib/serverAuth.ts + every repo/*.ts "WHERE user_id = ?"
// query) — this proxy is purely a page-navigation convenience.
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
