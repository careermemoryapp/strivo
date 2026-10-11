import { HERO_TESTIMONIALS } from "@/lib/marketingContent";

// Extracted 2026-10-11 from MarketingHome.tsx's hero -- rendered inside
// MarketingHero.tsx, which both the homepage and the blog index
// (app/blog/page.tsx) now share, plus a trimmed copy in BlogSidebar.tsx --
// so this exact real testimonials/marquee strip shows up everywhere
// without a second copy that could drift. Deliberately NOT wrapped in
// framer-motion here
// (unlike MarketingHome.tsx's usage, which wraps this in its own
// <motion.div variants={fadeUp}>) -- the blog pages are plain server
// components with no other client-side animation on them, and the CSS
// marquee itself needs no JS at all, so this component stays server-
// renderable on its own.
export function TestimonialMarquee({ label = "WHAT PEOPLE ARE SAYING" }: { label?: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="mb-2.5 text-center text-[10px] font-bold tracking-[0.16em] text-[#6a6a75]">{label}</p>
      <div
        className="w-full overflow-hidden"
        style={{
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
          maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        }}
      >
        <div className="animate-testimonial-marquee flex w-max gap-3.5">
          {[...HERO_TESTIMONIALS, ...HERO_TESTIMONIALS].map((t, i) => (
            <div
              key={`${t.name}-${i}`}
              className="flex h-[168px] w-60 shrink-0 flex-col justify-start rounded-2xl border border-[#2a2a35] p-4"
              style={{ background: "linear-gradient(160deg,#15121c,#0e0c12)", boxShadow: "0 10px 26px rgba(0,0,0,0.3)" }}
            >
              <div className="mb-2.5 flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#4f6ef7)" }}
                >
                  {t.initial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-bold text-white">{t.name}</p>
                  <p className="truncate text-[10.5px] text-[#8a8a99]">{t.role}</p>
                </div>
              </div>
              <p className="mb-1.5 text-[11px] tracking-[1.5px] text-[#fbbf24]">&#9733;&#9733;&#9733;&#9733;&#9733;</p>
              <p className="text-[12px] leading-relaxed text-[#d4d4db]">{t.quote}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
