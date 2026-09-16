"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Download, Link as LinkIcon, Check, Share2, Mic, ShieldCheck } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { APP_NAME } from "@/lib/config";
import { trackEvent } from "@/lib/trackEvent";
import { isNativeApp, markExpectedResume } from "@/lib/nativePlatform";
import type { CareerProfileCardData } from "@/lib/careerProfileCardImage";

type ShareResult = { shareId: string; url: string; cardData: CareerProfileCardData };
type Step = "preview" | "share";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};
const reducedMotionVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } };

const PREVIEW_IMAGE_URL = "/api/career-profile/card-preview";

// Same 2-step preview -> generate/share flow as CareerWrappedCardClient.tsx
// (see that file's comment). The one addition here is the conversion nudge
// on the share step (Home redesign plan, section G): once someone has just
// gotten their quiz-based Career Profile, the natural next beat is inviting
// them into the real, memory-evidence-based product -- Career Wrapped.
// Deliberately still never blends the two: the nudge is framed as "now try
// the real thing", never as though this card came from actual memories.
export function CareerProfileCardClient({ previewData }: { previewData: CareerProfileCardData }) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotionVariants : fadeUp;

  const [step, setStep] = useState<Step>("preview");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    trackEvent("career_profile_card_revealed", {});
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/career-profile/share", { method: "POST" });
      if (!res.ok) throw new Error("Could not generate your card. Please try again.");
      const data = (await res.json()) as ShareResult;
      setShare(data);
      trackEvent("career_profile_card_generated", {});
      setStep("share");
    } catch {
      setGenerateError("Something went wrong generating your card. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="Career Profile Card" />

      <motion.div initial="hidden" animate="show" variants={variants} className="px-5 pt-5">
        {step === "preview" && (
          <PreviewStep previewData={previewData} generating={generating} generateError={generateError} onGenerate={handleGenerate} />
        )}

        {step === "share" && share && (
          <ShareStep
            share={share}
            linkCopied={linkCopied}
            setLinkCopied={setLinkCopied}
            onDone={() => router.push("/career-profile")}
          />
        )}
      </motion.div>
    </div>
  );
}

function PreviewStep({
  previewData,
  generating,
  generateError,
  onGenerate,
}: {
  previewData: CareerProfileCardData;
  generating: boolean;
  generateError: string | null;
  onGenerate: () => void;
}) {
  return (
    <div>
      <h1 className="text-[19px] font-bold text-ink">✨ Your Career Profile is ready</h1>
      <p className="mt-1 text-[12.5px] text-ink-soft">This is exactly what will be shared — review it below before you generate a link.</p>

      <div className="mt-4 overflow-hidden rounded-[20px] border border-border bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG (next/og) */}
        <img src={PREVIEW_IMAGE_URL} alt={previewData.title} className="w-full" style={{ aspectRatio: "1080 / 1350" }} />
      </div>

      <div className="mt-4 rounded-[16px] border border-emerald-100 bg-emerald-50 p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
          <ShieldCheck size={13} /> Just your 5 results
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-emerald-800/80">
          Your Career Profile is based on your quiz answers only — nothing from your actual career memories is ever part of
          this card.
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
  onDone,
}: {
  share: ShareResult;
  linkCopied: boolean;
  setLinkCopied: (v: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const imageUrl = `/api/career-profile/share-image/${share.shareId}`;
  const shareText = `${share.cardData.title} — discovered on ${APP_NAME}.ai`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(share.url);
      setLinkCopied(true);
      trackEvent("career_profile_card_share_clicked", { method: "copy_link" });
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
    trackEvent(
      kind === "linkedin" ? "career_profile_card_shared_linkedin" : kind === "x" ? "career_profile_card_shared_x" : "career_profile_card_shared_whatsapp"
    );
    window.open(urls[kind], "_blank", "noopener,noreferrer");
  }

  async function handleNativeShare() {
    trackEvent("career_profile_card_share_clicked", { method: "native" });
    if (isNativeApp()) {
      try {
        const { Share } = await import("@capacitor/share");
        markExpectedResume();
        await Share.share({ title: share.cardData.title, text: shareText, url: share.url, dialogTitle: "Share your Career Profile Card" });
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
      <h1 className="text-[19px] font-bold text-ink">Your Career Profile Card is ready</h1>
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
          onClick={() => trackEvent("career_profile_card_downloaded")}
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

      {/* Conversion nudge (Home redesign plan, section G) -- Career Profile
          is quiz-based and works from day one; this is the deliberate hand-off
          moment into the real, evidence-based product. Framed as "now the
          real thing", never implying the card above came from memories. */}
      <div className="mt-6 rounded-[18px] p-5" style={{ background: "linear-gradient(135deg,#2a2140,#3a2145)" }}>
        <p className="text-[13px] font-semibold text-white">Your Career Profile is based on your answers.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">
          Now let {APP_NAME}.ai learn from your actual career — capture one real memory and Career Wrapped starts building
          from the evidence.
        </p>
        <button
          onClick={() => {
            trackEvent("career_profile_add_memory_clicked", { source: "career_profile_card" });
            router.push("/record");
          }}
          className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-pill py-3 text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)" }}
        >
          <Mic size={15} /> Tell Strivo.ai something you&apos;re proud of
        </button>
      </div>

      <Button onClick={onDone} variant="secondary" className="mt-4 w-full">
        Done
      </Button>
    </div>
  );
}
