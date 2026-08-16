"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

// The very first thing a signed-out person sees when they open the app —
// a brief branded moment before landing on the Continue with Google screen.
// Signed-in people never see this at all: src/app/page.tsx sends them
// straight to /home. Auto-advances to /login after the animation plays, but
// the whole screen is also tappable so nobody feels stuck waiting on it.
const AUTO_ADVANCE_MS = 1800;

export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace("/login"), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => router.replace("/login")}
      aria-label="Continue"
      className="flex w-full flex-col items-center text-center"
    >
      <div className="relative flex items-center justify-center">
        <span className="absolute h-28 w-28 rounded-full bg-gradient-brand animate-splash-glow" />
        <div className="animate-splash-in">
          <LogoMark size={80} />
        </div>
      </div>

      <p
        className="mt-6 text-2xl font-extrabold tracking-tight text-ink animate-fade-in-up"
        style={{ animationDelay: "0.15s" }}
      >
        {APP_NAME}
      </p>
      <p
        className="mt-2 max-w-xs text-sm text-ink-soft animate-fade-in-up"
        style={{ animationDelay: "0.3s" }}
      >
        {APP_TAGLINE}
      </p>

      <div className="mt-8 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-brand animate-splash-dot" style={{ animationDelay: "0s" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-brand animate-splash-dot" style={{ animationDelay: "0.15s" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-brand animate-splash-dot" style={{ animationDelay: "0.3s" }} />
      </div>
    </button>
  );
}
