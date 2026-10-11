import { PlayStoreLink } from "@/components/PlayStoreLink";
import { SINGULAR_TRACKING_LINK } from "@/lib/config";
import { HERO_TESTIMONIALS } from "@/lib/marketingContent";

// The blog's conversion rail -- added 2026-10-11, direct founder request:
// the blog's job is to convert readers into app downloads, not just rank
// for keywords, and a bare article with nothing beside it was converting
// at a fraction of the homepage. Sits to the right of the article body on
// individual posts (see app/blog/[slug]/page.tsx) and stays on screen via
// `sticky` while the (often much longer) article scrolls past it -- the
// caller is responsible for giving the sticky wrapper a tall-enough
// containing block (see that file's comment on `lg:items-start` vs.
// stretch) for it to actually stay pinned for the whole scroll, not just
// the first screen.
//
// Deliberately two sections, not three -- direct founder feedback after
// the first pass included a third "Strivo vs. ChatGPT" card: "you don't
// need to mention the ChatGPT [comparison], just say what Strivo is and
// then the testimonials." That comparison (ChatGptComparisonSection) was
// also dropped from the blog index itself in the same pass -- the index
// now opens with exactly the homepage's hero and nothing else (see
// MarketingHero.tsx) -- so the full comparison today lives only on the
// homepage.
//
// Padding tightened 2026-10-11 (second founder pass, from a live
// screenshot): the original p-5/gap-6/gap-4 spacing pushed the testimonial
// card's content past the visible area in the sticky column -- the last
// testimonial was getting cut off. Trimmed throughout so the same content
// fits in less vertical space.
//
// Only 3 of the 7 HERO_TESTIMONIALS fit here without the sidebar running
// longer than most articles -- same source of truth as the homepage and
// the blog index's TestimonialMarquee, just trimmed for a ~300px column.
const SIDEBAR_TESTIMONIALS = HERO_TESTIMONIALS.slice(0, 3);

export function BlogSidebar() {
  return (
    <div className="flex flex-col gap-4">
      {/* About Strivo -- the same core pitch as BlogCta (end of article)
          and StickyGetAppBar, just framed for a sidebar card instead of a
          full-width banner. */}
      <div
        className="rounded-2xl border border-[#2a2a35] p-4"
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
          className="mt-3.5 w-full justify-center"
        />
        <p className="mt-2 text-center text-[11px] font-semibold text-[#8a8a99]">
          Free for the first 1,000 users
        </p>
      </div>

      {/* Real testimonials -- see lib/marketingContent.ts. */}
      <div
        className="rounded-2xl border border-[#2a2a35] p-4"
        style={{ background: "linear-gradient(160deg,#15121c,#0e0c12)" }}
      >
        <p className="mb-3 text-[10px] font-bold tracking-[0.16em] text-[#6a6a75]">WHAT PEOPLE ARE SAYING</p>
        <div className="flex flex-col gap-3">
          {SIDEBAR_TESTIMONIALS.map((t, i) => (
            <div key={t.name} className={i > 0 ? "border-t border-[#232330] pt-3" : ""}>
              <div className="mb-1.5 flex items-center gap-2">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
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
    </div>
  );
}
