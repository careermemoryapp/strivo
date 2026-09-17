"use client";

import { useState, useCallback, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronRight, Sparkles, ArrowUp, Mic, Clock, CalendarDays, TrendingUp, Scale, MessageCircleQuestion, MessageSquare, Flame,
  Target, FileText, Award, Users, MoreHorizontal, Briefcase,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Avatar } from "@/components/Avatar";
import { LogoMark } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { HOME_SUBTITLE, QUICK_ACTIONS } from "@/lib/config";
import { timeOfDayGreeting } from "@/lib/utils";
import { chatCategoryIcon } from "@/lib/categoryIcons";
import type { Chat } from "@/lib/repo/chats";
import { CareerWrappedHomePreview, type CareerWrappedHomePreviewData, type ResumeStatsData } from "@/components/CareerWrappedHomePreview";

type HomeData = {
  user: { id: string; firstName: string; lastName: string; email: string } | null;
  streak: number;
  memoryCount: number;
  recentChats: Chat[];
  // Only present while status === "trial" (see page.tsx) -- null once
  // someone is active/expired, since expired is already hard-blocked by
  // (app)/layout.tsx before Home ever renders, and active has nothing to
  // remind them of.
  trial: { daysLeft: number } | null;
  // Present only when a recent weekly recap exists (see RECAP_VISIBLE_MS in
  // page.tsx) -- a secondary surface for the "Your Week in Stories" feature
  // (see app/(app)/recap), whose primary delivery is a push notification.
  recap: { headline: string } | null;
  // Present only when a recent growth narrative exists (see
  // GROWTH_VISIBLE_MS in page.tsx) -- the "How You've Grown" feature (see
  // app/(app)/growth), whose primary delivery is also a push notification.
  growth: { text: string } | null;
  // Present only when a recent quarterly benchmark exists (see
  // BENCHMARK_VISIBLE_MS in page.tsx) -- the "You vs. You" feature (see
  // app/(app)/benchmark), whose primary delivery is also a push
  // notification.
  benchmark: { text: string; quarterLabel: string } | null;
  // Present whenever the user has an unresolved proactive check-in (see
  // getActiveCheckinForUser in page.tsx) -- unlike recap/growth/benchmark
  // above, this isn't a time-boxed digest with a visibility window; it just
  // stays here until answered or dismissed at /check-in/[id]. Primary
  // delivery is still a push notification (see app/api/checkins/run) -- this
  // is the secondary surface for anyone who opens the app without tapping it.
  checkin: { id: string; question: string } | null;
  // Null when the career_wrapped feature flag is off (see page.tsx) --
  // renders nothing at all in that case, same "hidden, not broken" contract
  // as every other feature-flagged surface in this app.
  careerWrapped: CareerWrappedHomePreviewData | null;
  // Supplementary "also seen in your resume" counts (see
  // analyzeResumeCareerStats in lib/ai.ts) -- shown as one small line under
  // the careerWrapped stats above, never merged into that data. Null when
  // there's no resume on file, analysis hasn't completed, or it found
  // nothing worth surfacing.
  resumeStats: ResumeStatsData | null;
  // "Roles you're ready for" -- up to 5 {title, industry} pairs, industry
  // null when the memories read as industry-agnostic (see
  // getLatestSuggestedRolesForUser in page.tsx). Null here means nothing's
  // been generated for this user yet (new account, not enough history, or
  // due for the monthly automation to catch up) -- rendered as an honest
  // "still taking shape" line rather than an empty list.
  suggestedRoles: { title: string; industry: string | null; reasoning: string | null }[] | null;
};

// How many days out the reminder starts showing -- chosen so it's a real
// heads-up (not a surprise on the last day) but doesn't nag for the whole
// trial. Purely a display threshold; the actual trial-end enforcement lives
// in getSubscriptionInfo() + (app)/layout.tsx, not here.
const TRIAL_REMINDER_THRESHOLD_DAYS = 5;

// Light keyword match so a chat started from the "ask anything" box still
// gets a specific category icon instead of always falling back to "Others" —
// e.g. typing "I have a leadership interview" tags it Leadership, not Others.
function guessCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/\bresume|\bcv\b/.test(lower)) return "Resume";
  if (/\bperformance review|\bperformance\b/.test(lower)) return "Performance Review";
  if (/\bleadership|\bleader\b/.test(lower)) return "Leadership";
  if (/\binterview/.test(lower)) return "Interview";
  return "Others";
}

