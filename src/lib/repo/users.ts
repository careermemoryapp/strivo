import { getDb, newId, nowIso } from "@/lib/db";

export type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  profile_image: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  dismissed_nudge_id: string | null;
  app_version: string | null;
  last_active_at: string | null;
  preferred_plan: string | null;
  // Stamped every time setPreferredPlan() runs, including for "later". Powers
  // the plan-choice nudge screen: someone who picked "later" gets reminded
  // again once PLAN_NUDGE_AFTER_MS has passed since THIS timestamp, not since
  // they first signed up. Choosing again (even "later" a second time)
  // re-stamps it and pushes the next nudge out another full interval.
  preferred_plan_chosen_at: string | null;
  // 1 if an admin manually granted this account free access via "Grant
  // Strivo Plus" rather than a real Google Play purchase. Kept as an
  // explicit flag distinct from subscription_status === "active" so that
  // once real Play Billing lands, a genuine paying customer isn't shown a
  // "you were gifted this" message just because they're active.
  plan_granted_by_admin: number;
  email_opt_out: number;
  // Timestamp of the last automated re-engagement push (see
  // lib/engagement.ts, /api/engagement-nudge/run) -- distinct from
  // last_active_at (when the user last opened the app) and from the
  // `nudges` table (admin-composed broadcasts only). Null means never sent.
  last_engagement_nudge_at: string | null;
  // Same idea, for the category-imbalance insight (see
  // lib/categoryInsight.ts, /api/category-insight/run). Null means never
  // sent.
  last_category_insight_at: string | null;
  // Background context, not a Memory -- extracted text from a resume
  // someone uploaded (see /api/profile/resume, settings/resume, and the
  // "Upload Resume" option on /first-record). Threaded into
  // buildSystemPrompt (lib/ai.ts) so chat answers can reference it, but
  // deliberately never surfaced as its own memory card -- a whole resume
  // dumped into the Memories list would sit oddly next to specific,
  // story-style memories. All three resume_* fields are null until someone
  // uploads one, and re-uploading overwrites all three together (see
  // setResume below) -- there's no history of past resumes kept.
  resume_text: string | null;
  resume_filename: string | null;
  resume_uploaded_at: string | null;
  // Last-sent timestamp for the recurring resume-upload nudge -- see its
  // own comment in lib/db.ts's migration and isDueForResumeReminder in
  // lib/resumeReminder.ts. Null means never nudged yet.
  resume_reminder_sent_at: string | null;
  // Stamped every time this user signs out (see events.signOut in
  // lib/auth.ts). Not "are they currently logged out" -- it's just the
  // timestamp of their most recent sign-out, checked against each session
  // token's own token.loginAt in lib/auth.ts's callbacks and proxy.ts's
  // middleware. See the matching comment on this column's migration in
  // lib/db.ts for the Android cookie-flush bug this exists to close.
  logged_out_at: string | null;
  // Progress through the record -> save -> chat first-run tour: 0 = not
  // started, 1 = spotlighted Record already, waiting on their first save,
  // 2 = spotlighted Chats already, 3 = done (completed or skipped). See the
  // matching comment on this column's migration in lib/db.ts and
  // NavTour.tsx for how it's read/advanced. Deliberately separate from
  // preferred_plan/first-record gating in (app)/layout.tsx: this only
  // controls what NavTourProvider renders on top of the app shell, it never
  // blocks or redirects.
  nav_tour_step: number;
  // How many Product Updates drip emails this user has received so far --
  // also doubles as the 0-based index into the ordered (oldest-first)
  // Product Updates post list for "which one is next for them." See the
  // longer comment on this column's migration in lib/db.ts for why there's
  // deliberately no separate "drip started at" column.
  product_update_sent_count: number;
  // Null means never sent one yet. See product_update_sent_count above.
  product_update_last_sent_at: string | null;
  // Best-effort 2-letter country code (e.g. "IN", "US"), captured once from
  // Cloudflare's automatic cf-ipcountry request header on this user's first
  // protected page load after the column shipped (see maybeSetUserCountry
  // below and its call site in (app)/layout.tsx). Null for anyone who
  // signed up before this shipped, or if the header wasn't present (e.g.
  // the request didn't come through Cloudflare). Not re-derived after
  // first capture -- this is "where they most likely signed up from," not
  // a live location tracker.
  country: string | null;
  // Timestamp of the one-time AI-processing consent gate (see /ai-consent
  // and its redirect in (app)/layout.tsx) -- null means they haven't seen
  // it yet, including every account that existed before this shipped
  // (deliberately NOT backfilled/assumed true for old accounts, even
  // though they were already using AI features under the old generic
  // Terms/Privacy link -- the whole point is getting real, explicit
  // permission going forward per Guideline 5.1.2(i), not just recording
  // that time passed). Never cleared once set.
  ai_consent_at: string | null;
  created_at: string;
};

