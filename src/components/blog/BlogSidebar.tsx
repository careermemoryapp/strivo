import { Check } from "lucide-react";
import { PlayStoreLink } from "@/components/PlayStoreLink";
import { SINGULAR_TRACKING_LINK } from "@/lib/config";
import { COMPARISON_POINTS, HERO_TESTIMONIALS } from "@/lib/marketingContent";

// The blog's conversion rail -- added 2026-10-11, direct founder request:
// the blog's job is to convert readers into app downloads, not just rank
// for keywords, and a bare article with nothing beside it was converting
// at a fraction of the homepage. Sits to the right of the article body on
// individual posts (see app/blog/[slug]/page.tsx) and stays on screen via
// `sticky` while the (often much longer) article scrolls past it.
// Desktop-only (`hidden lg:block` is set by the caller around this
// component, not in here) -- on mobile the sticky bottom bar, the
// in-article CTA (BlogCta), and RelatedPosts below the article already
// carry the conversion job; stacking all of this UNDER the article on a
// phone would just push the actual content further away, which is the
// opposite of the goal.
//
// Only 3 of the 5 COMPARISON_POINTS and 3 of the 7 HERO_TESTIMONIALS fit
// here without the sidebar running longer than most articles -- same
// source of truth as the homepage (lib/marketingContent.ts) and the blog
// index's full-length sections (TestimonialMarquee, ChatGptComparisonSection),
// just trimmed for a ~300px column instead of a full-width section.
const SIDEBAR_TESTIMONIALS = HERO_TESTIMONIALS.slice(0, 3);
const SIDEBAR_COMPARISON_POINTS = COMPARISON_POINTS.slice(0, 3);

export function BlogSidebar() {
  return (
    <div className="flex flex-col gap-6">
      {/* CTA card -- the same core pitch as BlogCta (end of article) and
          StickyGetAppBar, just framed for a sidebar card instead of a
          full-width banner. */}
      <div
        className="rounded-2xl border border-[#2a2a35] p-5"
        style={{ background: "linear-gradient(135deg,#160a26,#0a0a0f)" }}
      >
        <p className="text-xs font-semibold tracking-[0.15em] text-brand-primary">YOUR AI CAREER MEMORY</p>
        <p className="mt-2 text-sm leading-relaxed text-[#c8c8d0]">
          Speak a work win the moment it happens. Strivo turns it into a searchable memory — ready as
          an interview story, resume line, or leadership example whenever you need it.
        </p>
        <PlayStoreLink
          location="blog_sidebar_cta"
          href={SINGULAR_TRACKING_LINK}
          size="md"
          className="mt-4 w-full justify-center"
        />
        <p className="mt-2.5 text-center text-[11px] font-semibold text-[#8a8a99]">
          Free for the first 1,000 users
        </p>
      </div>

      {/* Real testimonials -- see lib/marketingContent.ts. */}
      <div
        className="rounded-2xl border border-[#2a2a35] p-5"
        style={{ background: "linear-gradient(160deg,#15121c,#0e0c12)" }}
      >
        <p className="mb-4 text-[10px] font-bold tracking-[0.16em] text-[#6a6a75]">WHAT PEOPLE ARE SAYING</p>
        <div className="flex flex-col gap-4">
          {SIDEBAR_TESTIMONIALS.map((t, i) => (
            <div
              key={t.name}
              className={i > 0 ? "border-t border-[#232330] pt-4" : ""}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-white"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#4f6ef7)" }}
                >
                  {t.initial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold text-white">{t.name}</p>
                  <p className="truncate text-[10.5px] text-[#8a8a99]">{t.role}</p>
                </div>
              </div>
              <p className="mb-1 text-[10px] tracking-[1.5px] text-[#fbbf24]">&#9733;&#9733;&#9733;&#9733;&#9733;</p>
              <p className="text-[12px] leading-relaxed text-[#d4d4db]">{t.quote}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Condensed differentiator -- full version lives on the homepage
          and the blog index (ChatGptComparisonSection); this is the
          3-point, icon-only version that fits a sidebar card. */}
      <div className="rounded-2xl border border-[#2a2a35] p-5" style={{ background: "#0d0d14" }}>
        <p className="mb-1 text-[10px] font-bold tracking-[0.16em] text-[#6a6a75]">STRIVO VS. CHATGPT</p>
        <p className="mb-4 text-xs leading-relaxed text-[#8a8a99]">
          Not a bigger model — a different job. Strivo acts on your behalf, without being asked.
        </p>
        <div className="flex flex-col gap-3">
          {SIDEBAR_COMPARISON_POINTS.map((c) => (
            <div key={c.title} className="flex items-start gap-2.5">
              <div
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }}
              >
                <Check size={11} strokeWidth={3.5} />
              </div>
              <p className="text-xs leading-relaxed text-[#c8c8d0]">
                <span className="font-semibold text-white">{c.title}.</span> ChatGPT and Claude can&apos;t.
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
