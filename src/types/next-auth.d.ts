import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      firstName: string;
      lastName: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    firstName: string;
    lastName: string;
    // ISO timestamp of when THIS token's session began (stamped once at
    // sign-in in lib/auth.ts's jwt callback). Compared against the user's
    // logged_out_at column (isTokenRevoked in lib/auth.ts) to reject a
    // stale, pre-logout token being replayed -- see that column's comment
    // on the User type in repo/users.ts for why.
    loginAt?: string;
  }
}
