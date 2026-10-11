// Per-category accent color for the blog -- added 2026-10-11, direct
// founder request ("the blog is very boring right now, make it exciting")
// alongside the index/post redesign. Every category previously rendered
// with the same flat brand-secondary blue label, which was part of why
// the index page read as a uniform wall of identical cards. Used for the
// category pill on index cards, the featured-post card, the category
// label on an individual post, and RelatedPosts -- one map so a new
// category (added to BLOG_CATEGORIES in repo/blogPosts.ts) just needs a
// line here, or falls back to the brand color below if someone forgets.
const BLOG_CATEGORY_ACCENTS: Record<string, string> = {
  "Interview Prep": "#f4b73f",
  "Resume Tips": "#34d399",
  "Career Growth": "#60a5fa",
  "Leadership": "#a78bfa",
  "Performance Reviews": "#f472b6",
  "Product Updates": "#4f6ef7",
};

export function categoryAccent(category: string): string {
  return BLOG_CATEGORY_ACCENTS[category] ?? "#4f6ef7";
}

// A rough, standard reading-time estimate (200 wpm) from a post's stored
// content_html -- strips tags first since the real word count is what a
// reader experiences, not the markup around it. Used next to the
// published date on the index cards and the individual post page; this
// is the same kind of small, concrete "this feels like a real blog, not
// a bare article dump" signal the featured-post treatment and category
// colors are going for.
export function estimateReadingTime(contentHtml: string): number {
  const text = contentHtml.replace(/<[^>]+>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
