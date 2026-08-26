"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";

type Subscription = {
  status: "trial" | "active" | "expired";
  daysLeft: number | null;
  trialMonths: number;
  monthlyPriceLabel: string;
  annualPriceLabel: string;
  annualListPriceLabel: string;
};

const PERKS = [
  "Every memory you've recorded — voice notes, documents, career history",
  "AI chat grounded in your real experiences",
  "Interview, resume, leadership & performance-review coaching",
];

// Shown instead of the normal app once PLAN_NUDGE_AFTER_MS has passed since
// someone picked "I'll choose later" on /welcome-trial and still hasn't
// picked a real plan (see needsPlanNudge in repo/users.ts and the redirect
// in (app)/layout.tsx). Framed around what they stand to lose, not just
// "buy now" -- the point is to get them to actually decide, one way or the
// other, not to hard-block them again. Picking "I'll choose later" here is
// still allowed: it just re-stamps preferred_plan_chosen_at and pushes this
// screen out another full interval, so it can't reappear every session.
export default function PlanNudgePage() {
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [submitting, setSubmitting] = useState<"monthly" | "annual" | "later" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/subscription")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setSub(data.subscription))
      .catch(() => setError("Couldn't load pricing. Check your connection and try again."));
  }, []);

  async function confirm(chosenPlan: "monthly" | "annual" | "later") {
    setSubmitting(chosenPlan);
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
      setSubmitting(null);
      setError("Couldn't save your choice. Please try again.");
    }
  }

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
          <div className="mt-8 flex items-center gap-2 text-[#e88b1a]">
            <AlertTriangle size={20} />
            <p className="text-xs font-semibold uppercase tracking-wide">Still haven&apos;t picked a plan</p>
          </div>
          <h1 className="mt-2 text-[22px] font-bold text-ink">Don&apos;t lose what you&apos;ve built</h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">
            {sub.status === "trial" && sub.daysLeft !== null
              ? `You've got ${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"} left on your free trial. `
              : ""}
            Once it ends without a plan chosen, you&apos;ll lose access to everything below — pick now so nothing
            gets left behind.
          </p>

          {error && <div className="mt-4"><ErrorBanner message={error} /></div>}

          <div className="mt-6 space-y-2.5">
            {PERKS.map((perk) => (
              <div key={perk} className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#8b5cf6]" />
                <p className="text-sm text-ink-soft">{perk}</p>
              </div>
            ))}
          </div>

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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="whitespace-nowrap text-sm font-semibold text-ink">Yearly</p>
                  <span className="shrink-0 whitespace-nowrap rounded-pill bg-[#f2effa] px-2 py-0.5 text-[10px] font-semibold text-[#8b5cf6]">
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

          <div className="mt-auto pt-8">
            <button
              onClick={() => confirm(plan)}
              disabled={submitting !== null}
              className="flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
            >
              {submitting === "monthly" || submitting === "annual" ? <Spinner /> : <Sparkles size={16} />}
              Choose this plan
            </button>
            <p className="mt-3 text-center text-[11px] text-ink-faint">
              You won&apos;t be charged today. Cancel anytime before it renews from Google Play → Subscriptions.
            </p>
            <button
              onClick={() => confirm("later")}
              disabled={submitting !== null}
              className="mt-4 w-full text-center text-[13px] font-semibold text-ink-soft underline disabled:opacity-60"
            >
              {submitting === "later" ? "One sec…" : "I'll choose later"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
