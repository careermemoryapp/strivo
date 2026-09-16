"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ChevronLeft, Download, Link as LinkIcon, Check, Share2, Sparkles, ShieldCheck } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/trackEvent";
import { isNativeApp, markExpectedResume } from "@/lib/nativePlatform";
import type { CareerCardData, CareerCardTemplate } from "@/lib/careerCardImage";

type ShareResult = { shareId: string; url: string; cardData: CareerCardData };
type Step = "template" | "preview" | "share";

const TEMPLATES: { id: CareerCardTemplate; label: string; blurb: string }[] = [
  { id: "A", label: "Premium", blurb: "Clean, dark, professional" },
  { id: "B", label: "Wrapped", blurb: "Bold, vibrant, expressive" },
  { id: "C", label: "Minimal", blurb: "Light, understated" },
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};
const reducedMotionVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } };

export function CareerWrappedCardClient({ periodKey, previewData }: { periodKey: string; previewData: CareerCardData }) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotionVariants : fadeUp;

  const [step, setStep] = useState<Step>("template");
  const [template, setTemplate] = useState<CareerCardTemplate>("A");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const previewImageUrl = `/api/career-wrapped/card-preview?periodKey=${encodeURIComponent(periodKey)}&template=${template}`;

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/career-wrapped/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodKey, template }),
      });
      if (!res.ok) throw new Error("Could not generate your card. Please try again.");
      const data = (await res.json()) as ShareResult;
      setShare(data);
      trackEvent("career_card_generated", { template, periodKey });
      setStep("share");
    } catch {
      setGenerateError("Something went wrong generating your card. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function handleCreateAnother() {
    setShare(null);
    setGenerateError(null);
    setStep("template");
  }

  return (
    <div className="pb-10">
      <DarkHeader back={step === "template"} inlineTitle="Career Card" />

      <motion.div initial="hidden" animate="show" variants={variants} className="px-5 pt-5">
        {step === "template" && (
          <TemplateStep
            template={template}
            onSelect={setTemplate}
            previewImageUrl={previewImageUrl}
            onContinue={() => setStep("preview")}
          />
        )}

        {step === "preview" && (
          <PreviewStep
            previewData={previewData}
            previewImageUrl={previewImageUrl}
            generating={generating}
            generateError={generateError}
            onBack={() => setStep("template")}
            onGenerate={handleGenerate}
          />
        )}

        {step === "share" && share && (
          <ShareStep
            share={share}
            linkCopied={linkCopied}
            setLinkCopied={setLinkCopied}
            onCreateAnother={handleCreateAnother}
            onDone={() => router.push(`/career-wrapped?year=${periodKey}`)}
          />
        )}
      </motion.div>
    </div>
  );
}

function TemplateStep({
  template,
  onSelect,
  previewImageUrl,
  onContinue,
}: {
  template: CareerCardTemplate;
  onSelect: (t: CareerCardTemplate) => void;
  previewImageUrl: string;
  onContinue: () => void;
}) {
  return (
    <div>
      <h1 className="text-[19px] font-bold text-ink">Pick a style</h1>
      <p className="mt-1 text-[12.5px] text-ink-soft">Choose how your Career Card looks. You can preview it before sharing anything.</p>

      <div className="mt-5 overflow-hidden rounded-[20px] border border-border bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG (next/og), same as CareerCardPublicClient */}
        <img key={template} src={previewImageUrl} alt={`Career Card — ${template} style preview`} className="w-full" style={{ aspectRatio: "1080 / 1350" }} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              "rounded-[14px] border p-3 text-left transition-colors",
              template === t.id ? "border-brand-primary bg-brand-primary-soft" : "border-border"
            )}
          >
            <p className="text-[12.5px] font-semibold text-ink">{t.label}</p>
            <p className="mt-0.5 text-[10.5px] leading-tight text-ink-soft">{t.blurb}</p>
          </button>
        ))}
      </div>

      <Button onClick={onContinue} className="mt-6 w-full">
        Continue
      </Button>
    </div>
  );
}

function IncludedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/70 py-2.5 last:border-b-0">
      <span className="text-[12.5px] text-ink-soft">{label}</span>
      <span className="text-[13px] font-semibold text-ink">{value}</span>
    </div>
  );
}

