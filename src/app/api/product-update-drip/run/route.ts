import { NextResponse } from "next/server";
import { isAdminAuthed, checkProductUpdateDripSecret } from "@/lib/adminAuth";
import { listUsersDueForProductUpdateDrip, markProductUpdateSent } from "@/lib/repo/users";
import { listProductUpdatePostsOrdered } from "@/lib/repo/blogPosts";
import { sendProductUpdateEmail } from "@/lib/email";

// Runs once a day (see the 9am scheduled task -- an hour after the 8am
// blog-writing automation, so a user who's fully caught up on the backlog
// is guaranteed to see that day's brand-new post already published before
// this runs) to send everyone the next post in THEIR OWN Product Updates
// sequence. Deliberately per-user rather than "email everyone today's
// post": two people who joined on different days are never sent the same
// email on the same day, and nobody skips the backlog -- see
// product_update_sent_count's comment on the User type (repo/users.ts) and
// its migration comment in lib/db.ts for the full mechanics.
//
// Same shape as every other cron-secret-gated automation (weekly-recap,
// engagement-nudge, category-insight, resume-reminder): admin session OR
// this route's own secret header.
// Repeat sends are gated on elapsed time since product_update_last_sent_at,
// NOT on how often this route gets called -- the actual crontab entry on the
// server (confirmed 2026-09-10: `38 3 * * *`, i.e. 3:38 UTC = 9:08 IST,
// daily) fires once a day regardless; this constant alone decides whether
// any given user is actually due on a given day's run. Since the cron is
// daily, a gate ABOVE 24h (like this one) means every other daily run
// actually sends to a given user -- true alternate-day cadence from a
// single once-a-day cron, no separate every-other-day schedule needed.
//
// 2026-09-10: founder's call, confirmed alternate-day (back from a brief
// same-day revert to 20h/daily -- see git history if that's ever needed
// again). ~44h rather than exactly 48h so the cron has room to land a
// little early/late run-to-run without a send ever slipping to a 3-day gap.
// Sequence/content order (posts[user.product_update_sent_count]) is
// untouched by this -- only the cadence between sends changed.
const REPEAT_SEND_GATE_MS = 44 * 60 * 60 * 1000; // ~44h -- alternate-day cadence

// Strivo's target market is India — same IST convention as
// weekly-recap/run's sevenDaysAgoIstMidnightUtc (and lib/retrieval.ts,
// lib/ai.ts). Duplicated rather than imported since it's a tiny fixed
// constant, same reasoning as those files.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The UTC instant for "midnight IST at the start of today" -- anyone who
// signed up before this instant registered on an earlier IST calendar day,
// and is therefore due for their first drip email today, regardless of
// what time of day (IST) they actually signed up.
function todayIstMidnightUtc(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}

export async function POST(req: Request) {
  const authed = (await isAdminAuthed()) || checkProductUpdateDripSecret(req.headers.get("x-product-update-drip-secret"));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posts = listProductUpdatePostsOrdered();
  if (posts.length === 0) {
    return NextResponse.json({ ok: true, usersConsidered: 0, sent: 0, note: "No Product Updates posts published yet." });
  }

  const now = new Date();
  const sentAtCutoffIso = new Date(now.getTime() - REPEAT_SEND_GATE_MS).toISOString();
  const firstSendCutoffIso = todayIstMidnightUtc(now).toISOString();
  const candidates = listUsersDueForProductUpdateDrip(sentAtCutoffIso, firstSendCutoffIso);

  let sent = 0;
  let alreadyCaughtUp = 0;
  let failed = 0;

  for (const user of candidates) {
    // sent_count doubles as the 0-based index into the ordered post list --
    // once it reaches posts.length, this person has read every Product
    // Update ever published and just waits for tomorrow's new one (which,
    // once published, extends posts.length and makes them due again).
    const nextPost = posts[user.product_update_sent_count];
    if (!nextPost) {
      alreadyCaughtUp++;
      continue;
    }

    const ok = await sendProductUpdateEmail({
      toEmail: user.email,
      toUserId: user.id,
      firstName: user.first_name,
      postTitle: nextPost.title,
      postExcerpt: nextPost.excerpt,
      postContentHtml: nextPost.content_html,
      postUrl: `https://strivo.ai/blog/${nextPost.slug}`,
      ctaLabel: nextPost.cta_label ?? undefined,
      ctaPath: nextPost.cta_path ?? undefined,
    });

    if (ok) {
      markProductUpdateSent(user.id, now.toISOString());
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    usersConsidered: candidates.length,
    sent,
    alreadyCaughtUp,
    failed,
    totalPostsInSequence: posts.length,
  });
}
