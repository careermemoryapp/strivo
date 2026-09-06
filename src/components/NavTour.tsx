"use client";

import { createContext, useContext, useEffect, useState } from "react";

// First-run product tour: a self-paced, upfront 3-step walkthrough of the
// record -> save -> chat loop. Deliberately NOT gated on the user actually
// doing anything -- earlier versions waited for a real memory to be saved
// before showing step 2, which just looked broken ("I clicked Got it and
// nothing happened") because nothing visibly changed until the user went
// and performed the action themselves. Now all 3 steps play out purely from
// button taps, back-to-back, right where the user already is -- they see
// the whole flow explained up front, then go use the app afterward.
//   0 -> "Step 1 of 3": spotlight the Record tab.
//   1 -> "Step 2 of 3": centered card (no nav target) explaining that
//        whatever they record is saved as a memory.
//   2 -> "Step 3 of 3": spotlight the Chats tab.
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

const TOTAL_STEPS = 3;

// tourId present -> spotlight that nav item (measured via SpotlightCard).
// tourId absent -> a plain centered card with no cutout, for the middle
// step that doesn't correspond to a specific nav element.
const SPOTLIGHT_STEPS: Record<number, { tourId?: string; title: string; body: string; cta: string }> = {
  0: {
    tourId: "nav-record",
    title: "Record",
    body: "Tap Record and tell Strivo about something that just happened — a win, a piece of feedback, anything worth remembering.",
    cta: "Next",
  },
  1: {
    tourId: "nav-memories",
    title: "Saved as a memory",
    body: "Everything you record is saved here in Memories — organized and searchable, so you never have to write it down anywhere else.",
    cta: "Next",
  },
  2: {
    tourId: "nav-chats",
    title: "Ask anything",
    body: "Head to Chats anytime to ask Strivo about your career — it answers using everything you've recorded.",
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

// Step counter + Skip/Next row, shared by both the spotlight card and the
// centered (no-target) card so "every step marked 1/2/3" reads the same way
// regardless of which layout that step uses.
function TourCardChrome({
  step,
  title,
  body,
  cta,
  onNext,
  onSkip,
}: {
  step: number;
  title: string;
  body: string;
  cta: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
          Step {step + 1} of {TOTAL_STEPS}
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: i === step ? "#a78bfa" : "rgba(255,255,255,0.25)" }}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-[14px] font-bold text-white">{title}</p>
      <p className="mt-1 text-[12.5px] leading-snug text-white/70">{body}</p>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={onSkip} className="text-[12px] font-semibold text-white/50">
          Skip
        </button>
        <button
          onClick={onNext}
          className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
        >
          {cta}
        </button>
      </div>
    </>
  );
}

// Thin selector with no state of its own -- just picks which config (if
// any) applies to the current step, and which layout (spotlight vs
// centered) that config needs.
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
  if (config.tourId) {
    return <SpotlightCard key={config.tourId} config={{ ...config, tourId: config.tourId }} step={step} onNext={onNext} onSkip={onSkip} />;
  }
  return <CenteredTourCard key={`step-${step}`} config={config} step={step} onNext={onNext} onSkip={onSkip} />;
}

// The middle step doesn't point at a nav element, so it's just a plain
// dimmed overlay with a centered card -- same visual language (dark card,
// step counter, Skip/Next) as the spotlight steps either side of it.
function CenteredTourCard({
  config,
  step,
  onNext,
  onSkip,
}: {
  config: { title: string; body: string; cta: string };
  step: number;
  onNext: (next: number) => void;
  onSkip: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-6"
      role="dialog"
      aria-modal="true"
      aria-label="App tour"
    >
      <div className="w-full max-w-[300px] rounded-[16px] bg-[#1c1830] p-4 shadow-xl">
        <TourCardChrome
          step={step}
          title={config.title}
          body={config.body}
          cta={config.cta}
          onNext={() => onNext(step + 1)}
          onSkip={onSkip}
        />
      </div>
    </div>
  );
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
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  let tooltipLeft = cx + cw / 2 - tooltipWidth / 2;
  tooltipLeft = Math.max(12, Math.min(tooltipLeft, viewportWidth - tooltipWidth - 12));
  // Anchored by its BOTTOM edge (distance up from the spotlighted rect),
  // not a hardcoded top offset -- nav items sit right at the bottom of the
  // screen, so a fixed top offset combined with a taller card (longer body
  // text on some steps) pushed the card's bottom edge down far enough to
  // overlap the bottom nav itself. Anchoring to bottom lets the card grow
  // upward by however tall it actually is, always leaving the same gap
  // above the nav bar.
  const tooltipBottom = viewportHeight - cy + 12;

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
        style={{ left: tooltipLeft, bottom: tooltipBottom, width: tooltipWidth, maxHeight: `calc(100vh - ${tooltipBottom}px - 12px)`, overflowY: "auto" }}
      >
        <TourCardChrome
          step={step}
          title={config.title}
          body={config.body}
          cta={config.cta}
          onNext={() => onNext(step + 1)}
          onSkip={onSkip}
        />
      </div>
    </div>
  );
}
