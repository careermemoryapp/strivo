import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { BlogCta } from "@/components/blog/BlogCta";
import { APP_NAME, PLAY_STORE_URL } from "@/lib/config";
import { getBlogPostBySlug } from "@/lib/repo/blogPosts";

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

      <header className="flex items-center justify-between border-b border-[#1e1e26] px-8 py-5" style={{ background: "#0a0a0f" }}>
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[15px] font-extrabold tracking-tight">{APP_NAME.toUpperCase()}</span>
        </Link>
        <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#888] hover:text-white">
          Get the app →
        </a>
      </header>

      <article className="px-8 py-14 sm:px-12" style={{ background: "#0a0a0f" }}>
        <div className="mx-auto max-w-2xl">
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
        </div>
      </article>

      <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#1e1e26] px-8 py-6 text-xs text-[#5a5a66] sm:flex-row" style={{ background: "#0a0a0f" }}>
        <span>© {new Date().getFullYear()} {APP_NAME}</span>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <a href="mailto:hello@strivo.ai" className="hover:text-white">Contact</a>
        </div>
      </footer>
    </div>
  );
}
