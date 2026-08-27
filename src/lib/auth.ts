import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import crypto from "node:crypto";
import { getUserByEmail, createUser, updateUserProfile } from "@/lib/repo/users";
import { sendWelcomeEmail } from "@/lib/email";
import * as Sentry from "@sentry/nextjs";

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
      if (session.user) {
        (session.user as unknown as { id: string }).id = token.userId as string;
        (session.user as unknown as { firstName: string }).firstName = token.firstName as string;
        (session.user as unknown as { lastName: string }).lastName = token.lastName as string;
      }
      return session;
    },
  },
};
