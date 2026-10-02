// Builds the "here's your Strivo download link" email -- sent the moment a
// desktop (or iOS) visitor on strivo.ai types their email into the QR
// modal's "email me the link instead" option (see PlayStoreLink.tsx).
//
// Added 2026-10-02, direct founder call: GA4's device-category report
// shows the large majority of strivo.ai visits are desktop, and a desktop
// browser can't install an Android app -- clicking "Get Strivo Free" there
// already falls back to a QR code (PlayStoreLink.tsx, 2026-09-29), but
// scanning requires physically picking up the phone and using the camera
// right then. Emailing the link instead lets someone grab it later from
// their phone's own mail app, which is a lower-friction, higher-recall path
// for the same "I'm on my laptop, my phone is right here but not right
// now" moment.
//
// Deliberately its own template, same reasoning as emailWelcome.ts /
// emailGift.ts: transactional, sent once as the direct result of someone
// typing their own email into a form on this exact page, not an
// admin-composed marketing send -- so it skips the unsubscribe footer and
// uses the plainer white header. No account or signup is created by this;
// it's just a courier for a link the person could already see on screen.
//
// Pure functions, no server-only imports -- safe to reuse from an admin
// preview tool later, same as the other email templates.

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

export function renderAppLinkEmailHtml(downloadUrl: string): string {
  const url = escapeHtml(downloadUrl);
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
              <p style="margin:0 0 12px;font-size:17px;font-weight:700;color:#1a1523;">Here's your Strivo download link</p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3a3448;">You asked for this on strivo.ai. Open this email on your phone and tap the button below to install -- Strivo is Android only for now.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 8px;">
              <a href="${url}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px;">Install Strivo</a>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 4px;">
              <p style="margin:0;font-size:12.5px;line-height:1.6;color:#a39bb0;">Button not working? Copy this link into your phone's browser:<br /><span style="color:#6b6577;">${url}</span></p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 28px;border-top:1px solid #f0ecf7;margin-top:16px;">
              <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#a39bb0;">
                You're receiving this because you asked strivo.ai to email you this link. If that wasn't you, you can ignore this -- nothing else happens.
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

export function renderAppLinkEmailText(downloadUrl: string): string {
  return `Here's your Strivo download link

You asked for this on strivo.ai. Open this on your phone and tap the link below to install -- Strivo is Android only for now.

${downloadUrl}

You're receiving this because you asked strivo.ai to email you this link. If that wasn't you, you can ignore this -- nothing else happens.`;
}
