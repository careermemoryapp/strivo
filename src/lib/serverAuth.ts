import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Small helper every API route uses to get the authenticated user's id.
// Returns null if unauthenticated — callers must respond 401.
export async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}
