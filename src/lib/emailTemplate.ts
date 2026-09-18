// Turns what the admin writes in the campaign composer into both an HTML
// email and a plain-text fallback. The composer is now a real rich-text
// editor (see src/components/RichTextEditor.tsx) whose output IS already
// HTML -- renderCampaignBodyHtml/htmlToPlainText below are the current
// pipeline. renderMarkdownLiteToHtml/renderMarkdownLiteToText further down
// are the OLD pipeline, from before the rich-text editor existed, when the
// composer was a plain textarea accepting a small "markdown-lite" syntax
// (**bold**, [text](url)). They're kept only so a template saved back then
// still displays correctly (bold actually bold, links actually links) the
// first time it's loaded into the new editor -- see the "does this already
// look like HTML" check in handleLoadTemplate, admin/page.tsx. New
// templates are saved as real HTML and never touch this old path again.

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Supports: **bold**, [link text](https://...), and paragraphs separated
// by a blank line (single newlines within a paragraph become <br>).
export function renderMarkdownLiteToHtml(source: string): string {
  const paragraphs = source.trim().split(/\n\s*\n/);
  return paragraphs
    .map((para) => {
      let escaped = escapeHtml(para.trim());
      escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      escaped = escaped.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" style="color:#8b5cf6;text-decoration:underline;">$1</a>'
      );
      escaped = escaped.replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a3448;">${escaped}</p>`;
    })
    .join("\n");
}

// Plain-text fallback for the Text MIME part -- strips the markdown-lite
// syntax back down to readable plain text rather than leaving ** and []()
// literally in the fallback that some mail clients show.
export function renderMarkdownLiteToText(source: string): string {
  return source
    .trim()
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");
}