type StartChatArgs = {
  id: string;
  chatTitle: string;
  category: string;
  prompt: string;
  // "roles_explainer" tells the server to render the opening AI reply
  // deterministically from the already-computed suggested-roles list
  // instead of asking a fresh open-ended question -- see the matching
  // "See why you're a fit" button below and sendRolesExplainerMessage in
  // lib/chatService.ts for why.
  kind?: "roles_explainer";
};

// Home's header tone -- same DARK as DarkHeader.tsx/BottomNav.tsx use
// everywhere else in the app. A prior version of this file pushed Home's
// entire BODY dark too (to match the marketing site's near-black look),
// but that made Home visually inconsistent with the rest of the app (every
// other screen is dark-header-on-light-body), so it's reverted here: only
// the header stays dark, the body below is the app's normal light theme.
// The "free-flowing, no boxy cards" principle from that experiment is kept
// -- sections below are plain rows separated by spacing/hairlines, not
// bordered/backgrounded boxes -- just applied to the light body instead.
const DARK = "#26213c";

// Same purple -> blue gradient used everywhere else an accent color shows
// up on Home now -- CareerWrappedHomePreview and every gradient chip/button
// below (see that file's own comment). One gradient, used consistently,
// instead of the mismatched amber/pink + purple/blue combination product
// feedback called out as making the page feel flat and disconnected.
const BRAND_GRADIENT = "linear-gradient(135deg,#a78bfa,#60a5fa)";

// Light-theme icon treatment for the "chat use cases" grid below, keyed by
// QUICK_ACTIONS' own `icon` string (lib/config.ts) so the two stay in sync
// without a second id map. Not the same as ACTION_ICON_DEFS in
// categoryIcons.tsx -- that map is tuned for the dark-body version of Home
// this file used to be (translucent tints on near-black), and this Home is
// light-bodied now (see the DARK comment above), so these are ordinary
// pale-chip/solid-icon pairs matching Continue's and Tips-for-better-
// memories' own icon chips elsewhere in the app.
const QUICK_ACTION_ICON_STYLE: Record<string, { icon: ReactNode; bg: string; text: string }> = {
  target: { icon: <Target size={16} />, bg: "bg-indigo-50", text: "text-indigo-500" },
  "file-text": { icon: <FileText size={16} />, bg: "bg-blue-50", text: "text-blue-500" },
  award: { icon: <Award size={16} />, bg: "bg-[#f8ecd2]", text: "text-[#b3811f]" },
  users: { icon: <Users size={16} />, bg: "bg-[#f5f3fd]", text: "text-[#7c6ff0]" },
  more: { icon: <MoreHorizontal size={16} />, bg: "bg-[#f2effa]", text: "text-[#8b5cf6]" },
};

