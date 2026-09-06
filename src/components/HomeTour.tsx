"use client";

import { useEffect, useState } from "react";

// SUPERSEDED -- kept only because this file lives in the connected
// workspace folder where Claude can't delete files. The single-page,
// Home-only nav tour below was replaced by NavTour.tsx (a 3-checkpoint tour
// spanning Record -> save -> Chats, tracked via nav_tour_step so it
// survives tab switches) after feedback that a tour landing entirely on
// Home didn't match the actual record/save/chat flow. Nothing imports this
// file anymore -- see NavTour.tsx for the real implementation.
//
// First-run coachmark/spotlight tour, shown once on top of Home. Walks a
// brand-new user through the persistent BottomNav (Home/Chats/Memories/
// Record) -- deliberately NOT a tour of the record→chat flow, since
// /first-record already gives every new user that "wow" moment before they
// ever reach Home (see the comment on has_seen_nav_tour in repo/users.ts).
// This only orients them to where things live once that's done.
//
// Renders nothing until it has located its current target's DOM node via
// data-tour-id (see BottomNav.tsx), so there's never a flash of a dimmed
// screen with no cutout. If a target ever can't be found (e.g. BottomNav
// hasn't mounted yet), it retries on a short interval rather than giving up,
// since this fires on first paint of Home when layout is still settling.
const STEPS: { tourId: string; title: string; body: string }[] = [
  {
    tourId: "nav-home",
    title: "This is Home",
    body: "Your day-to-day view — quick actions, recent chats, and anything Strivo wants to surface for you.",
  },
  {
    tourId: "nav-chats",
    title: "Chats",
    body: "Every conversation you've had with Strivo, saved and searchable.",
  },
  {
    tourId: "nav-memories",
    title: "Memories",
    body: "Everything you've recorded — wins, feedback, projects — organized and ready to pull up.",
  },
  {
    tourId: "nav-record",
    title: "Record",
    body: "The fastest way in: talk or type about something that just happened, and Strivo remembers it for you.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function measure(tourId: string): Rect | null {
  const el = document.querySelector(`[data-tour-id="${tourId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function HomeTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    // Poll briefly instead of a single measure -- on first mount BottomNav
    // may not have laid out yet (fonts/images still settling), so one
    // requestAnimationFrame pass alone occasionally caught a 0x0 rect.
    function tick() {
      if (cancelled) return;
      const r = measure(STEPS[step].tourId);
      if (r && r.width > 0) {
        setRect(r);
      } else {
        raf = requestAnimationFrame(tick);
      }
    }
    tick();
    // Re-measure on resize/orientation change so the cutout tracks the real
    // nav position rather than a stale one from a different viewport size.
    window.addEventListener("resize", tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", tick);
    };
  }, [step]);

  function finish() {
    onDone();
  }

  function next() {
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
    setRect(null);
    setStep((s) => s + 1);
  }

  if (!rect) return null;

  const PAD = 8;
  const cx = rect.left - PAD;
  const cy = rect.top - PAD;
  const cw = rect.width + PAD * 2;
  const ch = rect.height + PAD * 2;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Tooltip sits above the nav (which is pinned to the bottom of the
  // screen), anchored to the same horizontal position as the cutout but
  // clamped so it never runs off either edge on narrow phones.
  const tooltipWidth = 260;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 375;
  let tooltipLeft = cx + cw / 2 - tooltipWidth / 2;
  tooltipLeft = Math.max(12, Math.min(tooltipLeft, viewportWidth - tooltipWidth - 12));

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="App tour">
      {/* Four dimmed rectangles around the cutout, rather than one overlay
          with a CSS mask -- avoids relying on mask-image browser support
          inside the Android WebView this app also runs in. */}
      <div className="absolute bg-black/70" style={{ top: 0, left: 0, right: 0, height: Math.max(0, cy) }} />
      <div
        className="absolute bg-black/70"
        style={{ top: cy, left: 0, width: Math.max(0, cx), height: ch }}
      />
      <div
        className="absolute bg-black/70"
        style={{ top: cy, left: cx + cw, right: 0, height: ch }}
      />
      <div className="absolute bg-black/70" style={{ top: cy + ch, left: 0, right: 0, bottom: 0 }} />

      {/* Cutout ring */}
      <div
        className="absolute rounded-2xl ring-2 ring-white/80"
        style={{ top: cy, left: cx, width: cw, height: ch }}
      />

      <div
        className="absolute rounded-[16px] bg-[#1c1830] p-4 shadow-xl"
        style={{ left: tooltipLeft, top: Math.max(12, cy - 132), width: tooltipWidth }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-300">
          Step {step + 1} of {STEPS.length}
        </p>
        <p className="mt-1.5 text-[14px] font-bold text-white">{current.title}</p>
        <p className="mt-1 text-[12.5px] leading-snug text-white/70">{current.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <button onClick={finish} className="text-[12px] font-semibold text-white/50">
            Skip
          </button>
          <button
            onClick={next}
            className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
          >
            {isLast ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
