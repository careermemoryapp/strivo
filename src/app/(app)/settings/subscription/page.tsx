"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles, Clock, ShieldCheck, ChevronRight } from "lucide-react";
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
  preferredPlan: "monthly" | "annual" | "later" | null;
  grantedByAdmin: boolean;
};

const PERKS = [
  "Unlimited memories, captured by voice or text",
  "AI chat grounded in your real experiences",
  "Upload documents (PDF, Word, PowerPoint, Excel) to build memories",
  "Interview, resume, leadership & performance-review coaching",
];

// "later" and null both mean "no real plan committed to yet" -- neither
// should be treated as if the person had reserved Annually. Only a genuine
// "monthly"/"annual" choice maps to a specific billing tab.
function planToBilling(plan: "monthly" | "annual" | "later" | null): "Monthly" | "Annually" | null {
  if (plan === "monthly") return "Monthly";
  if (plan === "annual") return "Annually";
  return null;
}

export default function SubscriptionPage() {
  const router = useRouter();
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
    // Only sync the tab to a real reserved plan -- "later" and null have no
    // billing tab to reflect, so leave the default (Annually) in place
    // rather than falsely implying a reservation exists.
    const reserved = sub ? planToBilling(sub.preferredPlan) : null;
    if (reserved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync from freshly-fetched server data, not a render loop
      setBilling(reserved);
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
  const reservedBilling = sub ? planToBilling(sub.preferredPlan) : null;
  const isPreviewingDifferentPlan = reservedBilling != null && billing !== reservedBilling;

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

            {/* Points at the Features page (see settings/features) --
                what you're actually paying for isn't just storage, it's
                everything Strivo does with what you record, including the
                parts that only show up after you've used it a while. */}
            <button
              onClick={() => router.push("/settings/features")}
              className="flex w-full items-center gap-3 rounded-[14px] border border-[#f0ecf7] bg-surface px-4 py-3.5 text-left"
            >
              <Sparkles size={17} className="shrink-0 text-[#8b5cf6]" />
              <span className="flex-1 text-sm font-medium text-ink">See everything Strivo does for you</span>
              <ChevronRight size={16} className="shrink-0 text-[#cec7dd]" />
            </button>

            <Card className="border-[#f0ecf7]">
              {sub.grantedByAdmin ? (
                <>
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-[#8b5cf6]" />
                    <p className="font-semibold text-ink">Strivo Plus</p>
                  </div>
                  <div className="mt-3 flex flex-col items-center gap-1 rounded-[12px] bg-[#f2effa] px-3 py-3 text-center">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[#8b5cf6]">
                      <CheckCircle2 size={16} /> You&apos;ve been gifted the{" "}
                      {sub.preferredPlan === "monthly" ? "Monthly" : "Annual"} plan
                    </p>
                    <p className="text-xs text-ink-soft">Granted by the Strivo team — no payment needed.</p>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {PERKS.map((perk) => (
                      <div key={perk} className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#8b5cf6]" />
                        <p className="text-sm text-ink-soft">{perk}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">Strivo Plus</p>
                    <div className="w-40">
                      <Tabs tabs={["Monthly", "Annually"]} active={billing} onChange={(t) => setBilling(t as "Monthly" | "Annually")} />
                    </div>
                  </div>

                  {/* flex-wrap + whitespace-nowrap on each piece: on narrower
                      phones (e.g. OnePlus 9) there isn't room for the list
                      price, price, and "Save 50%" pill on one line -- without
                      these, flexbox shrank the pill itself and wrapped "Save"
                      and "50%" onto separate lines inside it. Now the whole
                      pill drops to its own line instead of breaking apart. */}
                  <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {billing === "Annually" && (
                      <p className="whitespace-nowrap text-sm text-ink-faint line-through">{sub.annualListPriceLabel}</p>
                    )}
                    <p className="whitespace-nowrap text-2xl font-bold text-ink">{activePriceLabel}</p>
                    {billing === "Annually" && (
                      <span className="shrink-0 whitespace-nowrap rounded-pill bg-[#f2effa] px-2 py-0.5 text-xs font-semibold text-[#8b5cf6]">
                        Save 50%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-soft">
                    {billing === "Annually" ? "Billed annually" : "Billed monthly"} via Google Play. Cancel anytime
                    before it renews from Google Play → Subscriptions.
                  </p>
                  {sub.status !== "active" && reservedBilling && (
                    <div className="mt-3 flex flex-col items-center gap-1.5 rounded-[12px] bg-[#f2effa] px-3 py-2.5 text-center">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#8b5cf6]">
                        <CheckCircle2 size={14} /> Reserved: {reservedBilling} plan after trial
                      </p>
                      {isPreviewingDifferentPlan && (
                        <button
                          onClick={() => confirmSwitch(billing)}
                          disabled={switching}
                          className="text-xs font-semibold text-[#8b5cf6] underline disabled:opacity-50"
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
                </>
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
