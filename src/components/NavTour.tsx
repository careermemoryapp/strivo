"use client";

import { createContext, useContext, useEffect, useState } from "react";

// First-run product tour, redesigned around the actual record→save→chat
// loop instead of a static tour of the nav bar. Three checkpoints:
//   0 -> not started: spotlight the Record tab, telling them to start there.
//   1 -> mid-flow: no overlay here (they're busy recording). The Record
//        page itself (see record/page.tsx) shows a "that's saved" callout
//        the moment their FIRST memory finishes saving, and advances to 2.
//   2 -> spotlight the Chats tab, telling them they can ask about it there.
//        Shown wherever BottomNav renders, including right on the Record
//        success screen -- no navigation required for this step to appear.
//   3 -> done. Never shown again (see nav_tour_step's own comment on the
//        User type in repo/users.ts).
// Lives at (app)/layout.tsx's level (same lifetime as CurrentUserProvider)
// so state survives client-side tab switches between Home/Record/Chats --
// see CurrentUserContext.tsx for why that layer is the right place for
// session-lived state that would otherwise reset on every navigation.
type NavTourContextValue = {
  step: number;
  advance: (next: number) => void;
  skip: () => void;
};

const NavTourContext = createContext<NavTourContextValue | null>(null);

export function useNavTour() {
  const ctx = useContext(NavTourContext);
  // Never actually null in practice (NavTourProvider wraps the whole (app)
  // shell), but a no-op fallback means a page that forgets the provider
  // fails soft instead of crashing.
  return ctx ?? { step: 3, advance: () => {}, skip: () => {} };
}

function persist(step: number) {
  fetch("/api/tour/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step }),
  }).catch(() => {});
}

export function NavTourProvider({
  initialStep,
  children,
}: {
  initialStep: number;
  children: React.ReactNode;
}) {
  const [step, setStep] = useState(initialStep);

  function advance(next: number) {
    setStep(next);
    persist(next);
  }

  function skip() {
    advance(3);
  }

  return (
    <NavTourContext.Provider value={{ step, advance, skip }}>
      {children}
      <NavTourSpotlight step={step} onNext={advance} onSkip={skip} />
    </NavTourContext.Provider>
  );
}

const SPOTLIGHT_STEPS: Record<number, { tourId: string; title: string; body: string; cta: string }> = {
  0: {
    tourId: "nav-record",
    title: "Start here",
    body: "Tap Record and tell Strivo about something that just happened — a win, a piece of feedback, anything.",
    cta: "Got it",
  },
  2: {
    tourId: "nav-chats",
    title: "Now try this",
    body: "Head to Chats and ask Strivo anything about what you just recorded — or anything else about your career.",
    cta: "Got it",
  },
};

type Rect = { top: number; left: number; width: number; height: number };

function measure(tourId: string): Rect | null {
  const el = document.querySelector(`[data-tour-id="${tourId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// Thin selector with no state of its own -- just picks which config (if
// any) applies to the current step. The actual measuring lives in
// SpotlightCard below, remounted fresh via `key` whenever the target
// changes, so there's no stale rect from a PREVIOUS step to explicitly
// clear (avoids a synchronous setState(null) at the top of an effect,
// which react-hooks/set-state-in-effect flags even though it's harmless
// here -- a fresh mount gets a clean useState(null) for free instead).
function NavTourSpotlight({
  step,
  onNext,
  onSkip,
}: {
  step: number;
  onNext: (next: number) => void;
  onSkip: () => void;
}) {
  const config = SPOTLIGHT_STEPS[step];
  if (!config) return null;
  return <SpotlightCard key={config.tourId} config={config} step={step} onNext={onNext} onSkip={onSkip} />;
}

function SpotlightCard({
  config,
  step,
  onNext,
  onSkip,
}: {
  config: { tourId: string; title: string; body: string; cta: string };
  step: number;
  onNext: (next: number) => void;
  onSkip: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    // Poll briefly rather than a single measure -- on first mount (or right
    // after navigating to a new page) BottomNav may not have laid out yet,
    // so one requestAnimationFrame pass alone occasionally caught a 0x0 rect.
    function tick() {
      if (cancelled) return;
      const r = measure(config.tourId);
      if (r && r.width > 0) {
        setRect(r);
      } else {
        raf = requestAnimationFrame(tick);
      }
    }
    tick();
    window.addEventListener("resize", tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", tick);
    };
  }, [config]);

  if (!rect) return null;

  const PAD = 8;
  const cx = rect.left - PAD;
  const cy = rect.top - PAD;
  const cw = rect.width + PAD * 2;
  const ch = rect.height + PAD * 2;

  const tooltipWidth = 260;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 375;
  let tooltipLeft = cx + cw / 2 - tooltipWidth / 2;
  tooltipLeft = Math.max(12, Math.min(tooltipLeft, viewportWidth - tooltipWidth - 12));

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="App tour">
      {/* Single "spotlight hole" div via an oversized box-shadow, rather than
          four hand-computed dark rectangles around the cutout -- that
          approach mixed top/left/right/bottom offsets on the same element
          in a way that's easy to get subtly wrong (and did: the darkening
          wasn't reliably showing on-device). A huge spread box-shadow is
          the standard, much harder-to-get-wrong way to do this: the shadow
          covers the entire viewport, this element's own background stays
          transparent, and pointer-events-none means it never blocks taps
          on the real nav underneath. */}
      <div
        className="absolute rounded-2xl pointer-events-none"
        style={{ top: cy, left: cx, width: cw, height: ch, boxShadow: "0 0 0 9999px rgba(0,0,0,0.75)" }}
      />
      <div
        className="absolute rounded-2xl ring-2 ring-white/80 pointer-events-none"
        style={{ top: cy, left: cx, width: cw, height: ch }}
      />

      <div
        className="absolute rounded-[16px] bg-[#1c1830] p-4 shadow-xl"
        style={{ left: tooltipLeft, top: Math.max(12, cy - 132), width: tooltipWidth }}
      >
        <p className="text-[14px] font-bold text-white">{config.title}</p>
        <p className="mt-1 text-[12.5px] leading-snug text-white/70">{config.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <button onClick={onSkip} className="text-[12px] font-semibold text-white/50">
            Skip
          </button>
          <button
            onClick={() => onNext(step + 1)}
            className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
          >
            {config.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
