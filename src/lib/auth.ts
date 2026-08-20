import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { getUserByEmail, createUser, updateUserProfile } from "@/lib/repo/users";

// Strivo is Google-sign-in-only — there's no email/password login,
// signup, or password-reset flow (those pages/routes were removed; see
// commit history if they're ever needed again). Every user record still
// has a password_hash column for schema-simplicity reasons, but it's only
// ever filled with a random, never-checked placeholder (below) since
// nothing reads it back for authentication anymore.
export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
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
          const placeholderHash = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10);
          dbUser = createUser({
            firstName: firstName || "Strivo",
            lastName: rest.join(" "),
            email,
            passwordHash: placeholderHash,
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
