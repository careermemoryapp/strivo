import Link from "next/link";
import { categoryAccent, estimateReadingTime } from "@/lib/blogCategoryStyle";
import type { BlogPost } from "@/lib/repo/blogPosts";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Sits below the article on an individual post (app/blog/[slug]/page.tsx),
// fed up to 3 posts to show next. Added 2026-10-11, direct founder
// request alongside BlogSidebar: once someone finishes an article, the
// only places left to go were "back to the full list" or "leave" -- this
// keeps them reading inside Strivo's own content (and inside the funnel)
// a little longer instead of bouncing.
//
// `heading` is passed by the caller rather than computed in here: the
// page prefers same-category posts, but backfills with the newest posts
// from OTHER categories when a category is too new to have 3 of its own
// yet (e.g. a brand-new category's first article has nothing else to
// point to) -- "More in X" would be misleading once that backfill kicks
// in, so the page decides the right heading for whichever mix it ends up
// passing down.
export function RelatedPosts({ posts, heading }: { posts: BlogPost[]; heading: string }) {
  if (posts.length === 0) return null;

  return (
    <div>
      <p className="mb-6 text-xs font-semibold tracking-[0.15em] text-brand-secondary">{heading.toUpperCase()}</p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {posts.map((p) => (
          <Link
            key={p.id}
            href={`/blog/${p.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-[#2a2a35] transition-all hover:-translate-y-0.5 hover:border-[#4a4a5a]"
          >
            <div className="aspect-[1200/630] w-full overflow-hidden bg-[#12081f]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/blog/${p.slug}/cover`}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="p-4">
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-bold tracking-[0.1em]"
                style={{ background: `${categoryAccent(p.category)}26`, color: categoryAccent(p.category) }}
              >
                {p.category.toUpperCase()}
              </span>
              <p className="mt-2 text-sm font-bold leading-snug text-white">{p.title}</p>
              <p className="mt-2 text-xs text-[#5a5a66]">
                {formatDate(p.created_at)} · {estimateReadingTime(p.content_html)} min read
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
