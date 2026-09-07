import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed, checkProductUpdateDripSecret } from "@/lib/adminAuth";
import { getUserByEmail } from "@/lib/repo/users";
import { listProductUpdatePostsOrdered } from "@/lib/repo/blogPosts";
import { sendProductUpdateEmail } from "@/lib/email";

// Lets the founder preview a REAL send of the Product Updates drip email to
// any inbox on demand, without touching anyone's actual drip progress --
// deliberately separate from /api/product-update-drip/run, which is the
// real per-user daily job (see its own comment for the full mechanics).
// This route always sends whatever "Block 1" (posts[0], oldest Product
// Update) currently is, and never calls markProductUpdateSent for anyone,
// so running this as many times as you like can't affect the real 25/26
// users' sequences or double-count against them.
//
// Same auth shape as the real run route: admin session OR the same
// PRODUCT_UPDATE_DRIP_SECRET header (reusing that secret rather than
// minting a new one purely for a test-send helper).
const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkProductUpdateDripSecret(req.headers.get("x-product-update-drip-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const posts = listProductUpdatePostsOrdered();
  if (posts.length === 0) {
    return NextResponse.json({ error: "No Product Updates posts published yet." }, { status: 400 });
  }
  const firstPost = posts[0];

  // If the target address happens to belong to a real Strivo account, use
  // their real first name and a real (working) unsubscribe link -- nicer
  // preview, and harmless since this send is never recorded against their
  // drip progress either way. Otherwise fall back to a generic name/id;
  // the unsubscribe link on a fabricated id simply won't match a real row
  // if ever clicked, which is fine for a one-off test send.
  const existingUser = getUserByEmail(parsed.data.email);

  const ok = await sendProductUpdateEmail({
    toEmail: parsed.data.email,
    toUserId: existingUser?.id ?? "product-update-test-send",
    firstName: existingUser?.first_name ?? "there",
    postTitle: firstPost.title,
    postExcerpt: firstPost.excerpt,
    postContentHtml: firstPost.content_html,
    postUrl: `https://strivo.ai/blog/${firstPost.slug}`,
    ctaLabel: firstPost.cta_label ?? undefined,
    ctaPath: firstPost.cta_path ?? undefined,
  });

  if (!ok) {
    return NextResponse.json({ error: "Send failed -- check server logs/Sentry." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentTo: parsed.data.email, postTitle: firstPost.title });
}
