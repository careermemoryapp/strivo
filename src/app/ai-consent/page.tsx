"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";

// One-time gate, shown before ANY other (app) screen -- see the
// `!user.ai_consent_at` redirect in (app)/layout.tsx, which runs for both
// brand-new signups (before /first-record ever gets a chance to send
// anything to OpenAI) and every existing account on their next visit
// (ai_consent_at is NULL for everyone who signed up before this shipped).
//
// Exists to satisfy Guideline 5.1.2(i): "clearly disclose where personal
// data will be shared with third parties, including with third-party AI,
// and obtain explicit permission before doing so." The old flow only had
// a generic "you agree to our Terms & Privacy Policy" link at signup that
// never named AI -- see docs/apple-app-store-checklist.md item 3 for the
// full reasoning. Deliberately no "decline" option: AI processing is core,
// disclosed product functionality (turning what you say into structured
// memories, powering chat), not an optional add-on with a working
// AI-free mode to fall back to -- so this is phrased as an
// acknowledge-and-continue gate, not a real accept/reject choice.
export default function AiConsentPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/ai-consent", { method: "POST" });
      if (!res.ok) throw new Error();
      // Back into the (app) layout's own gating chain -- it'll now pass
      // this check and land wherever the existing preferred_plan/
      // subscription logic already sends this person (first-record,
      // welcome-trial, trial-ended, plan-nudge, or straight to home).
      // Deliberately not duplicating that routing logic here.
      router.replace("/home");
    } catch {
      setSubmitting(false);
      setError("Couldn't save that. Please try again.");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-8 pt-8">
      <div className="flex items-center gap-2.5">
        <LogoMark size={32} />
        <span className="text-[17px] font-bold tracking-tight text-ink">Strivo</span>
      </div>

      <div className="mt-8 flex flex-col items-center text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f2effa] text-[#8b5cf6]"
          style={{ boxShadow: "0 8px 20px rgba(139,92,246,0.2)" }}
        >
          <Sparkles size={26} />
        </div>
        <h1 className="mt-4 text-[20px] font-bold text-ink">How Strivo uses AI</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          When you record a memory or chat with Strivo, what you share is sent to OpenAI to structure it into
          memories, generate resume lines, and power your answers. That&apos;s the core of how Strivo works.
        </p>
      </div>

      <div className="mt-6 rounded-[16px] border border-[#ece5f5] bg-[#f9f8fc] p-4">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#8b5cf6]" />
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Your data is only used to power Strivo&apos;s own features for you -- not for training anyone
            else&apos;s AI models. Full details are in our{" "}
            <a href="/privacy" target="_blank" className="font-semibold text-[#8b5cf6] underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mt-auto pt-8">
        <button
          onClick={agree}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
        >
          {submitting && <Spinner className="border-white/40 border-t-white h-4 w-4" />}
          I understand, continue
        </button>
      </div>
    </div>
  );
}
