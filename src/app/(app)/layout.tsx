import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import { requireUserId } from "@/lib/serverAuth";
import { getUserById, getSubscriptionInfo } from "@/lib/repo/users";

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
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId();
  if (userId) {
    const user = getUserById(userId);
    if (user && user.preferred_plan === null) {
      redirect("/welcome-trial");
    }
    if (user) {
      const info = getSubscriptionInfo(user);
      if (info.needsPlanNudge) {
        redirect("/plan-nudge");
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <main className="mx-auto w-full max-w-md flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
