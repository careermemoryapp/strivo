import { NextResponse } from "next/server";

// Strivo is Google-sign-in-only now — there's no password to reset, so this
// endpoint is retired. Left as an inert 410 (rather than deleted) since the
// route file can't be removed from this workspace; it does nothing and
// accepts no input.
export async function POST() {
  return NextResponse.json({ error: "Password reset is no longer available. Sign in with Google instead." }, { status: 410 });
}
