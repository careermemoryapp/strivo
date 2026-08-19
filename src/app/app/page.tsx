import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// The real app's entry point. Signed-in people land on /home, everyone else
// sees the animated /welcome splash first. This used to live at the site
// root ("/"), but strivo.ai's root is now the public marketing homepage
// (see src/app/page.tsx) — the native Capacitor shell points its WebView
// straight at /app instead, so people using the app never see the
// marketing page at all. Anyone landing here from a browser gets the same
// experience the app gives, on the off chance they navigate here directly.
export default async function AppEntryPage() {
  const session = await getServerSession(authOptions);
  redirect(session ? "/home" : "/welcome");
}
