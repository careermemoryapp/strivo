import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/emailUnsubscribe";
import { getUserById, setEmailOptOut } from "@/lib/repo/users";

// Deliberately NOT behind requireUserId/isAdminAuthed -- this is the link
// that goes out in every campaign email footer, so it has to work for
// someone who isn't logged in on the device they're reading mail on. The
// signed token (see emailUnsubscribe.ts) is what stands in for auth here:
// only someone holding a genuine, unforged link for that specific user can
// flip their own opt-out flag.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const userId = verifyUnsubscribeToken(token);

  if (!userId) {
    return htmlResponse(
      "Link not valid",
      "This unsubscribe link is invalid or has expired. If you'd like to stop receiving emails from Strivo, please reply to any email and let us know.",
      400
    );
  }

  const user = getUserById(userId);
  if (!user) {
    return htmlResponse("Link not valid", "We couldn't find an account for this link.", 404);
  }

  setEmailOptOut(userId, true);

  return htmlResponse(
    "You're unsubscribed",
    `${user.email} won't receive any more marketing emails from Strivo. You'll still get account-related emails, like password resets.`,
    200
  );
}

function htmlResponse(title: string, message: string, status: number): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Strivo</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #faf9fc; margin: 0; padding: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
  .card { max-width: 420px; margin: 24px; padding: 32px 28px; background: #fff; border-radius: 18px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); text-align: center; }
  h1 { font-size: 20px; color: #1a1523; margin: 0 0 12px; }
  p { font-size: 14px; color: #6b6577; line-height: 1.6; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