// The rich-text editor's output is admin-authored (not end-user input,
// which is the main thing that would normally demand real HTML
// sanitization) -- but it's still cleaned up before being embedded in an
// email, the same "validate it like untrusted input anyway" posture
// isValidHexColor/isValidHttpsUrl below already take for the other
// campaign-design fields. Regex-based rather than a full HTML parser,
// matching the rest of this file's lightweight style and avoiding a new
// dependency for a single admin screen: strips a small, specific set of
// dangerous tags/attributes rather than attempting to fully parse and
// rebuild the markup.
const DANGEROUS_TAGS = /<\/?(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi;
const EVENT_ATTR = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_ATTR = /(href|src)(\s*=\s*)(["'])\s*javascript:[^"']*\3/gi;

export function sanitizeCampaignHtml(html: string): string {
  return html.replace(DANGEROUS_TAGS, "").replace(EVENT_ATTR, "").replace(JS_URL_ATTR, (_m, attr, eq, quote) => `${attr}${eq}${quote}#${quote}`);
}

// Wraps the sanitized rich-text HTML with the same base body copy styling
// (font size, line height, color) the old per-paragraph markdown-lite
// renderer used to apply to every <p> -- color/font-size are CSS
// properties that inherit, so setting them once on this outer wrapper
// gives unstyled text the same look as before, while anything the admin
// explicitly styled with the toolbar (an inline style on a <span>/<b>)
// still wins, since an element's own inline style always overrides an
// inherited value regardless of where in the tree it sits.
export function renderCampaignBodyHtml(html: string): string {
  return `<div style="font-size:15px;line-height:1.6;color:#3a3448;">${sanitizeCampaignHtml(html)}</div>`;
}

// Plain-text fallback for the Text MIME part -- strips the rich-text HTML
// down to readable plain text rather than leaving raw markup in the
// fallback that some mail clients show. Block-level tags become paragraph
// breaks, <br> becomes a line break, and a link keeps its visible text
// with the URL appended in parentheses (the same convention the old
// markdown-lite fallback used).
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<a\b[^>]*\shref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, url, inner) => {
      const linkText = inner.replace(/<[^>]+>/g, "").trim();
      return url ? `${linkText} (${url})` : linkText;
    })
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
    .replace(/<(p|div|h[1-6]|li)\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Replaces {{firstName}} in a subject or body with the actual recipient's
// name -- the one piece of per-recipient personalization the composer
// supports. Falls back to "there" so "Hi {{firstName}}," never renders
// with a blank if first_name is somehow empty.
export function personalize(template: string, firstName: string): string {
  return template.replace(/\{\{\s*firstName\s*\}\}/g, firstName.trim() || "there");
}

const DEFAULT_ACCENT = "#8b5cf6";

// Everything here is admin-supplied (not end-user input), but it still
// gets interpolated directly into an HTML attribute/style string, so it's
// validated the same way untrusted input would be -- a malformed value
// should fall back to a safe default instead of producing broken markup
// or, worse, an open door for HTML/attribute injection if this ever moves
// behind a less-trusted role than "admin" in the future.
export function isValidHexColor(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export function isValidHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function safeAccentColor(color: string | null | undefined): string {
  return isValidHexColor(color) ? color.trim() : DEFAULT_ACCENT;
}

// Wraps rendered body HTML in Strivo's branded shell: logo header, an
// accent-colored bar, an optional banner image, the message body, an
// optional CTA button, and a footer with the required unsubscribe link.
// Banner/button/color are all optional -- omitting them renders the same
// plain layout every campaign used before this was configurable, so
// existing "Plain update" style sends look identical to before.
export function wrapBrandedEmail(params: {
  bodyHtml: string;
  unsubscribeUrl: string;
  accentColor?: string | null;
  bannerImageUrl?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
}): string {
  const accent = safeAccentColor(params.accentColor);
  const banner = isValidHttpsUrl(params.bannerImageUrl)
    ? `<tr><td style="padding:0;"><img src="${params.bannerImageUrl}" alt="" width="520" style="width:100%;max-width:520px;display:block;border:0;" /></td></tr>`
    : "";
  const button =
    params.buttonText?.trim() && isValidHttpsUrl(params.buttonUrl)
      ? `<tr>
          <td style="padding:8px 32px 8px;" class="email-button-cell">
            <a href="${params.buttonUrl}" style="display:inline-block;background:${accent};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px;">
              ${escapeAttr(params.buttonText.trim())}
            </a>
          </td>
        </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Strivo</title>
<style>
  /* Desktop/base padding is set inline on each cell below (for mail
     clients that strip <style> blocks entirely). This override only
     kicks in on narrow screens, where the fixed 32px side padding was
     eating a big chunk of the available width -- less width per line
     means more line wraps, which is what was making the whole email
     read as much longer on mobile than the same copy looks on desktop.
     !important is required here: it's overriding an inline style, which
     normally wins over a stylesheet. */
  @media only screen and (max-width: 480px) {
    .email-shell { padding: 20px 8px !important; }
    .email-header { padding: 22px 20px 8px !important; }
    .email-body { padding: 12px 20px 8px !important; }
    .email-button-cell { padding: 6px 20px 6px !important; }
    .email-footer { padding: 18px 20px 22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#faf9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9fc;padding:32px 16px;" class="email-shell">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="height:6px;background-color:${accent};"></td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;" class="email-header">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:10px;">
                    <img
                      src="https://strivo.ai/logo-email.png"
                      width="36"
                      height="36"
                      alt="Strivo"
                      style="display:block;width:36px;height:36px;border:0;border-radius:9px;"
                    />
                  </td>
                  <td>
                    <p style="margin:0;font-size:19px;font-weight:700;color:#1a1523;line-height:36px;">Strivo</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${banner}
          <tr>
            <td style="padding:16px 32px 8px;" class="email-body">
              ${params.bodyHtml}
            </td>
          </tr>
          ${button}
          <tr>
            <td style="padding:24px 32px 28px;border-top:1px solid #f0ecf7;margin-top:16px;" class="email-footer">
              <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#a39bb0;">
                You're receiving this because you have a Strivo account.
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

function escapeAttr(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
