"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LogoMark } from "@/components/Logo";

// Shared dark header treatment — square corners, glow blobs, same tone as
// Home's header (see DARK in home/page.tsx). Centralizing it here now that
// the staged rollout covers every screen in the app, so all of them read
// off one definition instead of eyeballing several copies in sync.
export const DARK = "#26213c";

export function DarkHeader({
  back,
  logoMark,
  wordmark,
  avatarRight,
  right,
  inlineTitle,
  inlineSubtitle,
  title,
  subtitle,
  children,
}: {
  back?: boolean;
  /** Small circular logo mark next to the back button (compact/detail headers). */
  logoMark?: boolean;
  /** Full "Strivo" logo + wordmark (root screens, or standalone on detail screens). */
  wordmark?: boolean;
  /** Right-aligned slot, typically an Avatar button (root screens). */
  avatarRight?: ReactNode;
  /** Right-aligned slot for anything else (e.g. a menu button on detail screens). */
  right?: ReactNode;
  /** Compact title shown directly in the top row, next to back/logo. */
  inlineTitle?: ReactNode;
  inlineSubtitle?: ReactNode;
  /** Larger title/subtitle shown below the top row (root screens). */
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="relative overflow-hidden px-5 pb-6 pt-6" style={{ background: DARK }}>
      <div
        className="pointer-events-none absolute right-4 top-16 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-2 top-24 h-28 w-28 rounded-full bg-brand-secondary/15 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {back && (
            // h-11 w-11 (44px) is Google's/Apple's minimum recommended touch
            // target -- the old h-8 w-8 (32px) box was fine visually but a
            // genuinely small tap area, which is exactly the kind of thing
            // that makes a button feel like it "sometimes doesn't respond"
            // (the tap just misses). Icon size/position is unchanged --
            // items-center/justify-center still centers it -- so this is a
            // bigger invisible hit area, not a visual change. -ml-[14px]
            // keeps the icon's own left edge exactly where it was at the
            // old -ml-2/h-8 size, so the header layout doesn't shift.
            <button
              onClick={() => router.back()}
              aria-label="Back"
              className="-ml-[14px] flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/85 active:bg-white/10"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          {logoMark && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10">
              <LogoMark size={17} />
            </div>
          )}
          {wordmark && (
            <div className="flex items-center gap-2">
              <LogoMark size={30} />
              <span className="text-[16px] font-bold tracking-tight text-white">Strivo</span>
            </div>
          )}
          {(inlineTitle || inlineSubtitle) && (
            <div className="min-w-0">
              {inlineTitle && <h1 className="truncate text-[15px] font-bold text-white">{inlineTitle}</h1>}
              {inlineSubtitle && <p className="truncate text-[10.5px] text-white/55">{inlineSubtitle}</p>}
            </div>
          )}
        </div>
        {avatarRight ?? right}
      </div>

      {(title || subtitle) && (
        <div className="relative mt-5">
          {title && <h1 className="text-[21px] font-bold leading-tight text-white">{title}</h1>}
          {subtitle && <p className="mt-1 text-[12px] text-white/55">{subtitle}</p>}
        </div>
      )}

      {children}
    </div>
  );
}
