import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/adminAuth";
import {
  setUserSubscriptionStatus,
  setPreferredPlan,
  setTrialEndsAt,
  computeGiftRenewalDate,
  MONTHLY_PRICE_LABEL,
  ANNUAL_LIST_PRICE_LABEL,
  TRIAL_MONTHS,
} from "@/lib/repo/users";
import { sendGiftEmail } from "@/lib/email";

// `plan` is optional and only meaningful alongside status "active" -- it's
// how the admin records which plan a manually-granted (comped) Strivo Plus
// account is "on" for their own bookkeeping (friends/relatives granted free
// access, see setPreferredPlan in lib/repo/users.ts). It doesn't affect
// access itself: "active" already means unlimited, ungated access
// regardless of plan.
const schema = z.object({ status: z.enum(["trial", "active"]), plan: z.enum(["monthly", "annual"]).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const user = setUserSubscriptionStatus(id, parsed.data.status);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.plan) {
    setPreferredPlan(id, parsed.data.plan);
  }
  // Fires on every Grant Monthly/Grant Yearly click -- deliberately not
  // gated on "was this a genuinely new grant" (e.g. re-clicking Grant on an
  // already-active same-plan account still re-sends). This action is a
  // deliberate, infrequent admin click, not something that fires from user
  // behavior, so a duplicate send in the rare re-click case is harmless --
  // simpler than tracking prior state just to suppress it. Awaited (not
  // fire-and-forget) since this IS the whole point of the request, unlike
  // sendWelcomeEmail firing alongside signup; never throws, so a failed
  // send can't block the grant itself from taking effect.
  if (parsed.data.status === "active" && parsed.data.plan) {
    // Extends from the account's PRE-grant trial_ends_at (user.trial_ends_at
    // here is still the original value -- setUserSubscriptionStatus never
    // touches this column) so a mid-trial grant keeps the remaining trial
    // AND adds the full plan on top -- see computeGiftRenewalDate's own
    // comment in repo/users.ts for the exact math this reproduces.
    const renewalIso = computeGiftRenewalDate(user.trial_ends_at, parsed.data.plan);
    setTrialEndsAt(id, renewalIso);

    // Annual uses the LIST price (ANNUAL_LIST_PRICE_LABEL, "$83.88/year"),
    // not the already-discounted ANNUAL_PRICE_LABEL ("$41.99/year") --
    // the whole point of a gifted plan is showing what it's actually worth
    // before the 50%-off annual discount, not the discounted price someone
    // would've paid anyway. Monthly has no separate list/discounted
    // distinction, so it keeps using MONTHLY_PRICE_LABEL as-is.
    const priceLabel = parsed.data.plan === "annual" ? ANNUAL_LIST_PRICE_LABEL : MONTHLY_PRICE_LABEL;
    await sendGiftEmail({
      toEmail: user.email,
      firstName: user.first_name,
      plan: parsed.data.plan,
      priceLabel,
      renewalDateIso: renewalIso,
    });
  } else if (parsed.data.status === "trial") {
    // Revoking a (possibly previously-gifted) account back to plain trial.
    // Without this, trial_ends_at would still hold whatever far-future
    // renewal date a PRIOR grant computed above, which getSubscriptionInfo
    // would then misread as "your trial ends in 14 months" -- reset it back
    // to the standard TRIAL_MONTHS window from account creation, the same
    // value createUser() would have set if they'd never been granted
    // anything.
    const resetDate = new Date(user.created_at);
    resetDate.setMonth(resetDate.getMonth() + TRIAL_MONTHS);
    setTrialEndsAt(id, resetDate.toISOString());
  }
  return NextResponse.json({ ok: true });
}
