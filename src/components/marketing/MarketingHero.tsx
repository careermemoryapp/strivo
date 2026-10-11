"use client";

import { type RefObject } from "react";
import { motion, type Variants } from "framer-motion";
import { Award, Check } from "lucide-react";
import { PlayStoreLink } from "@/components/PlayStoreLink";
import { TestimonialMarquee } from "@/components/marketing/TestimonialMarquee";
import { FOUNDING_MEMBER_TRIAL_MONTHS, SINGULAR_TRACKING_LINK } from "@/lib/config";
import { useFoundingMemberIncentiveText, useFoundingMemberStats } from "@/lib/useFoundingMemberCount";

// Extracted 2026-10-11 from MarketingHome.tsx -- the homepage's opening
// section (badge, headline, testimonial marquee, subhead, CTA, incentive
// line, the three-bullet checklist), WITHOUT the AppDemoVideo that used to
// follow it in the same <section>. Direct founder request: the blog index
// (app/blog/page.tsx) should open with exactly this -- "the opening
// section of strivo.ai... before the video part" -- then go straight into
// the normal post list, not a separately-built hero/testimonial/
// comparison stack. MarketingHome.tsx now renders this too (inside its
// own <section>, immediately followed by its own AppDemoVideo), so the
// homepage's actual hero and the blog's are guaranteed to stay identical
// instead of two copies that could drift.
//
// `heroCtaRef` is optional: the homepage passes it so StickyGetAppBar
// knows when the hero's CTA has scrolled out of view (see its own
// comment); the blog pages have no such wiring and fall back to
// StickyGetAppBar's scroll-distance default, same as they already did
// before this redesign.
//
// `foundingMemberAnchorHref` lets the Founding Member badge's link point
// at the right place depending on where this hero is rendered: "#founding-
// member" (the default, an in-page jump) on the homepage, where that
// section actually exists on the same page, vs. "/#founding-member" on
// the blog, which needs to navigate TO the homepage first.
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

// The main "Get the app" CTA -- used in the hero and again in the
// homepage's closing CTA section (MarketingHome.tsx imports this rather
// than defining its own copy). See this function's original comment
// history (git blame on MarketingHome.tsx) for why it's a static badge,
// not wrapped in a magnetic-hover effect.
export function PillButton({ className = "" }: { className?: string }) {
  return <PlayStoreLink location="hero" href={SINGULAR_TRACKING_LINK} size="lg" className={className} />;
}

function FoundingMemberHeroBadge({ trialMonths, anchorHref }: { trialMonths: number; anchorHref: string }) {
  const stats = useFoundingMemberStats();
  const nextNumber = stats ? Math.min(stats.count + 1, stats.cap) : null;
  const remaining = stats ? Math.max(stats.cap - stats.count, 0) : null;

  return (
    <motion.a
      href={anchorHref}
      variants={fadeUp}
      className="mx-auto mb-7 block w-full max-w-xl rounded-2xl border p-4 text-left transition-colors hover:border-amber-300/60 sm:mb-6"
      style={{ borderColor: "rgba(244,183,63,0.4)", background: "linear-gradient(135deg, rgba(244,183,63,0.12), rgba(124,58,237,0.1))" }}
    >
      <div className="flex items-center gap-2">
        <Award size={15} className="shrink-0" style={{ color: "#f4b73f" }} />
        <span className="text-[10px] font-bold tracking-[0.14em]" style={{ color: "#f4b73f" }}>
          FOUNDING MEMBER OFFER · {remaining !== null ? `${remaining.toLocaleString("en-US")} SPOTS LEFT` : "LIMITED"}
        </span>
      </div>
      <p className="mt-2 text-[15px] font-bold leading-snug text-white sm:text-base">
        Become Founding Member{nextNumber ? ` #${nextNumber}` : ""} — free for {FOUNDING_MEMBER_TRIAL_MONTHS} months, not {trialMonths}.
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-[#b7b7c2]">
        Plus a permanent, lifetime Founding Member badge to show on LinkedIn and social media — you&apos;ll always be
        Strivo&apos;s Founding Member{nextNumber ? ` #${nextNumber}` : ""}, even if we reach a billion users.
      </p>
    </motion.a>
  );
}

export function MarketingHero({
  trialMonths,
  heroCtaRef,
  foundingMemberAnchorHref = "#founding-member",
}: {
  trialMonths: number;
  heroCtaRef?: RefObject<HTMLDivElement | null>;
  foundingMemberAnchorHref?: string;
}) {
  const foundingMemberIncentiveText = useFoundingMemberIncentiveText();

  return (
    <>
      <div
        className="pointer-events-none absolute left-1/2 top-[-120px] -translate-x-1/2"
        style={{
          width: 640,
          height: 420,
          background: "radial-gradient(ellipse at center, rgba(124,58,237,0.35), rgba(79,110,247,0.15) 45%, transparent 75%)",
          filter: "blur(10px)",
        }}
      />
      <motion.div initial="hidden" animate="show" variants={stagger} className="relative flex flex-1 flex-col sm:block">
        <FoundingMemberHeroBadge trialMonths={trialMonths} anchorHref={foundingMemberAnchorHref} />
        <motion.p variants={fadeUp} className="mb-8 text-xs font-semibold tracking-[0.2em] text-brand-primary sm:mb-3">
          YOUR AI CAREER MEMORY
        </motion.p>
        <motion.h1 variants={fadeUp} className="mx-auto text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
          You&apos;re missing out on your next opportunity.
          <br />
          <span
            className="mt-3 block bg-clip-text text-transparent sm:mt-0 sm:inline"
            style={{ backgroundImage: "linear-gradient(90deg,#6d8bff,#c266f2,#e879f9)" }}
          >
            Strivo prepares you for it.
          </span>
        </motion.h1>

        {/* Real testimonials -- see lib/marketingContent.ts. */}
        <motion.div variants={fadeUp} className="mx-auto mt-8 w-full max-w-3xl sm:mt-6">
          <TestimonialMarquee />
        </motion.div>

        <motion.p variants={fadeUp} className="mx-auto mt-7 max-w-md text-base leading-relaxed text-[#a0a0ac] sm:mt-4 sm:text-lg">
          Speak your wins the moment they happen. So when an interview, resume, or performance review comes up, the story&apos;s already there — not buried in a memory you can&apos;t quite reconstruct.
        </motion.p>
        <motion.div ref={heroCtaRef} variants={fadeUp} className="mt-10 sm:mt-6">
          <PillButton />
        </motion.div>
        <motion.p variants={fadeUp} className="mt-5 text-xs text-[#5a5a66] sm:mt-2">
          {foundingMemberIncentiveText} · no card needed
        </motion.p>
        <motion.div variants={fadeUp} className="mx-auto mt-auto flex max-w-lg flex-wrap items-center justify-center gap-x-5 gap-y-4 pt-8 text-xs text-[#8a8a99] sm:mt-5 sm:gap-x-6 sm:gap-y-2 sm:pt-0 sm:text-sm">
          <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-brand-secondary" />Interview tomorrow</span>
          <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-brand-secondary" />Updating your resume</span>
          <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-brand-secondary" />Performance review</span>
        </motion.div>
      </motion.div>
    </>
  );
}
