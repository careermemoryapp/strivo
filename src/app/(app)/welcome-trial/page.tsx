"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";

type Subscription = {
  trialMonths: number;
  monthlyPriceLabel: string;
  annualPriceLabel: string;
  annualListPriceLabel: string;
};

const PERKS = [
  "Unlimited memories, captured by voice or text",
  "AI chat grounded in your real experiences",
  "Upload documents (PDF, Word, PowerPoint, Excel) to build memories",
  "Interview, resume, leadership & performance-review coaching",
];

// First-run, one-time screen: shown once right after signup (see
// needsPlanChoice in api/home/route.ts and the redirect in home/page.tsx),
// never again once a plan preference is recorded. Doesn't charge anything
// or change the trial itself -- everyone already gets `trialMonths` free
// regardless of which plan they pick here (see createUser in
// lib/repo/users.ts). This purely captures which plan to pre-select once
// Google Play Billing is wired up, so we're not guessing at that point.
export default function WelcomeTrialPage() {
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/subscription")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setSub(data.subscription))
      .catch(() => setError("Couldn't load pricing. Check your connection and try again."));
  }, []);

  async function confirm(chosenPlan: "monthly" | "annual") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: chosenPlan }),
      });
      if (!res.ok) throw new Error();
      router.replace("/home");
    } catch {
      setSubmitting(false);
      setError("Couldn't save your choice. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col px-5 pb-8 pt-8">
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
          <h1 className="mt-8 text-[22px] font-bold text-ink">You&apos;re in! Start your free trial</h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">
            Every new account gets {sub.trialMonths} months completely free — no charge today. Pick how
            you&apos;d like to continue after that, you can always change it later in Settings.
          </p>

          {error && <div className="mt-4"><ErrorBanner message={error} /></div>}

          <div className="mt-6 space-y-2.5">
            <button
              onClick={() => setPlan("annual")}
              className="flex w-full items-center justify-between rounded-[16px] border-2 p-4 text-left transition-colors"
              style={{
                borderColor: plan === "annual" ? "#8b5cf6" : "#ece5f5",
                background: plan === "annual" ? "#f7f4fd" : "transparent",
              }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">Yearly</p>
                  <span className="rounded-pill bg-[#f2effa] px-2 py-0.5 text-[10px] font-semibold text-[#8b5cf6]">
                    Save 50%
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-faint line-through">{sub.annualListPriceLabel}</p>
                <p className="text-[13px] font-semibold text-ink">{sub.annualPriceLabel}</p>
              </div>
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                style={{ borderColor: plan === "annual" ? "#8b5cf6" : "#d8d2e6" }}
              >
                {plan === "annual" && <div className="h-2.5 w-2.5 rounded-full bg-[#8b5cf6]" />}
              </div>
            </button>

            <button
              onClick={() => setPlan("monthly")}
              className="flex w-full items-center justify-between rounded-[16px] border-2 p-4 text-left transition-colors"
              style={{
                borderColor: plan === "monthly" ? "#8b5cf6" : "#ece5f5",
                background: plan === "monthly" ? "#f7f4fd" : "transparent",
              }}
            >
              <div>
                <p className="text-sm font-semibold text-ink">Monthly</p>
                <p className="mt-0.5 text-[13px] font-semibold text-ink">{sub.monthlyPriceLabel}</p>
              </div>
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                style={{ borderColor: plan === "monthly" ? "#8b5cf6" : "#d8d2e6" }}
              >
                {plan === "monthly" && <div className="h-2.5 w-2.5 rounded-full bg-[#8b5cf6]" />}
              </div>
            </button>
          </div>

          <div className="mt-6 space-y-2.5">
            {PERKS.map((perk) => (
              <div key={perk} className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#8b5cf6]" />
                <p className="text-sm text-ink-soft">{perk}</p>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-8">
            <button
              onClick={() => confirm(plan)}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
            >
              {submitting ? <Spinner /> : <Sparkles size={16} />}
              Start free trial
            </button>
            <p className="mt-3 text-center text-[11px] text-ink-faint">
              Billed via Google Play after your trial ends, cancel anytime. You won&apos;t be charged today.
            </p>
            <button
              onClick={() => confirm("annual")}
              disabled={submitting}
              className="mt-4 w-full text-center text-xs font-medium text-ink-faint underline disabled:opacity-60"
            >
              I&apos;ll decide later
            </button>
          </div>
        </>
      )}
    </div>
  );
}
