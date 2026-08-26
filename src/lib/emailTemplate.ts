// Turns the plain text an admin types into the campaign composer into both
// an HTML email and a plain-text fallback. There's no rich-text editor
// anywhere in this stack, so rather than bolt one on, the composer accepts
// a small "markdown-lite" syntax (bold, links, paragraphs) that's easy to
// type and easy to explain in one line of helper text under the textarea.

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
          <td style="padding:8px 32px 8px;">
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
</head>
<body style="margin:0;padding:0;background:#faf9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9fc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="height:6px;background-color:${accent};"></td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
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
            <td style="padding:16px 32px 8px;">
              ${params.bodyHtml}
            </td>
          </tr>
          ${button}
          <tr>
            <td style="padding:24px 32px 28px;border-top:1px solid #f0ecf7;margin-top:16px;">
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