// How long after choosing "I'll decide later" someone should be shown the
// plan-choice nudge screen again (see /plan-nudge + (app)/layout.tsx).
export const PLAN_NUDGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type SubscriptionInfo = {
  status: "trial" | "active" | "expired";
  trialEndsAt: string | null;
  daysLeft: number | null;
  priceLabel: string;
  monthlyPriceLabel: string;
  annualPriceLabel: string;
  annualListPriceLabel: string;
  trialMonths: number;
  // "later" = explicitly chose "I'll decide later" on the first-run trial
  // screen, rather than never having visited it (null). Kept distinct from
  // null so the admin panel and email segmentation can tell "hasn't been
  // asked yet" apart from "was asked, deliberately deferred" -- the two
  // call for different treatment (the former shouldn't get a nudge email,
  // the latter is exactly who that nudge is for).
  preferredPlan: "monthly" | "annual" | "later" | null;
  // True if an admin manually granted this person free access (see
  // plan_granted_by_admin above). Settings/subscription reads this to show a
  // "you've been gifted this plan" message instead of pricing.
  grantedByAdmin: boolean;
  // True once someone who chose "later" is due to see the plan-choice nudge
  // screen again (PLAN_NUDGE_AFTER_MS since preferred_plan_chosen_at, and
  // they still haven't picked a real plan or converted to active).
  needsPlanNudge: boolean;
};

// Single source of truth for pricing. Billed exclusively through Google Play
// Billing (no Stripe/Razorpay) once payments go live, so these labels are
// display-only until the Play Billing integration is wired up.
export const TRIAL_MONTHS = 2;
export const MONTHLY_PRICE_LABEL = "$6.99/month";
export const ANNUAL_PRICE_LABEL = "$41.99/year";
// What 12 months would cost at the monthly rate — shown struck through next
// to the annual price so the "50% off" framing is self-evident.
export const ANNUAL_LIST_PRICE_LABEL = "$83.88/year";

export function getSubscriptionInfo(
  user: Pick<User, "subscription_status" | "trial_ends_at"> &
    Partial<Pick<User, "preferred_plan" | "preferred_plan_chosen_at" | "plan_granted_by_admin">>
): SubscriptionInfo {
  const preferredPlan = (user.preferred_plan === "monthly" || user.preferred_plan === "annual" || user.preferred_plan === "later"
    ? user.preferred_plan
    : null) as "monthly" | "annual" | "later" | null;
  const grantedByAdmin = user.plan_granted_by_admin === 1;
  const chosenAtMs = user.preferred_plan_chosen_at ? new Date(user.preferred_plan_chosen_at).getTime() : null;
  const needsPlanNudge =
    preferredPlan === "later" &&
    user.subscription_status !== "active" &&
    chosenAtMs !== null &&
    Date.now() - chosenAtMs >= PLAN_NUDGE_AFTER_MS;
  const shared = {
    priceLabel: ANNUAL_PRICE_LABEL,
    monthlyPriceLabel: MONTHLY_PRICE_LABEL,
    annualPriceLabel: ANNUAL_PRICE_LABEL,
    annualListPriceLabel: ANNUAL_LIST_PRICE_LABEL,
    trialMonths: TRIAL_MONTHS,
    preferredPlan,
    grantedByAdmin,
    needsPlanNudge,
  };
  if (user.subscription_status === "active") {
    return { status: "active", trialEndsAt: user.trial_ends_at, daysLeft: null, ...shared };
  }
  const endMs = user.trial_ends_at ? new Date(user.trial_ends_at).getTime() : null;
  if (endMs && endMs > Date.now()) {
    const daysLeft = Math.max(0, Math.ceil((endMs - Date.now()) / (24 * 60 * 60 * 1000)));
    return { status: "trial", trialEndsAt: user.trial_ends_at, daysLeft, ...shared };
  }
  return { status: "expired", trialEndsAt: user.trial_ends_at, daysLeft: 0, ...shared };
}

