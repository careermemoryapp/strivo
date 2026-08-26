// Builds the automatic "welcome" email sent the moment a brand-new user
// signs up (see the signIn callback in lib/auth.ts). This is deliberately
// a separate template from wrapBrandedEmail() in emailTemplate.ts: that
// shell is built for admin-composed marketing/broadcast campaigns (solid
// accent-color top bar, optional banner/button, required unsubscribe
// footer). This one is transactional — sent once, to one person, as a
// direct result of them creating an account — so it intentionally uses a
// plainer white header (thin accent underline instead of a solid bar) and
// drops the unsubscribe link (there's no ongoing subscription to opt out
// of; it's a single one-time email).
//
// Pure functions, no server-only imports — safe to reuse from an admin
// preview tool later if ever needed, same as emailTemplate.ts.

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ACCENT = "#7c3aed";
const LOGO_URL = "https://strivo.ai/logo-email.png";
const RECORD_URL = "https://strivo.ai/record";

function step(num: number, title: string, desc: string, isFirst: boolean): string {
  return `
  <tr>
    <td width="44" align="center" valign="top" style="padding:${isFirst ? "0" : "14"}px 14px 0 0;">
      <div style="width:32px;height:32px;border-radius:50%;background:#f2effa;color:${ACCENT};font-size:14px;font-weight:700;text-align:center;line-height:32px;">${num}</div>
    </td>
    <td valign="top" style="padding:${isFirst ? "2" : "16"}px 0 0 0;">
      <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:#1a1523;">${escapeHtml(title)}</p>
      <p style="margin:0;font-size:13.5px;line-height:1.55;color:#6b6577;">${escapeHtml(desc)}</p>
    </td>
  </tr>`;
}

// Renders the full welcome email HTML for one recipient. `firstName`
// should already be resolved to a safe display fallback (e.g. "there")
// by the caller if the real first name is empty.
export function renderWelcomeEmailHtml(firstName: string): string {
  const name = escapeHtml(firstName);
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
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #f0ecf7;">

          <tr>
            <td style="padding:26px 32px 16px;border-bottom:2px solid ${ACCENT};">
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
            <td style="padding:26px 32px 6px;">
              <p style="margin:0 0 16px;font-size:17px;font-weight:700;color:#1a1523;">Welcome to Strivo, ${name}</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3a3448;">We're really glad you're here.</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3a3448;">We started Strivo because we kept noticing the same thing: people do meaningful work every day, and then let it slip away. The hard problem you solved, the tough call you made, the moment you were genuinely proud of — it fades, right until the moment you need it most and can't quite find the words.</p>
              <p style="margin:0 0 4px;font-size:15px;line-height:1.65;color:#3a3448;">We built Strivo to hold onto your story as it happens, so months or years from now, you have real material to draw from — not a blank page.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 32px 4px;border-top:1px solid #f0ecf7;">
              <p style="margin:24px 0 16px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#a39bb0;">How it works</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${step(1, "Capture", "Record a memory by voice or text, right when something happens.", true)}
                ${step(2, "Ask", "Chat with an AI that only speaks from your real experience, never invents.", false)}
                ${step(3, "Prepare", "Get interview and review answers grounded in what you actually did.", false)}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 8px;">
              <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#3a3448;">Your story starts with one memory. Let's capture the first one.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 8px;">
              <a href="${RECORD_URL}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px;">Record your first memory</a>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 28px;border-top:1px solid #f0ecf7;margin-top:16px;">
              <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#a39bb0;">
                You're receiving this because you created a Strivo account.
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

// Plain-text fallback for the Text MIME part.
export function renderWelcomeEmailText(firstName: string): string {
  return `Welcome to Strivo, ${firstName}

We're really glad you're here.

We started Strivo because we kept noticing the same thing: people do meaningful work every day, and then let it slip away. The hard problem you solved, the tough call you made, the moment you were genuinely proud of -- it fades, right until the moment you need it most and can't quite find the words.

We built Strivo to hold onto your story as it happens, so months or years from now, you have real material to draw from -- not a blank page.

How it works:
1. Capture -- Record a memory by voice or text, right when something happens.
2. Ask -- Chat with an AI that only speaks from your real experience, never invents.
3. Prepare -- Get interview and review answers grounded in what you actually did.

Your story starts with one memory. Let's capture the first one.
${RECORD_URL}

You're receiving this because you created a Strivo account.`;
}
