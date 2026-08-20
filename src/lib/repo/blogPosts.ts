import { getDb, newId, nowIso } from "@/lib/db";

// The fixed set of blog categories — kept as a plain list (not a DB table)
// since it changes rarely and every place that needs it (the composer, the
// category filter pills on /blog) can just import this constant. Add a new
// category here and it's immediately usable everywhere.
export const BLOG_CATEGORIES = [
  "Interview Prep",
  "Resume Tips",
  "Career Growth",
  "Leadership",
  "Product Updates",
] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  meta_title: string;
  meta_description: string;
  category: string;
  excerpt: string;
  content_html: string;
  keywords: string | null;
  created_at: string;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function listBlogPosts(opts: { category?: string; limit?: number } = {}): BlogPost[] {
  const db = getDb();
  if (opts.category) {
    return db
      .prepare(`SELECT * FROM blog_posts WHERE category = ? ORDER BY created_at DESC LIMIT ?`)
      .all(opts.category, opts.limit ?? 100) as BlogPost[];
  }
  return db.prepare(`SELECT * FROM blog_posts ORDER BY created_at DESC LIMIT ?`).all(opts.limit ?? 100) as BlogPost[];
}

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM blog_posts WHERE slug = ?`).get(slug) as BlogPost | undefined;
}

// Used by the daily automation to avoid picking a topic it's already
// covered — it fetches this list first and is instructed to pick something
// not already titled similarly.
export function listBlogPostTitles(): { title: string; category: string }[] {
  const db = getDb();
  return db.prepare(`SELECT title, category FROM blog_posts ORDER BY created_at DESC`).all() as {
    title: string;
    category: string;
  }[];
}

export function createBlogPost(input: {
  title: string;
  metaTitle: string;
  metaDescription: string;
  category: string;
  excerpt: string;
  contentHtml: string;
  keywords?: string;
}): BlogPost {
  const db = getDb();
  const id = newId("blog");
  const created_at = nowIso();

  // Slugs must be unique; if today's title collides with an existing one
  // (shouldn't happen given the automation checks first, but the founder
  // could also publish manually), suffix with a short counter instead of
  // erroring.
  let slug = slugify(input.title);
  let attempt = 1;
  while (getDb().prepare(`SELECT 1 FROM blog_posts WHERE slug = ?`).get(slug)) {
    attempt += 1;
    slug = `${slugify(input.title)}-${attempt}`;
  }

  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_title, meta_description, category, excerpt, content_html, keywords, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    slug,
    input.title.trim(),
    input.metaTitle.trim(),
    input.metaDescription.trim(),
    input.category,
    input.excerpt.trim(),
    input.contentHtml,
    input.keywords?.trim() || null,
    created_at
  );

  return db.prepare(`SELECT * FROM blog_posts WHERE id = ?`).get(id) as BlogPost;
}
