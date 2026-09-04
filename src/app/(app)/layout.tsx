import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById, getSubscriptionInfo } from "@/lib/repo/users";
import { countMemories } from "@/lib/repo/memories";
import { CurrentUserProvider } from "@/lib/CurrentUserContext";

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
  const user = userId ? getUserById(userId) : undefined;
  if (user) {
    if (user.preferred_plan === null) {
      // Brand-new, hasn't recorded anything yet, and hasn't picked a plan --
      // send them to the "hero action" screen (record one thing, see it
      // turn into a resume line) BEFORE asking about billing, instead of
      // the old order (plan picker first). Gated on memory count rather
      // than a separate "onboarding done" flag: cheap (single indexed
      // COUNT), and correctly skips anyone who already has memories (e.g.
      // an existing tester who somehow still has preferred_plan null) --
      // they've already had the "wow" moment, no need to force it again.
      // countMemories(userId) is safe to call even for a userId that
      // doesn't exist yet in edge cases, since it's just a COUNT query.
      if (countMemories(userId!) === 0) {
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
  }

  // Same lookup this layout already needs for the gating checks above, so
  // handing it to every page's header avatar via context is free -- see
  // CurrentUserContext.tsx for what this fixes (the "?" flash on tab
  // switches).
  const currentUser = user
    ? { firstName: user.first_name, lastName: user.last_name, email: user.email }
    : null;

  return (
    <CurrentUserProvider user={currentUser}>
      <div className="flex min-h-screen flex-col bg-bg">
        <main className="mx-auto w-full max-w-md flex-1 pb-20">{children}</main>
        <BottomNav />
      </div>
    </CurrentUserProvider>
  );
}
