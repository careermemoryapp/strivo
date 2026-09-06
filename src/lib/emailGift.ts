// Builds the "you've been gifted Strivo Plus" email, sent the moment an
// admin grants a comped account via the admin panel's Grant Monthly/Grant
// Yearly buttons (see /api/admin/users/[id]/route.ts). Same reasoning as
// emailWelcome.ts for why this is its own template rather than
// wrapBrandedEmail() from emailTemplate.ts: this is transactional (sent
// once, to one person, as a direct result of an admin action), not an
// admin-composed marketing campaign, so it skips the unsubscribe footer and
// uses the plainer white header.
//
// Wording deliberately mirrors the in-app "gifted" messaging on
// settings/subscription/page.tsx ("You've been gifted the X plan" /
// "Granted by the Strivo team — no payment needed.") so the email and the
// in-app screen never contradict each other.
//
// Pure functions, no server-only imports -- safe to reuse from an admin
// preview tool, same as emailWelcome.ts.

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
const APP_URL = "https://strivo.ai/home";

const PERKS = [
  "Unlimited memories, captured by voice or text",
  "AI chat grounded in your real experiences",
  "Upload documents (PDF, Word, PowerPoint, Excel) to build memories",
  "Interview, resume, leadership & performance-review coaching",
];

function perkRow(perk: string): string {
  return `
  <tr>
    <td width="22" valign="top" style="padding:6px 8px 0 0;">
      <div style="width:6px;height:6px;border-radius:50%;background:${ACCENT};margin-top:6px;"></div>
    </td>
    <td valign="top" style="padding:4px 0;">
      <p style="margin:0;font-size:14px;line-height:1.55;color:#3a3448;">${escapeHtml(perk)}</p>
    </td>
  </tr>`;
}

export type GiftPlan = "monthly" | "annual";

function planLabel(plan: GiftPlan): string {
  return plan === "annual" ? "Annual" : "Monthly";
}

// priceLabel should already be the resolved display string (e.g.
// MONTHLY_PRICE_LABEL/ANNUAL_PRICE_LABEL from repo/users.ts) -- kept as a
// param rather than imported here so this file stays a pure/no-server-import
// template, same as emailWelcome.ts.
export function renderGiftEmailHtml(params: { firstName: string; plan: GiftPlan; priceLabel: string }): string {
  const name = escapeHtml(params.firstName);
  const plan = planLabel(params.plan);
  const price = escapeHtml(params.priceLabel);

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
              <p style="margin:0 0 12px;font-size:17px;font-weight:700;color:#1a1523;">You've been gifted Strivo Plus, ${name}</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3a3448;">Granted by the Strivo team — no payment needed.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2effa;border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0;font-size:14px;font-weight:700;color:${ACCENT};">${plan} plan</p>
                    <p style="margin:2px 0 0;font-size:12.5px;color:#6b6577;">${price} value — on us</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 4px;">
              <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#a39bb0;">What's included</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${PERKS.map(perkRow).join("")}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 8px;">
              <a href="${APP_URL}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px;">Open Strivo</a>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 28px;border-top:1px solid #f0ecf7;margin-top:16px;">
              <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#a39bb0;">
                You're receiving this because an admin granted your Strivo account this plan.
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

export function renderGiftEmailText(params: { firstName: string; plan: GiftPlan; priceLabel: string }): string {
  const plan = planLabel(params.plan);
  return `You've been gifted Strivo Plus, ${params.firstName}

Granted by the Strivo team -- no payment needed.

${plan} plan -- ${params.priceLabel} value -- on us

What's included:
${PERKS.map((p) => `- ${p}`).join("\n")}

Open Strivo: ${APP_URL}

You're receiving this because an admin granted your Strivo account this plan.`;
}
