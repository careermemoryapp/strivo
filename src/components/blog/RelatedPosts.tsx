import Link from "next/link";
import type { BlogPost } from "@/lib/repo/blogPosts";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// "More in <Category>" -- sits below the article on an individual post
// (app/blog/[slug]/page.tsx), fed up to 3 other posts in the same
// category. Added 2026-10-11, direct founder request alongside
// BlogSidebar: once someone finishes an article, the only places left to
// go were "back to the full list" or "leave" -- this keeps them reading
// inside Strivo's own content (and inside the funnel) a little longer
// instead of bouncing. Card markup is deliberately identical to the post
// grid on the blog index (app/blog/page.tsx) so a reader doesn't see two
// different "this is an article card" visual languages on the same site.
export function RelatedPosts({ posts, category }: { posts: BlogPost[]; category: string }) {
  if (posts.length === 0) return null;

  return (
    <div>
      <p className="mb-6 text-xs font-semibold tracking-[0.15em] text-brand-secondary">MORE IN {category.toUpperCase()}</p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
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
            <div className="p-4">
              <p className="text-sm font-bold leading-snug text-white">{p.title}</p>
              <p className="mt-2 text-xs text-[#5a5a66]">{formatDate(p.created_at)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
