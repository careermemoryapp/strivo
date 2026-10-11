import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { BlogCta } from "@/components/blog/BlogCta";
import { BlogSidebar } from "@/components/blog/BlogSidebar";
import { RelatedPosts } from "@/components/blog/RelatedPosts";
import { PlayStoreLink } from "@/components/PlayStoreLink";
import { StickyGetAppBar } from "@/components/StickyGetAppBar";
import { categoryAccent, estimateReadingTime } from "@/lib/blogCategoryStyle";
import { APP_NAME, SINGULAR_TRACKING_LINK } from "@/lib/config";
import { getBlogPostBySlug, listBlogPosts } from "@/lib/repo/blogPosts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return {};
  const url = `https://strivo.ai/blog/${post.slug}`;
  return {
    title: post.meta_title,
    description: post.meta_description,
    keywords: post.keywords || undefined,
    alternates: { canonical: url },
    openGraph: { title: post.meta_title, description: post.meta_description, url, type: "article" },
    twitter: { title: post.meta_title, description: post.meta_description },
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  // Prefer up to 3 other posts in the SAME category; if the category is
  // too new to have 3 of its own yet (e.g. this is its first article),
  // backfill with the newest posts from any other category so the
  // section is never empty -- added 2026-10-11 after exactly that case
  // (a brand-new category's only post had nothing to point to). The
  // heading reflects whichever mix this post actually got.
  const sameCategory = listBlogPosts({ category: post.category, limit: 4 }).filter((p) => p.id !== post.id);
  let relatedPosts = sameCategory.slice(0, 3);
  let relatedHeading = `More in ${post.category}`;
  if (relatedPosts.length < 3) {
    const usedIds = new Set([post.id, ...relatedPosts.map((p) => p.id)]);
    const backfill = listBlogPosts({ limit: 3 + usedIds.size }).filter((p) => !usedIds.has(p.id));
    if (backfill.length > 0) {
      relatedPosts = [...relatedPosts, ...backfill].slice(0, 3);
      relatedHeading = "More from the blog";
    }
  }

  const readingTime = estimateReadingTime(post.content_html);
  const accent = categoryAccent(post.category);

  const url = `https://strivo.ai/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.meta_description,
    datePublished: post.created_at,
    dateModified: post.created_at,
    image: `https://strivo.ai/blog/${post.slug}/opengraph-image`,
    author: { "@type": "Organization", name: APP_NAME },
    publisher: { "@type": "Organization", name: APP_NAME },
    mainEntityOfPage: url,
  };

  return (
    <div id="blog-root" className="min-h-screen font-sans text-white" style={{ background: "#0a0a0f" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Sticky + a real button, not a gray text link -- see the same
          comment in MarketingHome.tsx's header. This is the ONE CTA that
          stays on screen for the entire time someone's reading a post,
          which can run well past a screen's worth of scrolling before
          they'd otherwise reach BlogCta at the bottom. */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between border-b border-[#1e1e26] px-5 py-5 sm:px-8"
        style={{ background: "#0a0a0f" }}
      >
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <LogoMark size={28} />
          <span className="hidden text-[15px] font-extrabold tracking-tight sm:inline">{APP_NAME.toUpperCase()}</span>
        </Link>
        <PlayStoreLink location="blog_post_nav" href={SINGULAR_TRACKING_LINK} size="sm" />
      </header>

      {/* Two-column layout -- added 2026-10-11, direct founder request: the
          blog's job is converting readers into downloads, not just
          hosting an article. Left: the article. Right: BlogSidebar
          (About Strivo + testimonials), `sticky` so it travels with the
          reader down a long post. The standalone "Free for 2 months, no
          card needed" bar that used to sit above the article was dropped
          in this pass -- the sidebar now carries that job, and repeating
          it right above the article too read as redundant once the
          sidebar was added (direct founder feedback).

          `items-stretch` (the default -- NOT `items-start`) on the row is
          deliberate: it makes the <aside> stretch to the article's full
          height, which is what actually lets `sticky` inside it travel
          the WHOLE scroll instead of unsticking after one screen. With
          `items-start` the aside only gets as tall as its own content
          (roughly the same height as the sticky div itself), so the
          sticky element has almost no room to stick before running out of
          containing block -- confirmed the actual cause after a direct
          founder report ("it should stay sticky even scrolling the
          article"). Sidebar is desktop-only (`hidden lg:block`) -- on
          mobile, BlogCta + RelatedPosts + the sticky bottom bar carry the
          conversion job instead of stacking all of this under the
          article. */}
      <div className="px-8 py-14 sm:px-12" style={{ background: "#0a0a0f" }}>
        <div className="mx-auto flex max-w-6xl gap-12">
          <article className="min-w-0 max-w-2xl flex-1">
            <Link href="/blog" className="text-xs font-medium text-[#8a8a99] hover:text-white">
              &larr; Back to blog
            </Link>

            <span
              className="mt-6 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.1em]"
              style={{ background: `${accent}26`, color: accent }}
            >
              {post.category.toUpperCase()}
            </span>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>
            <p className="mt-3 text-xs text-[#5a5a66]">
              {formatDate(post.created_at)} · {readingTime} min read
            </p>

            <div className="mt-8 overflow-hidden rounded-2xl border border-[#2a2a35]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/blog/${post.slug}/opengraph-image`} alt="" className="w-full" />
            </div>

            <div
              className="prose-blog mt-10 text-[15px] leading-relaxed text-[#c8c8d0]"
              dangerouslySetInnerHTML={{ __html: post.content_html }}
            />

            <BlogCta />
          </article>

          <aside className="hidden w-[320px] shrink-0 lg:block">
            <div className="sticky top-24">
              <BlogSidebar />
            </div>
          </aside>
        </div>

        {relatedPosts.length > 0 && (
          <div className="mx-auto mt-16 max-w-6xl border-t border-[#1e1e26] pt-12">
            <RelatedPosts posts={relatedPosts} heading={relatedHeading} />
          </div>
        )}
      </div>

      <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#1e1e26] px-8 py-6 text-xs text-[#5a5a66] sm:flex-row" style={{ background: "#0a0a0f" }}>
        <span>© {new Date().getFullYear()} {APP_NAME}</span>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <a href="mailto:hello@strivo.ai" className="hover:text-white">Contact</a>
        </div>
      </footer>

      <StickyGetAppBar
        location="blog_post_sticky_bar"
        href={SINGULAR_TRACKING_LINK}
        headline="Turn what you just read into your own story."
        incentive="Free for the first 1,000 users"
      />
    </div>
  );
}
