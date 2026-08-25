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

export default function SubscriptionPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);
  // Only used before we know their actual preference (first paint / no
  // preference recorded yet). Once `sub` loads with a preferredPlan, the
  // effect below syncs this to match it, so the tab reflects what they
  // actually chose on the welcome-trial screen instead of always resetting
  // to Annually.
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
      setBilling(sub.preferredPlan === "monthly" ? "Monthly" : "Annually");
    }
  }, [sub?.preferredPlan]);

  // Switching the tab here doesn't just change the local price preview --
  // it also updates the real stored preference (same field the
  // welcome-trial screen writes to), so this page doubles as "change your
  // plan choice" rather than a one-time picker you can never revisit.
  async function handleBillingChange(next: "Monthly" | "Annually") {
    setBilling(next);
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
    } catch {
      // Non-critical -- the price preview above already reflects their tap,
      // and they can just switch again if the save silently failed.
    }
  }

  const activePriceLabel = sub ? (billing === "Monthly" ? sub.monthlyPriceLabel : sub.annualPriceLabel) : "";

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
                  <Tabs
                    tabs={["Monthly", "Annually"]}
                    active={billing}
                    onChange={(t) => handleBillingChange(t as "Monthly" | "Annually")}
                  />
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
                {billing === "Annually" ? "Billed annually, cancel anytime" : "Billed monthly, cancel anytime"} via
                Google Play
              </p>
              {sub.status !== "active" && sub.preferredPlan && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-[#8b5cf6]">
                  <CheckCircle2 size={13} /> You&apos;re reserved for the {billing} plan once your trial ends
                </p>
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
