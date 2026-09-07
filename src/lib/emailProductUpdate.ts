// Builds the daily "Product Updates" drip email -- one blog post per user
// per day, picked from the Product Updates category in chronological order
// (see the drip-scheduling logic in repo/users.ts / the cron route this
// feeds, once built). Subject is literally the post's title, per the
// founder's explicit request ("title of the blog is a subject").
//
// The FULL article body is embedded in the email (not just an excerpt +
// link) -- per the founder's explicit call: "nobody will go and read [a
// linked page], so it should be neat and clean and well organized" right
// in the inbox. postContentHtml is expected to already be the post's
// sanitized content_html (see ALLOWED_TAGS/sanitizeBlogHtml in
// repo/blogPosts.ts) -- only h2/h3/p/ul/ol/li/strong/em/a/blockquote/br,
// no attributes except a safe href on <a>. styleForEmail() below relies on
// that exact bare-tag shape to inject inline styles via straightforward
// string replacement (real email clients ignore <style> blocks and most
// CSS classes, so every element needs inline style="..." to render
// consistently) -- this is NOT a general-purpose HTML sanitizer/styler, it
// only handles the specific tag set sanitizeBlogHtml is guaranteed to
// produce.
//
// A dedicated pure-function template (same reasoning as emailWelcome.ts and
// emailGift.ts) rather than the generic admin-campaign
// wrapBrandedEmail()/markdown-lite path: this is a fully automated,
// structured send, not free-form admin-composed prose.
//
// Pure functions, no server-only imports -- safe to reuse from an admin/
// preview tool, same as emailWelcome.ts and emailGift.ts.

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ACCENT = "#8b5cf6";
const LOGO_URL = "https://strivo.ai/logo-email.png";

// Injects inline styles into the specific bare-tag shape sanitizeBlogHtml
// always produces (see the file-level comment above) -- string replacement
// is safe here only because the input's tag set is already constrained
// upstream, not because this function does any sanitizing of its own.
function styleForEmail(html: string): string {
  return html
    .replace(/<h2>/g, '<h2 style="margin:26px 0 10px;font-size:17px;font-weight:700;line-height:1.4;color:#1a1523;">')
    .replace(/<h3>/g, '<h3 style="margin:20px 0 8px;font-size:15px;font-weight:700;line-height:1.4;color:#1a1523;">')
    .replace(/<p>/g, '<p style="margin:0 0 14px;font-size:14.5px;line-height:1.7;color:#3a3448;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 14px;padding-left:20px;">')
    .replace(/<ol>/g, '<ol style="margin:0 0 14px;padding-left:20px;">')
    .replace(/<li>/g, '<li style="margin-bottom:6px;font-size:14.5px;line-height:1.6;color:#3a3448;">')
    .replace(
      /<blockquote>/g,
      '<blockquote style="margin:0 0 14px;padding:2px 16px;border-left:3px solid #8b5cf6;color:#6b6577;font-style:italic;">'
    )
    .replace(/<a /g, `<a style="color:${ACCENT};text-decoration:underline;" `)
    .replace(/<strong>/g, '<strong style="font-weight:700;color:#1a1523;">');
}

// Plain-text fallback for the Text MIME part -- strips tags down to
// readable text with paragraph/heading breaks and "- " bullets instead of
// leaving markup literally in the fallback some mail clients show.
function htmlToPlainText(html: string): string {
  return html
    .replace(/<li>/g, "- ")
    .replace(/<\/(h2|h3|p|li|blockquote)>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ProductUpdateEmailParams = {
  firstName: string;
  postTitle: string;
  postExcerpt: string;
  postContentHtml: string;
  postUrl: string;
  unsubscribeUrl: string;
  // Customized per post -- e.g. a Record-feature post ends with "Record
  // your first memory" -> /record, a Memories post with "Create a memory"
  // -> /memories, a Chat post with "Ask Strivo something" -> /chats. The
  // caller (see /api/product-update-drip/run and the test-send route) is
  // responsible for resolving these from the post's cta_label/cta_path
  // columns with a generic "Open Strivo" -> /home fallback when a post
  // doesn't set them -- this file just renders whatever it's given.
  ctaLabel: string;
  ctaUrl: string;
};

export function renderProductUpdateEmailHtml(params: ProductUpdateEmailParams): string {
  const name = escapeHtml(params.firstName);
  const title = escapeHtml(params.postTitle);
  const excerpt = escapeHtml(params.postExcerpt);
  const content = styleForEmail(params.postContentHtml);
  const ctaLabel = escapeHtml(params.ctaLabel);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Strivo</title>
</head>
<body style="margin:0;padding:0;background:#faf9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9fc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #f0ecf7;">

          <tr>
            <td style="height:6px;background-color:${ACCENT};"></td>
          </tr>

          <tr>
            <td style="padding:26px 36px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:10px;">
                    <img src="${LOGO_URL}" width="32" height="32" alt="Strivo" style="display:block;width:32px;height:32px;border:0;border-radius:8px;" />
                  </td>
                  <td>
                    <p style="margin:0;font-size:17px;font-weight:700;color:#1a1523;line-height:32px;">Strivo</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 36px 0;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${ACCENT};">Product Update</p>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 36px 0;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:700;line-height:1.35;color:#1a1523;">${title}</p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#8b849b;">Hey ${name} — ${excerpt}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 36px 0;">
              <div style="height:1px;background:#f0ecf7;"></div>
            </td>
          </tr>

          <!-- Full article body, inline -- see the file-level comment on
               why nobody has to leave the inbox to read this. -->
          <tr>
            <td style="padding:20px 36px 4px;">
              ${content}
            </td>
          </tr>

          <!-- Customized CTA -- what to DO next, not just where to read
               more (the full article is already inline above). Points at
               a plain https://strivo.ai path; on a phone with the app
               installed this currently opens the mobile browser rather
               than the native app itself (no Android App Links/deep-link
               verification wired up yet for arbitrary in-app routes --
               only the one-off OAuth callback deep link exists today, see
               AndroidManifest.xml). Logged-in users land straight on the
               right screen there either way. -->
          <tr>
            <td style="padding:22px 36px 6px;">
              <a href="${params.ctaUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 26px;border-radius:999px;">${ctaLabel}</a>
            </td>
          </tr>

          <tr>
            <td style="padding:4px 36px 8px;">
              <a href="${params.postUrl}" style="font-size:12px;font-weight:500;color:#a39bb0;text-decoration:underline;">Read this update on strivo.ai</a>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 36px 28px;border-top:1px solid #f0ecf7;margin-top:16px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#a39bb0;">
                You're getting one of these a day as we catch you up on what's new in Strivo.
                <a href="${params.unsubscribeUrl}" style="color:#a39bb0;text-decoration:underline;">Unsubscribe</a>
                from marketing emails anytime.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderProductUpdateEmailText(params: ProductUpdateEmailParams): string {
  return `Product Update

${params.postTitle}

Hey ${params.firstName} -- ${params.postExcerpt}

${htmlToPlainText(params.postContentHtml)}

${params.ctaLabel}: ${params.ctaUrl}
Read this update on strivo.ai: ${params.postUrl}

---
You're getting one of these a day as we catch you up on what's new in Strivo.
Unsubscribe from marketing emails: ${params.unsubscribeUrl}`;
}