// initialData is fetched server-side by page.tsx (a Server Component)
// before anything reaches the browser — see ChatDetailClient.tsx for the
// full reasoning. The old version of this file fetched /api/home itself in
// a useEffect on every mount, which is what was making Home take multiple
// seconds to show anything on every tab switch back to it.
export function HomeClient({ initialData }: { initialData: HomeData }) {
  const router = useRouter();
  // Instant, not fetched: comes from (app)/layout.tsx's context provider,
  // which already has the name by the time Home renders. Used only for the
  // header Avatar so it's never a beat behind initialData on re-renders.
  const currentUser = useCurrentUser();
  const [data, setData] = useState<HomeData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [heroInput, setHeroInput] = useState("");

  // Only used as a manual retry path now (the ErrorBanner's "Retry" button
  // after a failed chat-start, for example) — not fired automatically on
  // mount anymore, since initialData already has everything Home needs.
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/home");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
    } catch {
      setError("Couldn't load your home screen. Check your connection and try again.");
    }
  }, []);

  async function startChat({ id, chatTitle, category, prompt, kind }: StartChatArgs) {
    setPendingAction(id);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: chatTitle, category, initialMessage: prompt || undefined, kind }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error();
      // See the matching comment in ChatsListClient.tsx's startChat -- same
      // fix, same reason: without this, going Back to the Chats list after
      // starting a chat from Home can show a stale cached copy that doesn't
      // include the chat just created.
      router.refresh();
      router.push(`/chats/${json.chat.id}`);
    } catch {
      setPendingAction(null);
      setError("Couldn't start that conversation. Please try again.");
    }
  }

  function handleHeroSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = heroInput.trim();
    if (!trimmed || pendingAction) return;
    const title = trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
    setHeroInput("");
    startChat({ id: "hero", chatTitle: title, category: guessCategory(trimmed), prompt: trimmed });
  }

  const header = (
    <div className="relative overflow-hidden px-5 pb-7 pt-6" style={{ background: DARK }}>
      <div
        className="pointer-events-none absolute right-4 top-16 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-2 top-24 h-28 w-28 rounded-full bg-brand-secondary/15 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="text-[17px] font-bold tracking-tight text-white">Strivo</span>
        </div>
        <div className="flex items-center gap-3.5">
          <NotificationBell />
          <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
            <Avatar
              firstName={currentUser?.firstName ?? data.user?.firstName}
              lastName={currentUser?.lastName ?? data.user?.lastName}
              size={32}
            />
          </button>
        </div>
      </div>

      <h1 className="relative mt-5 text-[23px] font-bold text-white">
        {timeOfDayGreeting()},{" "}
        <span className="bg-gradient-to-r from-purple-300 to-blue-300 bg-clip-text text-transparent">
          {data.user?.firstName || "there"}
        </span>{" "}
        👋
      </h1>
      <div className="relative mt-1 flex items-center gap-2">
        <p className="text-[12.5px] text-white/55">{HOME_SUBTITLE}</p>
        {/* Streak was already computed server-side (page.tsx) but never
            actually shown anywhere on Home -- a real, earned number with
            nothing to do. Its own warm amber "on a streak" color, distinct
            from BRAND_GRADIENT, is deliberate: this is a different kind of
            moment (a personal-best/momentum flex) from the purple/blue
            product actions everywhere else on the page. */}
        {data.streak > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-pill bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
            <Flame size={12} /> {data.streak}
          </span>
        )}
      </div>

      <form
        onSubmit={handleHeroSubmit}
        className="relative mt-4 rounded-[15px] p-[1.5px]"
        style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa,#c084fc)" }}
      >
        <div className="flex items-center gap-2 rounded-[13.5px] bg-[#1c1830] px-3.5 py-3">
          <Sparkles size={16} className="shrink-0 text-purple-200" />
          <input
            value={heroInput}
            onChange={(e) => setHeroInput(e.target.value)}
            placeholder="Ask anything — career advice, prep, or just talk…"
            disabled={!!pendingAction}
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!heroInput.trim() || !!pendingAction}
            aria-label="Start chat"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-30"
            style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
          >
            {pendingAction === "hero" ? <Spinner /> : <ArrowUp size={15} />}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="pb-6">
      {header}

      {/* "How Strivo.ai works" -- same three steps, same labels and copy as
          the marketing site's own "How it works" section (MarketingHome.tsx)
          so a user never sees two different explanations of the same flow.
          Unlike the marketing version (static phone-mockup screenshots for
          visitors who can't act yet), these are real, functional buttons --
          product feedback was explicit that a logged-in user should be able
          to just tap Record / Create memory / Chat and go, not read a
          description of what those do.
          Wrapped in the same soft gradient card (rounded-[18px], lavender
          border, #efeaf9 -> #f5ecec) as the Record screen's own Voice/Type/
          Upload card (see (app)/record/page.tsx) -- founder feedback was
          that they liked that card's look and wanted this section to match
          it, so this deliberately reverses the earlier "free-flowing, no
          boxy cards" direction for this one section. */}
      <div className="px-5 pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">How Strivo.ai works</p>
        <div className="mt-2 rounded-[18px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-5">
          <div className="flex items-stretch">
            <FlowButton
              icon={<Mic size={17} />}
              label="1. Record"
              sublabel="Tap the mic, speak freely"
              onClick={() => router.push("/record")}
            />
            <FlowStepConnector />
            <FlowButton
              icon={<Sparkles size={17} />}
              label="2. Create memory"
              sublabel="Transcribed & tagged for you"
              onClick={() => router.push("/record?mode=type")}
            />
            <FlowStepConnector />
            <FlowButton
              icon={<MessageSquare size={17} />}
              label="3. Chat"
              sublabel="Ask for it back, anytime"
              onClick={() => router.push("/chats")}
            />
          </div>
        </div>
      </div>

      {/* Chat use cases -- the same four QUICK_ACTIONS (lib/config.ts) the
          marketing site's "Use cases" section mirrors, plus "Others", each
          a real tappable card that starts a chat with that action's own
          title/category/opening prompt (same startChat() the hero "Ask
          anything" box already uses). This used to live on Home back when
          Home's whole body was dark (see the DARK comment above and
          ACTION_ICON_DEFS in categoryIcons.tsx, which was that version's
          icon treatment) and was dropped when Home moved to a light body --
          restoring it here, in the light-card treatment, per founder
          feedback that it should come back. "Others" spans both columns
          since it isn't a specific use case like the first four. */}
      <div className="px-5 pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Popular ways to use Strivo.ai</p>
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          {QUICK_ACTIONS.map((action) => {
            const style = QUICK_ACTION_ICON_STYLE[action.icon];
            return (
              <button
                key={action.id}
                onClick={() => startChat(action)}
                disabled={pendingAction !== null}
                className={`flex flex-col items-start gap-2 rounded-[14px] border border-[#ece5f5] bg-surface p-3.5 text-left transition-transform active:scale-[0.97] disabled:opacity-50 ${
                  action.id === "others" ? "col-span-2 flex-row items-center gap-3" : ""
                }`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${style.bg} ${style.text}`}>
                  {pendingAction === action.id ? <Spinner className="h-4 w-4" /> : style.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-ink">{action.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{action.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* "Roles you're ready for" -- the home page reflecting the user's own
          memories back at them with a clear next action, per founder
          feedback. Up to 5 roles, each with the industry it fits best when
          the memories point at one, or "Any industry" when they read as
          industry-agnostic -- never a guessed industry (see
          generateSuggestedRoles in lib/ai.ts, generated by the same monthly
          automation as growth narratives -- app/api/growth-narrative/run).
          data.suggestedRoles is null until that automation has produced a
          real result for this user (new account, not enough history yet,
          or just due to catch up) -- shown as an honest "still taking
          shape" line rather than an empty list or hiding the section
          entirely, so this area of Home never looks broken or missing. */}
      <div className="border-t border-[#ece5f5] mt-5 px-5 pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Roles you&apos;re ready for</p>
        {data.suggestedRoles && data.suggestedRoles.length > 0 ? (
          <>
            <p className="mt-1 text-[11px] text-ink-faint">Based on your memories so far</p>
            <div className="mt-3 space-y-2.5">
              {data.suggestedRoles.map((role) => (
                <div key={role.title} className="flex items-center gap-3 rounded-[14px] border border-[#ece5f5] bg-surface p-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f2effa] text-[#8b5cf6]">
                    <Briefcase size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{role.title}</p>
                    <p className="text-[11px] text-ink-faint">{role.industry ?? "Any industry"}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-center">
              <button
                onClick={() =>
                  startChat({
                    id: "roles",
                    chatTitle: "Roles I'm ready for",
                    category: "Others",
                    prompt: "Based on my memories, what roles am I ready for right now?",
                    kind: "roles_explainer",
                  })
                }
                disabled={pendingAction !== null}
                className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: BRAND_GRADIENT }}
              >
                {pendingAction === "roles" ? <Spinner className="h-3.5 w-3.5" /> : <>See why you&apos;re a fit <ChevronRight size={13} /></>}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-1.5 max-w-[280px] text-[11px] text-ink-faint">
            Keep recording memories and Strivo.ai will start suggesting roles you&apos;re genuinely ready for, based on what you&apos;ve actually done.
          </p>
        )}
      </div>

      {/* Career Wrapped -- placed ahead of the secondary Home surfaces below
          it (trial banner, check-in, recap, growth, benchmark) per the
          spec: this is meant to read as a core part of the product, not
          one more secondary digest teaser. Renders nothing at all when the
          career_wrapped feature flag is off (see page.tsx). */}
      {data.careerWrapped && <CareerWrappedHomePreview data={data.careerWrapped} resumeStats={data.resumeStats} />}

      {error && (
        <div className="px-5 pt-4">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      )}

      {/* Trial-ending reminder -- only shows in the last few days of the
          free trial (see TRIAL_REMINDER_THRESHOLD_DAYS above). Real Google
          Play Billing isn't wired up yet, so this deliberately doesn't
          promise an in-app upgrade flow -- it points to Settings, which
          already has the honest "online payments aren't set up yet"
          messaging (see subscription/page.tsx). This is just the
          heads-up; the actual trial cutoff is enforced separately by
          (app)/layout.tsx once the trial genuinely ends. */}
      {data.trial && data.trial.daysLeft <= TRIAL_REMINDER_THRESHOLD_DAYS && (
        <TeaserCard
          onClick={() => router.push("/settings/subscription")}
          icon={<Clock size={15} />}
          accent="amber"
          title={
            data.trial.daysLeft <= 0
              ? "Your free trial ends today"
              : data.trial.daysLeft === 1
                ? "Your free trial ends tomorrow"
                : `Your free trial ends in ${data.trial.daysLeft} days`
          }
          subtitle="Tap to see your plan"
        />
      )}

      {/* Proactive check-in teaser -- "Strivo remembered." Deliberately
          placed first among the teaser cards (and its own rose accent,
          distinct from every other one below) since this is the one thing
          that reaches OUT unprompted about something real, rather than a
          digest the user comes looking for -- see /check-in/[id] and
          app/api/checkins/run. */}
      {data.checkin && (
        <TeaserCard
          onClick={() => router.push(`/check-in/${data.checkin!.id}`)}
          icon={<MessageCircleQuestion size={15} />}
          accent="rose"
          title="One more thing —"
          subtitle={data.checkin.question}
        />
      )}

      {/* Weekly recap teaser -- secondary surface for anyone who opens the
          app without tapping the push notification (see /recap and
          RECAP_VISIBLE_MS in page.tsx). Indigo rather than the app's usual
          purple/amber so it reads as its own distinct kind of moment,
          matching the milestone-badge color used on the Record success
          popup. */}
      {data.recap && (
        <TeaserCard
          onClick={() => router.push("/recap")}
          icon={<CalendarDays size={15} />}
          accent="indigo"
          title="Your week in stories"
          subtitle={data.recap.headline}
        />
      )}

      {/* Growth narrative teaser -- secondary surface for anyone who opens
          the app without tapping the push notification (see /growth and
          GROWTH_VISIBLE_MS in page.tsx). Violet, matching the /growth
          page's own card, and deliberately distinct from both the amber
          trial banner and the indigo recap card above -- this is meant to
          read as the "biggest" of the three, not just another chip. */}
      {data.growth && (
        <TeaserCard
          onClick={() => router.push("/growth")}
          icon={<TrendingUp size={15} />}
          accent="violet"
          title="How you've grown"
          subtitle={data.growth.text}
        />
      )}

      {/* Quarterly benchmark teaser -- secondary surface for anyone who
          opens the app without tapping the push notification (see
          /benchmark and BENCHMARK_VISIBLE_MS in page.tsx). Teal/emerald,
          matching the /benchmark page's own card, and distinct from the
          recap (indigo) and growth (violet) teasers above since this one
          leads with real numbers rather than pure narrative. */}
      {data.benchmark && (
        <TeaserCard
          onClick={() => router.push("/benchmark")}
          icon={<Scale size={15} />}
          accent="emerald"
          title={`You vs. You — ${data.benchmark.quarterLabel}`}
          subtitle={data.benchmark.text}
        />
      )}

      {/* Calm invitation to record — no card/border either, just a centered
          prompt flowing directly on the light body, set off from the
          teasers above by a plain hairline rather than a boxed container. */}
      <div className="border-t border-[#ece5f5] mt-5 px-5 pt-6 text-center">
        <div
          className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full text-white"
          style={{ background: BRAND_GRADIENT, boxShadow: "0 6px 16px rgba(139,92,246,0.25)" }}
        >
          <Mic size={19} />
        </div>
        <p className="text-sm font-semibold text-[#3c3650]">What&apos;s on your mind today?</p>
        <p className="mt-0.5 text-[11px] text-[#8a82a8]">A minute of speaking is worth remembering.</p>
        <button
          onClick={() => router.push("/record")}
          className="mt-3.5 rounded-pill px-5 py-2.5 text-xs font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
        >
          Start recording
        </button>
      </div>

      {data.recentChats.length > 0 && (
        <div className="border-t border-[#ece5f5] mt-5 px-5 pt-5">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Continue</p>
            <button onClick={() => router.push("/chats")} className="text-[11px] font-semibold text-[#8b5cf6]">
              View all
            </button>
          </div>
          <div className="space-y-3">
            {data.recentChats.map((chat) => {
              const Icon = chatCategoryIcon(chat.category);
              return (
                <button key={chat.id} onClick={() => router.push(`/chats/${chat.id}`)} className="flex w-full items-center gap-3 text-left">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f2effa] text-[#8b5cf6]">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-ink">{chat.title}</p>
                    <p className="text-[11px] text-ink-faint">
                      Last active {formatDistanceToNowStrict(new Date(chat.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                  <ChevronRight size={15} className="shrink-0 text-[#cec7dd]" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// One step in the "how Strivo.ai works" explainer above -- a real, tappable
// button (not just a description) matching the marketing site's own
// "How it works" labels/copy exactly (see MarketingHome.tsx). flex-1/
// min-w-0 so three of these fit one row on a phone-width screen without
// wrapping mid-word; active:scale for a bit of tactile feedback since
// these are now actions, not just illustration.
function FlowButton({ icon, label, sublabel, onClick }: { icon: ReactNode; label: string; sublabel: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-1 py-3 text-center transition-transform active:scale-[0.97]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: BRAND_GRADIENT }}>
        {icon}
      </div>
      {/* whitespace-nowrap + the smaller 10px size (down from 11px) is what
          actually keeps "2. Create memory" -- the longest of the three
          labels -- on one line on real phone widths: it measures fine on a
          414px-wide screen but wraps to two lines anywhere at or below
          ~393px (most Android phones, including the report that caught
          this), because px-2's extra padding plus 11px type didn't leave
          enough column width. Confirmed no-wrap at 360px in preview. */}
      <p className="whitespace-nowrap text-[10px] font-semibold leading-tight text-ink">{label}</p>
      <p className="text-[11px] leading-tight text-ink-faint">{sublabel}</p>
    </button>
  );
}

// The gap between two FlowButtons -- a short animated line with dots
// traveling left-to-right, same idea (and same purple->blue dot colors,
// see BRAND_GRADIENT above) as the marketing site's own FlowConnector
// between its "right when you record" / "builds automatically" cards
// (MarketingHome.tsx), just narrower for this compact three-in-a-row
// layout. Reads as Record -> Create memory -> Chat actually flowing into
// each other rather than three unrelated buttons sitting side by side.
// flex-shrink-0 so it takes a small fixed width and never eats into the
// buttons' own flex-1 space; mt-[30px] lines it up with the icon
// circles' vertical center (py-3 top padding + half the h-9 circle).
//
// Made deliberately bolder than a first pass at this (brighter line,
// bigger glowing dots) -- founder feedback was that the original version
// was too subtle to actually notice at a glance; the whole point is that
// someone sees the connection between the circles immediately, not that
// it's a tasteful detail you find on close inspection.
function FlowStepConnector() {
  const dots = [0, 0.45, 0.9];
  return (
    <div className="mt-[30px] flex w-4 flex-shrink-0 self-start items-center justify-center" aria-hidden="true">
      <div
        className="relative h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: "linear-gradient(90deg, rgba(167,139,250,0.7), rgba(96,165,250,0.7))" }}
      >
        {dots.map((delay, i) => (
          <motion.span
            key={i}
            className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
            style={{
              background: i % 2 === 0 ? "#a78bfa" : "#60a5fa",
              boxShadow: `0 0 6px ${i % 2 === 0 ? "#a78bfa" : "#60a5fa"}`,
            }}
            animate={{ left: ["0%", "100%"] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: "linear", delay }}
          />
        ))}
      </div>
    </div>
  );
}

// Accent palette for the teaser rows below -- each feature keeps its own
// established color (see each row's own comment above its usage). No
// card/border/background box around any of them -- product feedback was
// explicit that Home should be a free-flowing list, not a stack of boxes,
// so these are just a colored icon chip + text, separated from each other
// by spacing alone.
const TEASER_ACCENTS = {
  amber: { icon: "text-[#b3811f]", chip: "bg-[#f8ecd2]" },
  rose: { icon: "text-rose-500", chip: "bg-rose-50" },
  indigo: { icon: "text-indigo-500", chip: "bg-indigo-50" },
  violet: { icon: "text-[#7c6ff0]", chip: "bg-[#f5f3fd]" },
  emerald: { icon: "text-emerald-600", chip: "bg-emerald-50" },
} as const;

function TeaserCard({
  onClick,
  icon,
  accent,
  title,
  subtitle,
}: {
  onClick: () => void;
  icon: ReactNode;
  accent: keyof typeof TEASER_ACCENTS;
  title: string;
  subtitle: string;
}) {
  const { icon: iconClass, chip } = TEASER_ACCENTS[accent];
  return (
    <div className="px-5 pt-4">
      <button onClick={onClick} className="flex w-full items-center gap-3 text-left">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${chip} ${iconClass}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-ink">{title}</p>
          <p className="truncate text-[11px] text-ink-faint">{subtitle}</p>
        </div>
        <ChevronRight size={15} className="shrink-0 text-[#cec7dd]" />
      </button>
    </div>
  );
}
