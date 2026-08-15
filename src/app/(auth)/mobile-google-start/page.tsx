"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { Spinner } from "@/components/Spinner";

// Landing spot for the system browser Google sign-in has to open in when
// running inside the Android app (see login/page.tsx and MainActivity.java
// for why). NextAuth requires a CSRF-verified POST to kick off OAuth, which
// only its own client-side signIn() helper can do — a plain link can't skip
// straight to Google. So instead of making the user land on the normal
// /login page and tap "Continue with Google" a second time there, this page
// fires that same signIn() call the instant it loads, so from the user's
// perspective it's still just one tap in the app.
export default function MobileGoogleStartPage() {
  useEffect(() => {
    signIn("google", { callbackUrl: "/api/auth/mobile-bridge" });
  }, []);

  return (
    <div className="flex flex-col items-center text-center">
      <Spinner className="h-8 w-8 border-brand-primary-soft border-t-brand-primary" />
      <p className="mt-4 text-sm text-ink-soft">Opening Google sign-in…</p>
    </div>
  );
}
