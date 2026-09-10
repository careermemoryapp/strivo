"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { Spinner } from "@/components/Spinner";

// Apple counterpart to mobile-google-start/page.tsx -- same reasoning
// applies (NextAuth's signIn() needs a CSRF-verified POST from its own
// client-side helper, so this page fires it the instant it loads rather
// than making the user tap "Continue with Apple" a second time here).
export default function MobileAppleStartPage() {
  useEffect(() => {
    signIn("apple", { callbackUrl: "/api/auth/mobile-bridge" });
  }, []);

  return (
    <div className="flex flex-col items-center text-center">
      <Spinner className="h-8 w-8 border-brand-primary-soft border-t-brand-primary" />
      <p className="mt-4 text-sm text-ink-soft">Opening Apple sign-in…</p>
    </div>
  );
}
