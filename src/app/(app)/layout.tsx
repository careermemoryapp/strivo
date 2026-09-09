import { redirect } from "next/navigation";
import { headers } from "next/headers";
import BottomNav from "@/components/BottomNav";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById, getSubscriptionInfo, maybeSetUserCountry } from "@/lib/repo/users";
import { countMemories } from "@/lib/repo/memories";
import { CurrentUserProvider } from "@/lib/CurrentUserContext";
import { NavTourProvider } from "@/components/NavTour";

// Server-rendered gate, not a client-side check: previously the "pick a
// plan first" redirect only lived inside home/page.tsx's own fetch effect,
// which meant it only actually protected the Home screen. Someone landing
// directly on /record, /chats, /memories, or /settings (deep link, a push
// notification tap -- see the push tap handler in usePushRegistration.ts,
// which routes straight to /record -- or just tapping the bottom nav
// during the brief moment before Home's client-side redirect fired) could
// see and use the whole app without ever choosing a plan. Running this
// check here, in the layout every one of those routes shares, closes all
// of those paths at once: nothing under (app) renders, including
// BottomNav itself, until the redirect below has already happened.
//
// /welcome-trial (the plan-picker screen) lives OUTSIDE the (app) route
// group specifically so it doesn't inherit this layout or BottomNav --
// otherwise someone could just tap a nav icon to skip past it, which was
// the other half of the bug being fixed here.
//
// Same reasoning applies to /plan-nudge: someone who picked "I'll choose
// later" isn't blocked from the app, but once PLAN_NUDGE_AFTER_MS has
// passed since that choice (see needsPlanNudge in repo/users.ts) they're
// routed to a reminder screen -- shown here rather than left null so the
// app doesn't strand people who genuinely can't decide yet without ever
// re-prompting them.
//
// /trial-ended is the hard stop: once getSubscriptionInfo computes
// status === "expired" (trial_ends_at has passed and nobody granted them
// "active"), every route under (app) redirects here instead of rendering.
// This is a deliberate product decision (2026-08-27) to actually enforce
// the trial boundary even though real Google Play Billing isn't wired up
// yet -- see /trial-ended's own comment for what that means in practice.
// Checked before needsPlanNudge: someone whose trial has since ended
// should see the hard stop, not the softer "still deciding" nudge.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId();
  // proxy.ts's middleware already redirects a request with no session
  // cookie at all to /login, but it can't check isTokenRevoked() (see its
  // own comment) since that needs a database read and middleware runs on
  // the Edge runtime. A revoked-but-structurally-valid token (the stale,
  // post-logout cookie this whole mechanism exists to catch -- see
  // logged_out_at's comment on the User type in repo/users.ts) slips past
  // that check and lands here instead, where requireUserId() -- a real
  // Node Server Component, no Edge restriction -- returns null for it via
  // the session callback in lib/auth.ts. Redirecting here closes that gap
  // before any protected content or BottomNav ever renders.
  if (!userId) {
    redirect("/login");
  }
  const user = getUserById(userId);
  if (!user) {
    redirect("/login");
  }

  // Best-effort country capture (see maybeSetUserCountry in repo/users.ts):
  // Cloudflare stamps every request that reaches origin with cf-ipcountry,
  // so this needs no GeoIP API or extra dependency. A real Node Server
  // Component (unlike proxy.ts's Edge middleware) can both read headers()
  // and hit the database, so this is the earliest point in the request
  // lifecycle that can do both -- and since every protected route shares
  // this layout, it naturally backfills existing users on their next
  // visit too, not just brand-new signups. No-ops (see the function) if
  // the header is missing or the user's country is already on file.
  const h = await headers();
  maybeSetUserCountry(userId, h.get("cf-ipcountry"));

  if (user.preferred_plan === null) {
    // Brand-new, hasn't recorded anything yet, and hasn't picked a plan --
    // send them to the "hero action" screen (record one thing, see it
    // turn into a resume line) BEFORE asking about billing, instead of
    // the old order (plan picker first). Gated on memory count rather
    // than a separate "onboarding done" flag: cheap (single indexed
    // COUNT), and correctly skips anyone who already has memories (e.g.
    // an existing tester who somehow still has preferred_plan null) --
    // they've already had the "wow" moment, no need to force it again.
    if (countMemories(userId) === 0) {
      redirect("/first-record");
    }
    redirect("/welcome-trial");
  }
  const info = getSubscriptionInfo(user);
  if (info.status === "expired") {
    redirect("/trial-ended");
  }
  if (info.needsPlanNudge) {
    redirect("/plan-nudge");
  }

  // Same lookup this layout already needs for the gating checks above, so
  // handing it to every page's header avatar via context is free -- see
  // CurrentUserContext.tsx for what this fixes (the "?" flash on tab
  // switches).
  const currentUser = { firstName: user.first_name, lastName: user.last_name, email: user.email };

  return (
    <CurrentUserProvider user={currentUser}>
      {/* Mounted at this level (not inside a single page) so the record ->
          save -> chat tour's progress survives client-side navigation
          between Home/Record/Chats -- see NavTour.tsx. Only a plain number
          crosses the Server -> Client boundary here, so this doesn't run
          into the node:sqlite-row restriction described in CLAUDE.md. */}
      <NavTourProvider initialStep={user.nav_tour_step}>
        <div className="flex min-h-screen flex-col bg-bg">
          <main className="mx-auto w-full max-w-md flex-1 pb-20">{children}</main>
          <BottomNav />
        </div>
      </NavTourProvider>
    </CurrentUserProvider>
  );
}
