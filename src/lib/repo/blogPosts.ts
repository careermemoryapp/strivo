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

// Valid in-app destinations for a post's CTA -- kept as a fixed allow-list
// (not free-text) so a bad value from the writing automation can never
// produce a CTA button that links somewhere broken or off-app. See
// cta_path's own comment in lib/db.ts's migration.
export const BLOG_CTA_PATHS = ["/record", "/memories", "/chats", "/home"] as const;
export type BlogCtaPath = (typeof BLOG_CTA_PATHS)[number];

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
  // Both null unless the writing automation (or a human publishing
  // manually) explicitly set them -- see cta_label/cta_path's shared
  // comment on their migration in lib/db.ts. Null means "use the generic
  // fallback CTA," not "no CTA at all."
  cta_label: string | null;
  cta_path: string | null;
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

// Blog post bodies come from the daily writing automation (or, in future,
// a founder-facing composer) and are rendered on the public blog with
// dangerouslySetInnerHTML — so even though the writer is instructed to
// only use a small set of tags, this is a second, server-side line of
// defense against stored XSS if that instruction is ever bypassed or the
// publish credential leaks. It's a lightweight allow-list pass (not a full
// HTML parser), but it removes every realistic script-injection vector:
// <script>/<style>/<iframe>/<object>/<embed> blocks, inline event-handler
// attributes (onclick=...), and javascript:/data: URIs in links.
const ALLOWED_TAGS = new Set(["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "a", "blockquote", "br"]);

function sanitizeBlogHtml(html: string): string {
  let out = html
    // Strip entire elements whose content should never reach the page.
    .replace(/<(script|style|iframe|object|embed|link|meta|form|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta|form|noscript)\b[^>]*\/?>/gi, "");

  // Walk every remaining tag: drop ones not on the allow-list (but keep
  // their text content), and on allowed tags strip all attributes except a
  // safe `href` on <a> (http/https/relative only — no javascript:/data:).
  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    const isClosing = full.startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) return ""; // drop disallowed tags, keep inner text
    if (isClosing) return `</${tag}>`;
    if (tag === "a") {
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']*)["']/i);
      const href = hrefMatch?.[1]?.trim() ?? "";
      const safeHref = /^(https?:\/\/|\/)/i.test(href) ? href : "";
      return safeHref
        ? `<a href="${safeHref.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer nofollow">`
        : `<a>`;
    }
    return `<${tag}>`;
  });

  return out.trim();
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

// Oldest-first, unlike listBlogPosts() above (which is newest-first for the
// public /blog listing) -- this feeds the daily Product Updates email drip
// (see /api/product-update-drip/run), where each user works through the
// backlog in publish order starting from post #1, not newest-first.
export function listProductUpdatePostsOrdered(): BlogPost[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM blog_posts WHERE category = 'Product Updates' ORDER BY created_at ASC`)
    .all() as BlogPost[];
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
  // Both optional -- see cta_label/cta_path's comment on the BlogPost type
  // above. ctaPath is validated against BLOG_CTA_PATHS by the caller
  // (/api/blog/publish's zod schema); this function trusts it's already a
  // safe value by the time it gets here, same as every other field.
  ctaLabel?: string;
  ctaPath?: string;
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
    `INSERT INTO blog_posts (id, slug, title, meta_title, meta_description, category, excerpt, content_html, keywords, cta_label, cta_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    slug,
    input.title.trim(),
    input.metaTitle.trim(),
    input.metaDescription.trim(),
    input.category,
    input.excerpt.trim(),
    sanitizeBlogHtml(input.contentHtml),
    input.keywords?.trim() || null,
    input.ctaLabel?.trim() || null,
    input.ctaPath?.trim() || null,
    created_at
  );

  return db.prepare(`SELECT * FROM blog_posts WHERE id = ?`).get(id) as BlogPost;
}