export function createUser(input: {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
}): User {
  const db = getDb();
  const id = newId("user");
  const created_at = nowIso();
  // Every new account starts with a free trial (see TRIAL_MONTHS above).
  const trialEnd = new Date();
  trialEnd.setMonth(trialEnd.getMonth() + TRIAL_MONTHS);
  db.prepare(
    `INSERT INTO users (id, first_name, last_name, email, password_hash, profile_image, subscription_status, trial_ends_at, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'trial', ?, ?)`
  ).run(
    id,
    input.firstName,
    input.lastName,
    input.email.toLowerCase().trim(),
    input.passwordHash,
    trialEnd.toISOString(),
    created_at
  );
  return getUserById(id)!;
}

export function getUserByEmail(email: string): User | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(email.toLowerCase().trim()) as User | undefined;
}

export function getUserById(id: string): User | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as User | undefined;
}

export function updateUserProfile(
  id: string,
  input: Partial<Pick<User, "first_name" | "last_name" | "profile_image">>
): User | undefined {
  const db = getDb();
  const current = getUserById(id);
  if (!current) return undefined;
  const first_name = input.first_name ?? current.first_name;
  const last_name = input.last_name ?? current.last_name;
  const profile_image = input.profile_image ?? current.profile_image;
  db.prepare(
    `UPDATE users SET first_name = ?, last_name = ?, profile_image = ? WHERE id = ?`
  ).run(first_name, last_name, profile_image, id);
  return getUserById(id);
}

export function updateUserPassword(id: string, passwordHash: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, id);
}

export function deleteUser(id: string) {
  const db = getDb();
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

// Records that this user has seen & dismissed the given nudge, so it won't
// show again on Home even after the admin's active nudge changes to
// something newer (a fresh nudge id means it wasn't this one, so it'll
// show again — that's intentional).
export function setDismissedNudge(id: string, nudgeId: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET dismissed_nudge_id = ? WHERE id = ?`).run(nudgeId, id);
}

// Pinged once per native app open/resume (see useAppVersionPing.ts) so the
// admin Users table can show which build every native user is actually
// running, regardless of whether they've granted notification permission.
// Also stamps last_active_at with "now" — this same ping is the best signal
// we have for "when did this person last open the app," which powers the
// nudge audience segments in repo/pushTokens.ts.
export function setUserAppVersion(id: string, version: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET app_version = ?, last_active_at = ? WHERE id = ?`).run(version, nowIso(), id);
}

// Best-effort, write-once capture of a user's country from Cloudflare's
// cf-ipcountry header — called from (app)/layout.tsx on every protected
// page load (the one place shared by every route, web and native) so it
// naturally backfills existing users the next time they visit, not just at
// signup. Only writes when country is still null: deliberately NOT
// re-stamped on every visit, so someone traveling doesn't have their
// on-file country flip around. No-ops if the header wasn't present (e.g.
// a request that didn't come through Cloudflare) or is already set.
export function maybeSetUserCountry(id: string, country: string | null | undefined) {
  if (!country) return;
  const db = getDb();
  db.prepare(`UPDATE users SET country = ? WHERE id = ? AND country IS NULL`).run(country, id);
}

// Records that this user has explicitly acknowledged Strivo's AI
// processing (see /ai-consent and its gate in (app)/layout.tsx). Only
// ever writes once and never clears -- there's no "revoke AI consent and
// keep using Strivo" path since AI processing is core, disclosed product
// functionality, not an optional add-on (see the checklist's reasoning
// against an opt-out toggle). Idempotent WHERE clause matches
// maybeSetUserCountry's pattern above.
export function setAiConsent(id: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET ai_consent_at = ? WHERE id = ? AND ai_consent_at IS NULL`).run(nowIso(), id);
}

// Manual override for the admin panel — lets the founder grant or revoke
// "active" (paid) status by hand until real Google Play Billing is wired
// up (see TRIAL_MONTHS/pricing comments above). Only ever sets 'trial' or
// 'active': "expired" is always computed from trial_ends_at in
// getSubscriptionInfo, never stored, so it's not a settable value here.
// Granting "active" also flips plan_granted_by_admin to 1 (this is, today,
// the ONLY way anyone becomes "active" -- there's no real billing yet) so
// Settings/subscription can show "you've been gifted this plan" instead of
// pricing. Reverting to "trial" clears the flag again.
export function setUserSubscriptionStatus(id: string, status: "trial" | "active") {
  const db = getDb();
  db.prepare(`UPDATE users SET subscription_status = ?, plan_granted_by_admin = ? WHERE id = ?`).run(
    status,
    status === "active" ? 1 : 0,
    id
  );
  return getUserById(id);
}

export function setTrialEndsAt(id: string, iso: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET trial_ends_at = ? WHERE id = ?`).run(iso, id);
}

