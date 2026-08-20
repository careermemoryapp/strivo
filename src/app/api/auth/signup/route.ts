import { NextResponse } from "next/server";

// Strivo is Google-sign-in-only now — signing in with Google on /login
// automatically creates the account on first use, so there's no separate
// manual signup. Left as an inert 410 (rather than deleted) since the
// route file can't be removed from this workspace; it does nothing and
// accepts no input.
export async function POST() {
  return NextResponse.json({ error: "Manual sign up is no longer available. Sign in with Google instead." }, { status: 410 });
}
