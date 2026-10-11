import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { BlogCta } from "@/components/blog/BlogCta";
import { BlogSidebar } from "@/components/blog/BlogSidebar";
import { RelatedPosts } from "@/components/blog/RelatedPosts";
import { PlayStoreLink } from "@/components/PlayStoreLink";
import { StickyGetAppBar } from "@/components/StickyGetAppBar";
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

  // Up to 3 other posts in the same category, newest first, excluding
  // this one -- fed to RelatedPosts below the article. Fetching 4 and
  // slicing to 3 (rather than asking for exactly 3) covers the case where
  // this post itself is among the 3 most recent in its category.
  const relatedPosts = listBlogPosts({ category: post.category, limit: 4 })
    .filter((p) => p.id !== post.id)
    .slice(0, 3);

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

      {/* Added 2026-10-01: Clarity shows ~14% average scroll depth across
          the site, so most visitors never reach BlogCta at the bottom of
          the post or scroll far enough to trigger StickyGetAppBar. This is
          the one concrete incentive line nearly everyone who opens the
          page will actually see. */}
      <div className="border-b border-[#1e1e26] px-5 py-2 text-center text-[11px] font-semibold tracking-wide text-[#c4b5fd] sm:px-8" style={{ background: "#0a0a0f" }}>
        Free for 2 months · no card needed
      </div>

      {/* Two-column layout -- added 2026-10-11, direct founder request: the
          blog's job is converting readers into downloads, not just
          hosting an article, so a bare centered column with nothing else
          on the page read as "empty" even with a full post in it. Left:
          the article itself (unchanged width/typography from before).
          Right: BlogSidebar (testimonials + the ChatGPT differentiator +
          a CTA), `sticky` so it travels with the reader down a long post
          instead of disappearing after the first screen. Sidebar is
          desktop-only (`hidden lg:block`) -- see BlogSidebar.tsx's own
          comment for why mobile relies on BlogCta + RelatedPosts + the
          sticky bottom bar instead. */}
      <div className="px-8 py-14 sm:px-12" style={{ background: "#0a0a0f" }}>
        <div className="mx-auto flex max-w-6xl gap-12 lg:items-start">
          <article className="min-w-0 max-w-2xl flex-1">
            <Link href="/blog" className="text-xs font-medium text-[#8a8a99] hover:text-white">
              &larr; Back to blog
            </Link>

            <p className="mt-6 text-xs font-semibold tracking-[0.15em] text-brand-secondary">{post.category.toUpperCase()}</p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>
            <p className="mt-3 text-xs text-[#5a5a66]">{formatDate(post.created_at)}</p>

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
            <RelatedPosts posts={relatedPosts} category={post.category} />
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
