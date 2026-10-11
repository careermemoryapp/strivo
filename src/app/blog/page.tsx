import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { StickyGetAppBar } from "@/components/StickyGetAppBar";
import { categoryAccent, estimateReadingTime } from "@/lib/blogCategoryStyle";
import { APP_NAME, SINGULAR_TRACKING_LINK } from "@/lib/config";
import { listBlogPosts, BLOG_CATEGORIES } from "@/lib/repo/blogPosts";
import { TRIAL_MONTHS } from "@/lib/repo/users";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Blog — ${APP_NAME}`,
  description: "Career advice, interview prep, resume tips, and leadership stories from the Strivo team.",
  alternates: { canonical: "https://strivo.ai/blog" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const posts = listBlogPosts({ category });
  // The newest post is pulled out as a large "Latest" feature card (see
  // below) instead of sitting in the grid like every other post -- added
  // 2026-10-11, direct founder request ("the blog is very boring right
  // now, make it exciting"). Only on the unfiltered "All" view -- picking
  // a category is a reader saying "show me a list," not "surprise me with
  // one," so a filtered view goes straight to the plain grid.
  const [featured, ...rest] = posts;
  const gridPosts = category ? posts : rest;

  return (
    <div id="blog-root" className="min-h-screen font-sans text-white" style={{ background: "#0a0a0f" }}>
      {/* Nav -- the exact same shared header as the homepage and every
          blog post (see MarketingHeader.tsx). Direct founder feedback
          (2026-10-11): "the blog top bar should be same as the top bar of
          the marketing page" -- this used to be a simplified header (plain
          "Blog" text, no social icons); now it's one component everywhere.
          The standalone "Free for 2 months, no card needed" bar that used
          to sit directly under this header was also dropped in the same
          pass -- the real strivo.ai homepage never had it, so matching the
          homepage means not having it here either. */}
      <MarketingHeader navLocation="blog_nav" />

      {/* The opening section of strivo.ai itself -- badge, headline,
          testimonial marquee, CTA, incentive line -- MINUS the app-demo
          video that follows it on the homepage. Direct founder request
          (2026-10-11): "I just want the opening section of strivo.ai...
          before the video part... then start the normal blog." Shared
          with MarketingHome.tsx via MarketingHero.tsx, same section
          classes as the homepage's hero for a pixel-identical opener. The
          Founding Member badge inside points `/#founding-member` -- the
          real section only exists on the homepage, so this navigates
          there instead of a dead in-page anchor. */}
      <section className="relative flex min-h-[100svh] flex-col overflow-hidden px-8 pb-16 pt-6 text-center sm:block sm:min-h-0 sm:pt-8" style={{ background: "#0a0a0f" }}>
        <MarketingHero trialMonths={TRIAL_MONTHS} foundingMemberAnchorHref="/#founding-member" />
      </section>

      {/* Category filter */}
      <section className="border-b border-t border-[#1e1e26] px-8 py-5" style={{ background: "#0a0a0f" }}>
        <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-2">
          <Link
            href="/blog"
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
              !category ? "border-transparent bg-white text-[#0a0a0f]" : "border-[#2a2a35] text-[#a0a0ac] hover:text-white"
            }`}
          >
            All
          </Link>
          {BLOG_CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`/blog?category=${encodeURIComponent(c)}`}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
                category === c ? "border-transparent bg-white text-[#0a0a0f]" : "border-[#2a2a35] text-[#a0a0ac] hover:text-white"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>
      </section>

      {/* Posts */}
      <section className="px-8 py-14 sm:px-12" style={{ background: "#0a0a0f" }}>
        <div className="mx-auto max-w-4xl">
          {posts.length === 0 ? (
            <p className="py-16 text-center text-sm text-[#8a8a99]">
              {category ? `No posts in ${category} yet — check back soon.` : "New posts are on the way — check back soon."}
            </p>
          ) : (
            <>
              {/* Featured/latest post -- big card, colored category badge,
                  reading time. The visual anchor that was missing before:
                  everything used to be the same size, same blue label, so
                  the page read as a flat wall of identical cards. */}
              {featured && !category && (
                <Link
                  href={`/blog/${featured.slug}`}
                  className="group mb-10 flex flex-col overflow-hidden rounded-3xl border border-[#2a2a35] transition-all hover:-translate-y-0.5 hover:border-[#4a4a5a] hover:shadow-[0_20px_60px_rgba(124,58,237,0.15)] sm:flex-row"
                >
                  <div className="aspect-[1200/630] w-full overflow-hidden bg-[#12081f] sm:aspect-auto sm:w-1/2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/blog/${featured.slug}/opengraph-image`}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-col justify-center p-6 sm:w-1/2 sm:p-8">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.1em]"
                        style={{ background: `${categoryAccent(featured.category)}26`, color: categoryAccent(featured.category) }}
                      >
                        {featured.category.toUpperCase()}
                      </span>
                      <span className="text-[10px] font-bold tracking-[0.1em] text-[#5a5a66]">LATEST</span>
                    </div>
                    <p className="mt-3 text-xl font-bold leading-snug text-white sm:text-2xl">{featured.title}</p>
                    <p className="mt-2.5 text-sm leading-relaxed text-[#8a8a99]">{featured.excerpt}</p>
                    <p className="mt-4 text-xs text-[#5a5a66]">
                      {formatDate(featured.created_at)} · {estimateReadingTime(featured.content_html)} min read
                    </p>
                  </div>
                </Link>
              )}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {gridPosts.map((p) => (
                  <Link
                    key={p.id}
                    href={`/blog/${p.slug}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-[#2a2a35] transition-all hover:-translate-y-0.5 hover:border-[#4a4a5a] hover:shadow-[0_12px_32px_rgba(124,58,237,0.12)]"
                  >
                    <div className="aspect-[1200/630] w-full overflow-hidden bg-[#12081f]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/blog/${p.slug}/opengraph-image`}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.1em]"
                        style={{ background: `${categoryAccent(p.category)}26`, color: categoryAccent(p.category) }}
                      >
                        {p.category.toUpperCase()}
                      </span>
                      <p className="mt-2.5 text-base font-bold leading-snug text-white">{p.title}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#8a8a99]">{p.excerpt}</p>
                      <p className="mt-3 text-xs text-[#5a5a66]">
                        {formatDate(p.created_at)} · {estimateReadingTime(p.content_html)} min read
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#1e1e26] px-8 py-6 text-xs text-[#5a5a66] sm:flex-row" style={{ background: "#0a0a0f" }}>
        <span>© {new Date().getFullYear()} {APP_NAME}</span>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <a href="mailto:hello@strivo.ai" className="hover:text-white">Contact</a>
        </div>
      </footer>

      <StickyGetAppBar
        location="blog_index_sticky_bar"
        href={SINGULAR_TRACKING_LINK}
        headline="You're missing out on your next opportunity. Strivo prepares you for it."
        incentive="Free for the first 1,000 users"
      />
    </div>
  );
}
