"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Download, Link as LinkIcon, Check, Share2 } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Button } from "@/components/Button";
import { APP_NAME } from "@/lib/config";
import { trackEvent } from "@/lib/trackEvent";
import { isNativeApp, markExpectedResume } from "@/lib/nativePlatform";
import type { FoundingMemberCardData } from "@/lib/founderCardImage";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};
const reducedMotionVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } };

// No "preview then generate" step here, unlike CareerWrappedCardClient --
// see (app)/founding-member/page.tsx's comment for why: the share already
// exists by the time this renders, so this is a single screen, not a flow.
export function FoundingMemberClient({
  shareId,
  url,
  cardData,
}: {
  shareId: string;
  url: string;
  cardData: FoundingMemberCardData;
}) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotionVariants : fadeUp;
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    trackEvent("founding_member_viewed", {});
    // Fired here rather than in the share API route -- that route is
    // get-or-create and runs again every time this page loads, but the
    // "card generated" event should only reflect that a card exists for
    // this person, which is already true after the very first view.
    trackEvent("founding_member_card_generated", {});
  }, []);

  const imageUrl = `/api/founding-member/share-image/${shareId}`;
  const shareText = `I'm Founding Member #${cardData.memberNumber} of ${APP_NAME}.ai.`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      trackEvent("founding_member_card_share_clicked", { method: "copy_link" });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable in some contexts -- the link is
      // still visible/selectable in the platform share sheets below.
    }
  }

  function openIntent(kind: "linkedin" | "x" | "whatsapp") {
    const urls: Record<typeof kind, string> = {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`,
    };
    trackEvent(
      kind === "linkedin"
        ? "founding_member_card_shared_linkedin"
        : kind === "x"
          ? "founding_member_card_shared_x"
          : "founding_member_card_shared_whatsapp"
    );
    window.open(urls[kind], "_blank", "noopener,noreferrer");
  }

  async function handleNativeShare() {
    trackEvent("founding_member_card_share_clicked", { method: "native" });
    if (isNativeApp()) {
      try {
        const { Share } = await import("@capacitor/share");
        markExpectedResume();
        await Share.share({ title: shareText, text: shareText, url, dialogTitle: "Share your Founding Member card" });
      } catch {
        // User cancelled the native share sheet, or the OS rejected it --
        // nothing to recover, the link/image are still on screen below.
      }
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareText, text: shareText, url });
      } catch {
        // Same as above -- cancellation isn't an error state here.
      }
    }
  }

  const canNativeShare = isNativeApp() || (typeof navigator !== "undefined" && typeof navigator.share === "function");

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="Founding Member" />

      <motion.div initial="hidden" animate="show" variants={variants} className="px-5 pt-5">
        <h1 className="text-[19px] font-bold text-ink">You&apos;re Founding Member #{cardData.memberNumber}</h1>
        <p className="mt-1 text-[12.5px] text-ink-soft">
          One of the first {cardData.cap.toLocaleString("en-US")} people on {APP_NAME}. Share it, or keep it to yourself —
          either way, it&apos;s yours for good.
        </p>

        <div className="mt-4 overflow-hidden rounded-[20px] border border-border bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG (next/og) */}
          <img src={imageUrl} alt={`Founding Member #${cardData.memberNumber}`} className="w-full" style={{ aspectRatio: "1080 / 1350" }} />
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
            onClick={() => trackEvent("founding_member_card_downloaded")}
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

        <Button onClick={() => router.push("/home")} variant="secondary" className="mt-5 w-full">
          Done
        </Button>
      </motion.div>
    </div>
  );
}
