"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles, Clock, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
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
  const [billing, setBilling] = useState<"Monthly" | "Annually">("Annually");

  useEffect(() => {
    fetch("/api/subscription")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setSub(data.subscription))
      .catch(() => setError("Couldn't load your subscription details."));
  }, []);

  const activePriceLabel = sub ? (billing === "Monthly" ? sub.monthlyPriceLabel : sub.annualPriceLabel) : "";

  return (
    <div>
      <PageHeader title="Subscription" back />

      <div className="px-5 space-y-5 pb-8">
        {error && <ErrorBanner message={error} />}

        {!sub && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {sub && (
          <>
            <Card className="bg-gradient-brand text-white border-0">
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
            </Card>

            <Card>
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
                  <span className="rounded-pill bg-brand-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-primary">
                    Save 50%
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-soft">
                {billing === "Annually" ? "Billed annually, cancel anytime" : "Billed monthly, cancel anytime"} via
                Google Play
              </p>

              <div className="mt-4 space-y-2.5">
                {PERKS.map((perk) => (
                  <div key={perk} className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-primary" />
                    <p className="text-sm text-ink-soft">{perk}</p>
                  </div>
                ))}
              </div>

              {sub.status !== "active" && (
                <Button className="w-full mt-5" onClick={() => setShowComingSoon(true)}>
                  <Sparkles size={16} /> Upgrade to Strivo Plus
                </Button>
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
