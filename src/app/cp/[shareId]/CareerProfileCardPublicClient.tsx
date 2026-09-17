"use client";

import { useState } from "react";
import { Download, Link as LinkIcon, Check, Share2 } from "lucide-react";
import { APP_NAME } from "@/lib/config";
import { isNativeApp, markExpectedResume } from "@/lib/nativePlatform";

type CardRow = { quizId: string; eyebrow: string; title: string };
type CardData = { title: string; rows: CardRow[] };

// This page does double duty: the person who just generated their card
// lands here straight from /quiz/reveal (they want to share it), and
// anyone who clicks the link they shared also lands here (they want to see
// the card and, ideally, go take the quiz themselves). So both a share
// row (native share sheet, LinkedIn/X/WhatsApp, copy link) and the
// "Discover yours" conversion CTA live on the same page -- mirrors what
// the old in-app CareerProfileCardClient.tsx's ShareStep offered, now that
// there's no separate in-app reveal screen to carry it.
//
// The image itself carries the visual design; this page's job is just to
// display it, offer every way to get it out into the world, and bring new
// people back into the product. Referral params on the CTA
// (ref=career_profile&cp=) let a new visitor arriving this way be
// correlated back to this specific share at signup time, same as the
// Career Wrapped equivalent's ref=career_card&cw=.
export function CareerProfileCardPublicClient({ shareId, cardData, imageUrl }: { shareId: string; cardData: CardData; imageUrl: string }) {
  const [linkCopied, setLinkCopied] = useState(false);

  // Always read live rather than threading a server-computed APP_ORIGIN
  // down as a prop -- this page's own URL (whatever host/path it's
  // actually being viewed at) is the correct thing to share, and it's the
  // one value here that's only ever used inside a click handler, never
  // rendered into the initial page output, so there's no hydration risk.
  function currentUrl(): string {
    return typeof window !== "undefined" ? window.location.href : `https://strivo.ai/cp/${shareId}`;
  }
  const shareText = `${cardData.title} — discovered on ${APP_NAME}.ai`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(currentUrl());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable in some contexts -- the platform
      // share buttons below still work without it.
    }
  }

  function openIntent(kind: "linkedin" | "x" | "whatsapp") {
    const url = currentUrl();
    const urls: Record<typeof kind, string> = {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`,
    };
    window.open(urls[kind], "_blank", "noopener,noreferrer");
  }

  async function handleNativeShare() {
    const url = currentUrl();
    if (isNativeApp()) {
      try {
        const { Share } = await import("@capacitor/share");
        markExpectedResume();
        await Share.share({ title: cardData.title, text: shareText, url, dialogTitle: "Share your Career Profile Card" });
      } catch {
        // User cancelled the native share sheet, or the OS rejected it --
        // nothing to recover, every other share option is still on screen.
      }
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: cardData.title, text: shareText, url });
      } catch {
        // Same as above -- cancellation isn't an error state here.
      }
    }
  }

  const canNativeShare = isNativeApp() || (typeof navigator !== "undefined" && typeof navigator.share === "function");

  return (
    <div
      id="cp-root"
      className="flex min-h-screen flex-col items-center bg-[#0a0a0f] px-5 py-10 text-white"
      style={{ background: "#0a0a0f" }}
    >
      <div className="w-full max-w-sm">
        {/* Matches CAREER_PROFILE_CARD_SIZE (1080 x 1700) -- keeps the
            placeholder box the right shape while the PNG loads instead of
            collapsing/reflowing once it does. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG (next/og) */}
        <img
          src={imageUrl}
          alt={cardData.title}
          className="w-full rounded-[20px] shadow-2xl"
          style={{ aspectRatio: "1080 / 1700" }}
        />

        <div className="mt-6 text-center">
          <p className="text-lg font-bold">{cardData.title}</p>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-white/70">
            5 quick discoveries about how they work — built with {APP_NAME}.ai.
          </p>
        </div>

        {canNativeShare && (
          <button
            onClick={handleNativeShare}
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-pill border border-white/15 py-3.5 text-sm font-semibold text-white"
          >
            <Share2 size={16} /> Share
          </button>
        )}

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <a
            href={imageUrl}
            download
            className="flex items-center justify-center gap-1.5 rounded-pill border border-white/15 py-3 text-[13px] font-semibold text-white/85"
          >
            <Download size={15} /> Download
          </a>
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-1.5 rounded-pill border border-white/15 py-3 text-[13px] font-semibold text-white/85"
          >
            {linkCopied ? <Check size={15} /> : <LinkIcon size={15} />} {linkCopied ? "Copied" : "Copy link"}
          </button>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2.5">
          <button onClick={() => openIntent("linkedin")} className="rounded-pill border border-white/15 py-2.5 text-[12px] font-semibold text-white/85">
            LinkedIn
          </button>
          <button onClick={() => openIntent("x")} className="rounded-pill border border-white/15 py-2.5 text-[12px] font-semibold text-white/85">
            X
          </button>
          <button onClick={() => openIntent("whatsapp")} className="rounded-pill border border-white/15 py-2.5 text-[12px] font-semibold text-white/85">
            WhatsApp
          </button>
        </div>

        <a
          href={`/quiz?ref=career_profile&cp=${shareId}`}
          className="mt-6 flex w-full items-center justify-center rounded-pill py-3.5 text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#7c3aed,#4f6ef7)" }}
        >
          Discover yours — take the quiz on {APP_NAME}.ai
        </a>
      </div>
    </div>
  );
}