// Computes the renewal date for an admin-granted plan (see the Grant
// Monthly/Grant Yearly buttons in the admin panel, /api/admin/users/[id]).
// Extends from whichever is LATER: the account's current trial_ends_at (so
// granting mid-trial doesn't cut the remaining free trial short -- they
// keep it AND get the full plan on top) or right now (so granting to an
// already-expired account still gets the full plan duration starting
// today, not a date already in the past). Example: sign up today (trial
// ends in 2 months) + gifted Annual (12 months) = renews 14 months from
// today; + gifted Monthly (1 month) = renews 3 months from today.
export function computeGiftRenewalDate(currentTrialEndsAt: string | null, plan: "monthly" | "annual"): string {
  const now = Date.now();
  const currentMs = currentTrialEndsAt ? new Date(currentTrialEndsAt).getTime() : null;
  const base = new Date(currentMs && currentMs > now ? currentMs : now);
  base.setMonth(base.getMonth() + (plan === "annual" ? 12 : 1));
  return base.toISOString();
}

// Records the plan a user picked on the first-run trial screen (see
// app/welcome-trial). This doesn't charge anything or start a different
// trial -- everyone already gets TRIAL_MONTHS free from createUser() above
// regardless of plan choice. It's purely a stored preference so that once
// Google Play Billing is wired up, we know which plan to pre-select in the
// real purchase flow instead of guessing. "later" is a real, distinct
// choice (see the comment on SubscriptionInfo.preferredPlan) -- someone
// can pick it now and switch to an actual plan afterward from Settings,
// which just calls this same function again with "monthly"/"annual".
export function setPreferredPlan(id: string, plan: "monthly" | "annual" | "later") {
  const db = getDb();
  db.prepare(`UPDATE users SET preferred_plan = ?, preferred_plan_chosen_at = ? WHERE id = ?`).run(
    plan,
    nowIso(),
    id
  );
  return getUserById(id);
}

// Flips the marketing-email opt-out flag. Called only from the public
// unsubscribe link (see /api/email/unsubscribe + emailUnsubscribe.ts) --
// once set, this user is excluded from every future campaign audience at
// the query level (see emailCampaigns.ts's candidateRows). Does not touch
// transactional email eligibility (password reset, support replies), which
// isn't gated by this flag at all.
// Server-side enforcement companion to the (app)/layout.tsx page-level
// redirect: that redirect only fires on a fresh page navigation/server
// render, so a tab that was already open when someone's trial ran out
// could otherwise keep calling content-creating API routes indefinitely
// via client-side fetch without ever hitting the redirect. Routes that
// create new content or spend real OpenAI API cost (new memories, chat
// messages, transcription, file extraction) call this directly so the
// block is real regardless of what the client's already-loaded page state
// looks like.
export function isTrialExpired(userId: string): boolean {
  const user = getUserById(userId);
  if (!user) return false;
  return getSubscriptionInfo(user).status === "expired";
}

export function setEmailOptOut(id: string, optOut: boolean) {
  const db = getDb();
  db.prepare(`UPDATE users SET email_opt_out = ? WHERE id = ?`).run(optOut ? 1 : 0, id);
  return getUserById(id);
}

// Every user id, no filtering -- the candidate pool for the engagement-nudge
// automation (see lib/engagement.ts, /api/engagement-nudge/run), which
// unlike weekly-recap/growth-narrative needs to consider EVERY user
// (including someone with zero memories, to nudge their first one), not
// just users who've already recorded something. Deliberately unbounded, same
// reasoning as listUserIdsWithMemoriesSince in repo/memories.ts -- fine at
// today's scale, and a silent LIMIT here would just as silently stop
// nudging part of the user base.
export function listAllUserIds(): string[] {
  const db = getDb();
  return (db.prepare(`SELECT id FROM users`).all() as { id: string }[]).map((r) => r.id);
}

