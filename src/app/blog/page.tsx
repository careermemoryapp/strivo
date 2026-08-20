import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { APP_NAME, PLAY_STORE_URL } from "@/lib/config";
import { listBlogPosts, BLOG_CATEGORIES } from "@/lib/repo/blogPosts";

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

  return (
    <div id="blog-root" className="min-h-screen font-sans text-white" style={{ background: "#0a0a0f" }}>
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-[#1e1e26] px-8 py-5" style={{ background: "#0a0a0f" }}>
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[15px] font-extrabold tracking-tight">{APP_NAME.toUpperCase()}</span>
        </Link>
        <div className="flex items-center gap-6">
          <span className="text-xs font-semibold text-white">Blog</span>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#888] hover:text-white">
            Get the app →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#1e1e26] px-8 py-20 text-center sm:py-28" style={{ background: "#0a0a0f" }}>
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
          style={{
            width: 640,
            height: 420,
            background: "radial-gradient(ellipse at center, rgba(124,58,237,0.35), rgba(79,110,247,0.12) 45%, transparent 75%)",
          }}
        />
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#2a2a35] bg-[#12081f] px-4 py-1.5 text-xs font-semibold tracking-[0.15em] text-brand-primary">
            THE {APP_NAME.toUpperCase()} BLOG
          </p>
          <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
            Career advice,
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg,#6d8bff,#c266f2,#e879f9)" }}
            >
              interview prep, and stories
            </span>{" "}
            to help you tell yours better.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-[#a0a0ac] sm:text-base">
            Practical, specific advice on interviews, resumes, and career growth — no fluff.
          </p>
        </div>
      </section>

      {/* Category filter */}
      <section className="border-b border-[#1e1e26] px-8 py-5" style={{ background: "#0a0a0f" }}>
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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {posts.map((p) => (
                <Link
                  key={p.id}
                  href={`/blog/${p.slug}`}
                  className="flex flex-col overflow-hidden rounded-2xl border border-[#2a2a35] transition-colors hover:border-[#3a3a4a]"
                >
                  <div className="aspect-[1200/630] w-full overflow-hidden bg-[#12081f]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/blog/${p.slug}/opengraph-image`} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="p-5">
                    <p className="text-[10px] font-semibold tracking-[0.1em] text-brand-secondary">{p.category.toUpperCase()}</p>
                    <p className="mt-2 text-base font-bold leading-snug text-white">{p.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#8a8a99]">{p.excerpt}</p>
                    <p className="mt-3 text-xs text-[#5a5a66]">{formatDate(p.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
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
    </div>
  );
}