function PreviewStep({
  previewData,
  previewImageUrl,
  generating,
  generateError,
  onBack,
  onGenerate,
}: {
  previewData: CareerCardData;
  previewImageUrl: string;
  generating: boolean;
  generateError: string | null;
  onBack: () => void;
  onGenerate: () => void;
}) {
  return (
    <div>
      <button onClick={onBack} className="-ml-1 flex items-center gap-0.5 text-[12.5px] font-medium text-ink-soft">
        <ChevronLeft size={16} /> Change style
      </button>

      <h1 className="mt-2 text-[19px] font-bold text-ink">This is exactly what will be shared</h1>
      <p className="mt-1 text-[12.5px] text-ink-soft">
        Nothing else from your account is included — review it below before you generate a link.
      </p>

      <div className="mt-4 overflow-hidden rounded-[20px] border border-border bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG (next/og) */}
        <img src={previewImageUrl} alt="Career Card preview" className="w-full" style={{ aspectRatio: "1080 / 1350" }} />
      </div>

      <div className="mt-4 rounded-[16px] border border-border bg-surface p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          <Sparkles size={13} /> What&apos;s included
        </p>
        <div className="mt-1">
          <IncludedRow label="Title" value={previewData.title} />
          <IncludedRow label="Period" value={previewData.periodLabel} />
          <IncludedRow label="Wins captured" value={String(previewData.winsCount)} />
          <IncludedRow label="Leadership moments" value={String(previewData.leadershipCount)} />
          <IncludedRow label="Problems solved" value={String(previewData.problemsSolvedCount)} />
          {previewData.strongestMuscle && <IncludedRow label="Strongest career muscle" value={previewData.strongestMuscle} />}
          {previewData.growingMuscle && <IncludedRow label="Growing fastest" value={previewData.growingMuscle} />}
        </div>
      </div>

      <div className="mt-3 rounded-[16px] border border-emerald-100 bg-emerald-50 p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
          <ShieldCheck size={13} /> Never included
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-emerald-800/80">
          Your memory text, project or client names, and any feedback stay private to your account — only the counts and
          career muscles above are ever part of a shared card.
        </p>
      </div>

      {generateError && (
        <div className="mt-3">
          <ErrorBanner message={generateError} onRetry={onGenerate} />
        </div>
      )}

      <Button onClick={onGenerate} loading={generating} className="mt-5 w-full">
        {generating ? "Generating…" : "Generate & get link"}
      </Button>
    </div>
  );
}

function ShareStep({
  share,
  linkCopied,
  setLinkCopied,
  onCreateAnother,
  onDone,
}: {
  share: ShareResult;
  linkCopied: boolean;
  setLinkCopied: (v: boolean) => void;
  onCreateAnother: () => void;
  onDone: () => void;
}) {
  const imageUrl = `/api/career-wrapped/share-image/${share.shareId}`;
  const shareText = `${share.cardData.title} — captured with ${APP_NAME}.ai`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(share.url);
      setLinkCopied(true);
      trackEvent("career_card_share_clicked", { method: "copy_link" });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable in some contexts -- the link is
      // still visible/selectable in the platform share sheets below.
    }
  }

  function openIntent(kind: "linkedin" | "x" | "whatsapp") {
    const urls: Record<typeof kind, string> = {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(share.url)}`,
      x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(share.url)}&text=${encodeURIComponent(shareText)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${share.url}`)}`,
    };
    trackEvent(kind === "linkedin" ? "career_card_shared_linkedin" : kind === "x" ? "career_card_shared_x" : "career_card_shared_whatsapp");
    window.open(urls[kind], "_blank", "noopener,noreferrer");
  }

  async function handleNativeShare() {
    trackEvent("career_card_share_clicked", { method: "native" });
    if (isNativeApp()) {
      try {
        const { Share } = await import("@capacitor/share");
        markExpectedResume();
        await Share.share({ title: share.cardData.title, text: shareText, url: share.url, dialogTitle: "Share your Career Card" });
      } catch {
        // User cancelled the native share sheet, or the OS rejected it --
        // nothing to recover, the link/image are still on screen below.
      }
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: share.cardData.title, text: shareText, url: share.url });
      } catch {
        // Same as above -- cancellation isn't an error state here.
      }
    }
  }

  const canNativeShare = isNativeApp() || (typeof navigator !== "undefined" && typeof navigator.share === "function");

  return (
    <div>
      <h1 className="text-[19px] font-bold text-ink">Your Career Card is ready</h1>
      <p className="mt-1 text-[12.5px] text-ink-soft">Share the link below — it always shows this card, publicly, to anyone who opens it.</p>

      <div className="mt-4 overflow-hidden rounded-[20px] border border-border bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG (next/og) */}
        <img src={imageUrl} alt={share.cardData.title} className="w-full" style={{ aspectRatio: "1080 / 1350" }} />
      </div>

      {canNativeShare && (
        <button
          onClick={handleNativeShare}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-pill py-3.5 text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#7c3aed,#4f6ef7)" }}
        >
          <Share2 size={16} /> Share
        </button>
      )}

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <a
          href={imageUrl}
          download
          onClick={() => trackEvent("career_card_downloaded")}
          className="flex items-center justify-center gap-1.5 rounded-pill border border-border py-3 text-[13px] font-semibold text-ink"
        >
          <Download size={15} /> Download
        </a>
        <button onClick={copyLink} className="flex items-center justify-center gap-1.5 rounded-pill border border-border py-3 text-[13px] font-semibold text-ink">
          {linkCopied ? <Check size={15} /> : <LinkIcon size={15} />} {linkCopied ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        <button onClick={() => openIntent("linkedin")} className="rounded-pill border border-border py-2.5 text-[12px] font-semibold text-ink">
          LinkedIn
        </button>
        <button onClick={() => openIntent("x")} className="rounded-pill border border-border py-2.5 text-[12px] font-semibold text-ink">
          X
        </button>
        <button onClick={() => openIntent("whatsapp")} className="rounded-pill border border-border py-2.5 text-[12px] font-semibold text-ink">
          WhatsApp
        </button>
      </div>

      <button onClick={onCreateAnother} className="mt-5 w-full text-center text-[12.5px] font-medium text-ink-soft underline underline-offset-2">
        Create another
      </button>
      <Button onClick={onDone} variant="secondary" className="mt-2.5 w-full">
        Done
      </Button>
    </div>
  );
}
