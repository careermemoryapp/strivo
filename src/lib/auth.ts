import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import crypto from "node:crypto";
import { getUserByEmail, getUserById, createUser, updateUserProfile, markLoggedOut } from "@/lib/repo/users";
import { sendWelcomeEmail } from "@/lib/email";
import * as Sentry from "@sentry/nextjs";

// True if this token was issued before its owner's most recent Log Out --
// i.e. a stale, pre-logout token being replayed. Shared by the session
// callback below and proxy.ts's page middleware so both auth surfaces
// (API routes via getServerSession, and page navigation via
// next-auth/middleware) enforce the exact same rule. See logged_out_at's
// comment on the User type (repo/users.ts) for why this check exists at
// all -- in short, it's the server-side backstop for Log Out that doesn't
// depend on any client (most notably Android's WebView) ever successfully
// deleting its own copy of the session cookie.
export function isTokenRevoked(userId: string | undefined, loginAt: string | undefined): boolean {
  if (!userId || !loginAt) return false;
  const dbUser = getUserById(userId);
  if (!dbUser?.logged_out_at) return false;
  return new Date(loginAt).getTime() <= new Date(dbUser.logged_out_at).getTime();
}

// Strivo is Google-sign-in-only — there's no email/password login,
// signup, or password-reset flow (those pages/routes were removed; see
// commit history if they're ever needed again). Every user record still
// has a password_hash column for schema-simplicity reasons, but it's only
// ever filled with a random, never-checked placeholder (below) since
// nothing reads it back for authentication anymore. It's stored as plain
// random bytes, not run through a password-hashing algorithm (bcrypt used
// to be used here, but hashing a value nobody ever verifies against was
// pure overhead — a dependency to maintain and a blocking CPU-bound call
// on every signup — for no actual security benefit).
export const authOptions: AuthOptions = {
  // Stateless JWT sessions have no server-side revocation list -- "logging
  // out" only clears the cookie on that one device, so if a session token
  // were ever stolen (e.g. a compromised device), it would technically
  // still work if replayed elsewhere until it naturally expires. next-auth's
  // own default is 30 days; shortened to 14 here to cut that exposure
  // window by more than half. This doesn't cost active users anything --
  // next-auth silently refreshes/extends the session on activity, so it
  // only actually logs someone out after 14 straight days with no visits,
  // not 14 days after their last login.
  session: { strategy: "jwt", maxAge: 14 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email;
        if (!email) return false;
        let dbUser = getUserByEmail(email);
        if (!dbUser) {
          const fullName = (user.name ?? "").trim();
          const [firstName, ...rest] = fullName.length ? fullName.split(" ") : ["Strivo", "User"];
          const placeholderHash = crypto.randomBytes(32).toString("hex");
          dbUser = createUser({
            firstName: firstName || "Strivo",
            lastName: rest.join(" "),
            email,
            passwordHash: placeholderHash,
          });
          console.log(`New user created via Google sign-in: ${email} (id=${dbUser.id}) — sending welcome email.`);
          // Fire-and-forget: this is the one moment we know for certain
          // it's a brand-new account (dbUser was just created above, not
          // looked up). Deliberately NOT awaited -- a slow or failed SES
          // call must never delay or block this sign-in response. The
          // send function itself never throws (see sendWelcomeEmail in
          // lib/email.ts), but .catch() is still here as a last-resort
          // guard against an unhandled promise rejection.
          sendWelcomeEmail({ toEmail: dbUser.email, firstName: dbUser.first_name }).catch((e) => {
            console.error("Welcome email failed:", e);
            Sentry.captureException(e);
          });
        }
        if (user.image && user.image !== dbUser.profile_image) {
          updateUserProfile(dbUser.id, { profile_image: user.image });
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // account is only present the one time this callback runs as part of
      // an actual sign-in -- every later call (session checks, page loads)
      // passes just the existing token. That makes this the right, one-time
      // place to stamp when this particular token's session began, which
      // isTokenRevoked() above compares against logged_out_at to catch a
      // stale pre-logout token being replayed.
      if (account) {
        token.loginAt = new Date().toISOString();
      }
      if (account?.provider === "google" && user?.email) {
        const dbUser = getUserByEmail(user.email);
        if (dbUser) {
          token.userId = dbUser.id;
          token.firstName = dbUser.first_name;
          token.lastName = dbUser.last_name;
        }
        return token;
      }
      if (user) {
        const u = user as unknown as { id: string; firstName: string; lastName: string };
        token.userId = u.id;
        token.firstName = u.firstName;
        token.lastName = u.lastName;
      }
      return token;
    },
    async session({ session, token }) {
      // Reject a session built from a token issued before its owner's most
      // recent Log Out (see isTokenRevoked's comment above) by simply not
      // attaching a user id -- every API route gates on session.user.id via
      // requireUserId() (lib/serverAuth.ts), so this alone makes every
      // authenticated endpoint 401 for a revoked token. Page navigation is
      // covered separately by proxy.ts's middleware, which runs the same
      // check against the raw token before this callback is even involved.
      if (session.user && !isTokenRevoked(token.userId, token.loginAt)) {
        (session.user as unknown as { id: string }).id = token.userId as string;
        (session.user as unknown as { firstName: string }).firstName = token.firstName as string;
        (session.user as unknown as { lastName: string }).lastName = token.lastName as string;
      }
      return session;
    },
  },
  events: {
    // Fires for every sign-out, from any device, regardless of whether the
    // client-side cookie deletion that normally accompanies it actually
    // succeeds -- see logged_out_at's comment on the User type
    // (repo/users.ts) for the Android WebView bug this exists to close.
    async signOut({ token }) {
      if (token?.userId) markLoggedOut(token.userId);
    },
  },
};
