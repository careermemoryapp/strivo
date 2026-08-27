"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";

type Subscription = {
  trialMonths: number;
  monthlyPriceLabel: string;
  annualPriceLabel: string;
};

const PERKS = [
  "Every memory you've recorded — voice notes, documents, career history",
  "AI chat grounded in your real experiences",
  "Interview, resume, leadership & performance-review coaching",
];

// The hard stop, added 2026-08-27 as a deliberate product decision: unlike
// /welcome-trial and /plan-nudge (which let someone into the app either
// way), (app)/layout.tsx redirects EVERY route under (app) here once
// getSubscriptionInfo computes status === "expired" -- nothing renders
// until this page. Real payment collection (Google Play Billing) isn't
// live yet (see task tracker #111-117), so there's genuinely no way for
// someone to pay their way past this screen today -- the honest "coming
// soon" copy below reflects that rather than pretending a working
// checkout exists. Their data isn't touched or at risk; this only blocks
// continued use, matching the same reasoning as an admin-granted
// "Strivo Plus" account never landing here (that flips subscription_status
// to "active", which getSubscriptionInfo treats as never expired).
export default function TrialEndedPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);

  useEffect(() => {
    fetch("/api/subscription")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setSub(data.subscription))
      .catch(() => setError("Couldn't load your account details."));
  }, []);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-8 pt-8">
      <div className="flex items-center gap-2.5">
        <LogoMark size={32} />
        <span className="text-[17px] font-bold tracking-tight text-ink">Strivo</span>
      </div>

      {!sub && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      )}

      {error && !sub && <div className="mt-6"><ErrorBanner message={error} /></div>}

      {sub && (
        <>
          <div className="mt-8 flex items-center gap-2 text-ink-soft">
            <LockKeyhole size={20} />
            <p className="text-xs font-semibold uppercase tracking-wide">Trial ended</p>
          </div>
          <h1 className="mt-2 text-[22px] font-bold text-ink">
            Your {sub.trialMonths}-month free trial has ended
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">
            Everything you recorded is still safe — nothing has been deleted. You&apos;ll need to be on a
            plan to keep using Strivo.
          </p>

          <div className="mt-6 space-y-2.5">
            {PERKS.map((perk) => (
              <div key={perk} className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#8b5cf6]" />
                <p className="text-sm text-ink-soft">{perk}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[16px] border-2 border-[#ece5f5] p-4">
            <p className="text-sm font-semibold text-ink">Strivo Plus</p>
            <p className="mt-1 text-[13px] text-ink-soft">
              {sub.annualPriceLabel} (or {sub.monthlyPriceLabel})
            </p>
          </div>

          <div className="mt-auto pt-8">
            <button
              onClick={() => setShowComingSoon(true)}
              className="flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
            >
              Upgrade to Strivo Plus
            </button>
            {showComingSoon && (
              <p className="mt-3 text-center text-xs text-ink-soft">
                Online payments aren&apos;t set up yet — we&apos;ll email you the moment they are.
              </p>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="mt-4 w-full text-center text-[13px] font-semibold text-ink-soft underline"
            >
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