export function setLastEngagementNudgeAt(id: string, iso: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET last_engagement_nudge_at = ? WHERE id = ?`).run(iso, id);
}

export function setLastCategoryInsightAt(id: string, iso: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET last_category_insight_at = ? WHERE id = ?`).run(iso, id);
}

// Everyone eligible for today's Product Updates drip send -- opted in to
// marketing email, AND due for their next email.
//
// TWO different cutoffs, for two different questions, deliberately NOT the
// same value:
//
// - sentAtCutoffIso ("now minus ~20h", a rolling window) gates repeat
//   sends: someone is due again once their last email was far enough in the
//   past that daily-cron timing drift can't skip a day or double-send them
//   within the same run. A ~24h gap between consecutive daily runs always
//   clears this easily.
//
// - firstSendCutoffIso (midnight IST at the START of today, a calendar-day
//   boundary, computed by the caller) gates a brand-new signup's FIRST
//   email: `created_at < firstSendCutoffIso` means "signed up on some
//   earlier calendar day," not "signed up at least N hours ago." A rolling
//   hours-based buffer here was tried and rejected -- it made the outcome
//   depend on what TIME of day someone signed up (e.g. a 2pm signup could
//   need 2 full days before a ~20h buffer cleared, while a 10am signup only
//   needed one), which isn't what "your day 1 starts the day after you
//   register" means to a person reading it. The calendar-day boundary gives
//   the same answer for anyone who signs up on the 10th, whether that's
//   00:01 or 23:59: their day 1 is the 11th, full stop.
//
// Ordered oldest-account-first purely so a manual re-run/log read is easier
// to eyeball -- send order within a run doesn't otherwise matter since
// every user gets exactly one email.
export function listUsersDueForProductUpdateDrip(sentAtCutoffIso: string, firstSendCutoffIso: string): User[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM users
       WHERE email_opt_out = 0
         AND created_at < ?
         AND (product_update_last_sent_at IS NULL OR product_update_last_sent_at <= ?)
       ORDER BY created_at ASC`
    )
    .all(firstSendCutoffIso, sentAtCutoffIso) as User[];
}

export function markProductUpdateSent(id: string, iso: string) {
  const db = getDb();
  db.prepare(
    `UPDATE users SET product_update_sent_count = product_update_sent_count + 1, product_update_last_sent_at = ? WHERE id = ?`
  ).run(iso, id);
}

// Saves (or overwrites) the resume text extracted from an uploaded PDF --
// see resume_text's own comment on the User type above for why this lives
// on the user row rather than as a Memory. Overwrites all three fields
// together; there's no history of past resumes kept, same as any other
// "current state" profile field.
export function setResume(id: string, text: string, filename: string, uploadedAtIso: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET resume_text = ?, resume_filename = ?, resume_uploaded_at = ? WHERE id = ?`).run(
    text,
    filename,
    uploadedAtIso,
    id
  );
}

export function clearResume(id: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET resume_text = NULL, resume_filename = NULL, resume_uploaded_at = NULL WHERE id = ?`).run(id);
}

export function setResumeReminderSentAt(id: string, iso: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET resume_reminder_sent_at = ? WHERE id = ?`).run(iso, id);
}

// Called from authOptions.events.signOut (lib/auth.ts) every time anyone
// signs out, from any device. See logged_out_at's comment on the User type
// above -- this is the server-side backstop that makes Log Out actually
// stick even if a client (most notably Android's WebView) never manages to
// durably delete its own copy of the session cookie.
export function markLoggedOut(id: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET logged_out_at = ? WHERE id = ?`).run(nowIso(), id);
}

// Advances (or resets, though nothing does that today) the record -> save
// -> chat tour to an arbitrary step -- see the column's own comment on the
// User type above. Deliberately takes the target step rather than just
// incrementing, since NavTour.tsx's Skip path jumps straight to 3 (done)
// from wherever the user currently is, not just +1.
export function setNavTourStep(id: string, step: number) {
  const db = getDb();
  db.prepare(`UPDATE users SET nav_tour_step = ? WHERE id = ?`).run(step, id);
}
