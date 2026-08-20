import { NextResponse } from "next/server";
import {
  checkAdminPassword,
  checkAdminTotp,
  adminTotpConfigured,
  createAdminSessionValue,
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_MAX_AGE,
} from "@/lib/adminAuth";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";

export async function POST(req: Request) {
  // This single shared password (plus, once configured, an authenticator
  // code) guards every user's data — strict limit against brute forcing it.
  const limited = rateLimitOrResponse(`admin-login:${requestIp(req)}`, 8, 15 * 60 * 1000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const code = typeof body?.code === "string" ? body.code : undefined;

  // Deliberately one combined error for a wrong password OR a wrong/missing
  // authenticator code -- once MFA is turned on, an attacker who somehow
  // guesses the password correctly shouldn't be able to tell that from the
  // response and know they only need to brute-force the second factor next.
  if (!checkAdminPassword(password) || !checkAdminTotp(code)) {
    return NextResponse.json(
      {
        error: adminTotpConfigured() ? "Incorrect password or authenticator code." : "Incorrect password.",
      },
      { status: 401 }
    );
  }

  let sessionValue: string;
  try {
    sessionValue = createAdminSessionValue();
  } catch {
    // Server is missing ADMIN_SESSION_SECRET/NEXTAUTH_SECRET -- fail closed
    // with a clear error instead of a generic crash.
    return NextResponse.json({ error: "Server misconfigured: no session secret set." }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
