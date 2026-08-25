"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles, Clock, ShieldCheck } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Card } from "@/components/Card";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Tabs } from "@/components/Tabs";
import { format } from "date-fns";

type Subscription = {
  status: "trial" | "active" | "expired";
  trialEndsAt: string | null;
  daysLeft: number | null;
  priceLabel: string;
  monthlyPriceLabel: string;
  annualPriceLabel: string;
  annualListPriceLabel: string;
  trialMonths: number;
  preferredPlan: "monthly" | "annual" | null;
};

const PERKS = [
  "Unlimited memories, captured by voice or text",
  "AI chat grounded in your real experiences",
  "Upload documents (PDF, Word, PowerPoint, Excel) to build memories",
  "Interview, resume, leadership & performance-review coaching",
];

function planToBilling(plan: "monthly" | "annual" | null): "Monthly" | "Annually" {
  return plan === "monthly" ? "Monthly" : "Annually";
}

export default function SubscriptionPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [switching, setSwitching] = useState(false);
  // Purely a preview toggle -- tapping a tab just changes which price you're
  // looking at, it does NOT touch the real saved preference (that was the
  // bug: switching tabs to peek at the monthly price used to silently
  // overwrite the actual reservation with no confirmation, so the "You're
  // reserved for..." line always just parroted back whichever tab you
  // happened to be on). Defaults to their saved plan once `sub` loads.
  const [billing, setBilling] = useState<"Monthly" | "Annually">("Annually");

  useEffect(() => {
    fetch("/api/subscription")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setSub(data.subscription))
      .catch(() => setError("Couldn't load your subscription details."));
  }, []);

  useEffect(() => {
    if (sub?.preferredPlan) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync from freshly-fetched server data, not a render loop
      setBilling(planToBilling(sub.preferredPlan));
    }
  }, [sub?.preferredPlan]);

  // The explicit, separate action that actually changes the saved
  // reservation -- only fires when the user taps "Switch," never just from
  // browsing tabs.
  async function confirmSwitch(next: "Monthly" | "Annually") {
    setSwitching(true);
    try {
      const res = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: next === "Monthly" ? "monthly" : "annual" }),
      });
      if (res.ok) {
        const data = await res.json();
        setSub(data.subscription);
      }
    } finally {
      setSwitching(false);
    }
  }

  const activePriceLabel = sub ? (billing === "Monthly" ? sub.monthlyPriceLabel : sub.annualPriceLabel) : "";
  const reservedBilling = sub ? planToBilling(sub.preferredPlan) : "Annually";
  const isPreviewingDifferentPlan = sub?.preferredPlan != null && billing !== reservedBilling;

  return (
    <div className="pb-8">
      <DarkHeader back inlineTitle="Subscription" />

      <div className="px-5 pt-5 space-y-5">
        {error && <ErrorBanner message={error} />}

        {!sub && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {sub && (
          <>
            <div
              className="rounded-[18px] p-5 text-white"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa,#c084fc)" }}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                {sub.status === "active" ? <ShieldCheck size={16} /> : <Clock size={16} />}
                {sub.status === "active" && "Strivo Plus — Active"}
                {sub.status === "trial" && "Free Trial"}
                {sub.status === "expired" && "Trial Ended"}
              </div>

              {sub.status === "trial" && (
                <>
                  <p className="mt-2 text-3xl font-bold">{sub.daysLeft} days left</p>
                  <p className="mt-1 text-sm text-white/80">
                    Your free trial ends{" "}
                    {sub.trialEndsAt ? format(new Date(sub.trialEndsAt), "MMMM d, yyyy") : "soon"}. Then it&apos;s{" "}
                    {sub.annualPriceLabel} (or {sub.monthlyPriceLabel}).
                  </p>
                </>
              )}
              {sub.status === "active" && (
                <p className="mt-2 text-sm text-white/80">
                  You&apos;re all set — renews at {sub.priceLabel}.
                </p>
              )}
              {sub.status === "expired" && (
                <p className="mt-2 text-sm text-white/80">
                  Your {sub.trialMonths}-month free trial ended. Upgrade to keep using Strivo.
                </p>
              )}
            </div>

            <Card className="border-[#f0ecf7]">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-ink">Strivo Plus</p>
                <div className="w-40">
                  <Tabs tabs={["Monthly", "Annually"]} active={billing} onChange={(t) => setBilling(t as "Monthly" | "Annually")} />
                </div>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                {billing === "Annually" && (
                  <p className="text-sm text-ink-faint line-through">{sub.annualListPriceLabel}</p>
                )}
                <p className="text-2xl font-bold text-ink">{activePriceLabel}</p>
                {billing === "Annually" && (
                  <span className="rounded-pill bg-[#f2effa] px-2 py-0.5 text-xs font-semibold text-[#8b5cf6]">
                    Save 50%
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-soft">
                {billing === "Annually" ? "Billed annually" : "Billed monthly"} via Google Play. Cancel anytime
                before it renews from Google Play → Subscriptions.
              </p>
              {sub.status !== "active" && sub.preferredPlan && (
                <div className="mt-1.5">
                  <p className="flex items-center gap-1 text-xs font-medium text-[#8b5cf6]">
                    <CheckCircle2 size={13} /> You&apos;re reserved for the {reservedBilling} plan once your trial
                    ends
                  </p>
                  {isPreviewingDifferentPlan && (
                    <button
                      onClick={() => confirmSwitch(billing)}
                      disabled={switching}
                      className="mt-1 text-xs font-semibold text-[#8b5cf6] underline disabled:opacity-50"
                    >
                      {switching ? "Switching…" : `Switch reservation to ${billing}`}
                    </button>
                  )}
                </div>
              )}

              <div className="mt-4 space-y-2.5">
                {PERKS.map((perk) => (
                  <div key={perk} className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#8b5cf6]" />
                    <p className="text-sm text-ink-soft">{perk}</p>
                  </div>
                ))}
              </div>

              {sub.status !== "active" && (
                <button
                  onClick={() => setShowComingSoon(true)}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
                >
                  <Sparkles size={16} /> Upgrade to Strivo Plus
                </button>
              )}

              {showComingSoon && (
                <p className="mt-3 text-center text-xs text-ink-soft">
                  Online payments aren&apos;t set up yet — check back soon.
                </p>
              )}
            </Card>

            <p className="text-center text-xs text-ink-faint">
              Every new Strivo account gets {sub.trialMonths} months free. After your trial, continued access is{" "}
              {sub.annualPriceLabel} (or {sub.monthlyPriceLabel}).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
