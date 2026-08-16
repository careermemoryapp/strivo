"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

// The very first thing a signed-out person sees when they open the app —
// a full-bleed animated moment before landing on the Continue with Google
// screen. Signed-in people never see this at all: src/app/page.tsx sends
// them straight to /home. `fixed inset-0` deliberately breaks out of the
// (auth) layout's centered/narrow container so this covers the whole
// viewport instead of sitting inside it. Auto-advances to /login once the
// animation plays, but the whole screen is also tappable to skip ahead.
const AUTO_ADVANCE_MS = 5000;

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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden text-center"
      style={{
        background: "linear-gradient(155deg, #2a0f5c 0%, #3a1478 22%, #241068 45%, #171246 70%, #0a0f2e 100%)",
      }}
    >
      <span className="absolute -left-24 top-[18%] h-72 w-72 rounded-full bg-brand-primary/50 blur-3xl animate-float-blob" />
      <span
        className="absolute -right-20 top-[55%] h-80 w-80 rounded-full bg-brand-secondary/50 blur-3xl animate-float-blob"
        style={{ animationDelay: "-3s" }}
      />
      <span
        className="absolute right-[10%] top-[6%] h-56 w-56 rounded-full bg-fuchsia-500/40 blur-3xl animate-float-blob"
        style={{ animationDelay: "-6s" }}
      />

      <div className="relative z-10 flex flex-col items-center px-6">
        <div className="relative flex items-center justify-center">
          <span className="absolute h-44 w-44 rounded-full bg-white/25 animate-splash-glow" />
          <div className="animate-splash-in">
            <LogoMark size={128} />
          </div>
        </div>

        <p
          className="mt-6 text-3xl font-extrabold tracking-tight text-white animate-fade-in-up"
          style={{ animationDelay: "0.15s" }}
        >
          {APP_NAME}
        </p>
        <p
          className="mt-2 max-w-xs text-sm text-white/70 animate-fade-in-up"
          style={{ animationDelay: "0.3s" }}
        >
          {APP_TAGLINE}
        </p>

        <div className="mt-9 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-splash-dot" style={{ animationDelay: "0s" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-splash-dot" style={{ animationDelay: "0.15s" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-splash-dot" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>
    </button>
  );
}
