// Builds the "you're a Founding Member" email, sent automatically the
// moment a brand-new signup lands inside the first FOUNDING_MEMBER_CAP
// accounts (see the signIn callback in lib/auth.ts, which checks
// dbUser.founding_member_number !== null right after createUser() --
// createUser() itself decides who qualifies, see repo/users.ts -- and
// fires this un-awaited/fire-and-forget alongside the regular welcome
// email so a slow or failed send can never delay or block sign-in).
//
// Same reasoning as emailWelcome.ts/emailGift.ts for why this is its own
// template rather than wrapBrandedEmail() from emailTemplate.ts: this is
// transactional (sent once, to one person, as a direct result of their own
// signup), not an admin-composed marketing campaign, so it skips the
// unsubscribe footer and uses the plainer white header those two also use.
//
// Content deliberately mirrors the admin-composer "Founding Members"
// campaign body (the one an admin can also manually re-send to the whole
// segment, see the admin panel's email composer) -- same card image, same
// three benefit lines, same "Download & Share My Card" CTA -- so whichever
// one a given member happens to see first, the message is consistent.
// Founder's own words on what this needed to do (2026-10-08): "as soon as
// somebody registered within the first 1000, they receive a mail of
// becoming the founding member."
//
// Pure functions, no server-only imports -- safe to reuse from an admin
// preview tool, same as emailWelcome.ts/emailGift.ts.

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
const FOUNDING_MEMBER_PAGE_URL = "https://strivo.ai/founding-member";

type Perk = { title: string; desc: string };

function perkCard(perk: Perk): string {
  return `
  <tr>
    <td style="padding:0 0 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#15121f;border-radius:0 10px 10px 0;">
        <tr>
          <td width="4" style="background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td>
          <td style="padding:16px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td width="26" valign="top" style="padding-top:1px;">
                  <table cellpadding="0" cellspacing="0" width="18" height="18" style="background:${ACCENT};border-radius:50%;">
                    <tr><td align="center" valign="middle" style="color:#ffffff;font-size:11px;font-weight:700;font-family:Arial,sans-serif;line-height:18px;">&#10003;</td></tr>
                  </table>
                </td>
                <td valign="top" style="color:#ffffff;font-size:14px;font-weight:700;line-height:18px;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(perk.title)}</td>
              </tr>
            </table>
            <p style="margin:5px 0 0 26px;font-size:12.5px;line-height:18px;color:#c7c7d1;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(perk.desc)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function perks(memberNumber: number): Perk[] {
  return [
    { title: "Free for 12 months, not 2", desc: "You're on the full Founding Member year — not the standard 2-month trial everyone else starts with." },
    { title: "Shareable on LinkedIn & social", desc: "Download your card and post it — show people you were here before almost anyone else." },
    { title: "Yours forever", desc: `#${memberNumber} never changes and never gets reassigned — even if Strivo reaches a billion users.` },
  ];
}

export function renderFoundingMemberWelcomeEmailHtml(params: {
  firstName: string;
  memberNumber: number;
  cap: number;
  cardUrl: string;
}): string {
  const name = escapeHtml(params.firstName);
  const cap = params.cap.toLocaleString("en-US");

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
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT};">Founding Member &middot; #${params.memberNumber}</p>
              <p style="margin:0 0 14px;font-size:19px;font-weight:700;line-height:1.35;color:#1a1523;">You're officially Strivo's Founding Member #${params.memberNumber}, ${name}.</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a3448;">
                You're one of the first ${cap} people on Strivo, ever — and this is your real card, permanent and numbered, not a mockup. It's the actual card other people will see if you share it.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 20px;" align="center">
              <img src="${params.cardUrl}" alt="Your Founding Member card" width="220" style="display:block;width:220px;max-width:100%;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,0.25);" />
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${perks(params.memberNumber).map(perkCard).join("")}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 32px 8px;">
              <a href="${FOUNDING_MEMBER_PAGE_URL}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px;">Download &amp; Share My Card</a>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 28px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#8a8499;">Only ${cap} people will ever hold a number like yours.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid #f0ecf7;margin-top:16px;">
              <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#a39bb0;">
                You're receiving this because you're one of Strivo's first ${cap} members.
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

export function renderFoundingMemberWelcomeEmailText(params: {
  firstName: string;
  memberNumber: number;
  cap: number;
  cardUrl: string;
}): string {
  const cap = params.cap.toLocaleString("en-US");
  return `You're officially Strivo's Founding Member #${params.memberNumber}, ${params.firstName}.

You're one of the first ${cap} people on Strivo, ever -- and this is your real card, permanent and numbered, not a mockup: ${params.cardUrl}

- Free for 12 months, not 2 -- the full Founding Member year, not the standard 2-month trial everyone else starts with.
- Shareable on LinkedIn & social -- download your card and post it.
- Yours forever -- #${params.memberNumber} never changes and never gets reassigned, even if Strivo reaches a billion users.

Download & share your card: ${FOUNDING_MEMBER_PAGE_URL}

Only ${cap} people will ever hold a number like yours.

You're receiving this because you're one of Strivo's first ${cap} members.`;
}
