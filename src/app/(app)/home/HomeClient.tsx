"use client";

import { useState, useCallback, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight, Sparkles, ArrowUp, Mic, Clock, CalendarDays, TrendingUp, Scale, MessageCircleQuestion, MessageSquare,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Avatar } from "@/components/Avatar";
import { LogoMark } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { HOME_SUBTITLE } from "@/lib/config";
import { timeOfDayGreeting } from "@/lib/utils";
import { chatCategoryIcon } from "@/lib/categoryIcons";
import type { Chat } from "@/lib/repo/chats";
import { CareerWrappedHomePreview, type CareerWrappedHomePreviewData } from "@/components/CareerWrappedHomePreview";
import { CareerProfileHomeHero } from "@/components/CareerProfileHomeHero";
import type { CareerProfileProgress } from "@/lib/repo/careerProfile";

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
  // Null when the career_profile feature flag is off (see page.tsx) -- same
  // "hidden, not broken" contract as careerWrapped above.
  careerProfile: CareerProfileProgress | null;
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
};

// Home's own palette — deliberately not the shared theme tokens. Home is
// now a fully dark, free-flowing page matching the marketing site's own
// look (src/components/marketing/MarketingHome.tsx: bg #0a0a0f, hairline
// `border-[#1e1e26]` section dividers instead of boxed white/bordered
// cards, sparse `border-[#2a2a35]` cards where a card is genuinely
// warranted) — product feedback was that a stack of differently-styled
// boxed cards read as disconnected, and that the app and marketing site
// should feel like one product. This is staged to Home only for now (the
// rest of the app — Record, Chats, Memories, Settings — is still the
// standard light theme); expanding further is a separate decision.
const DARK = "#0a0a0f";
const HAIRLINE = "border-[#1e1e26]";
const CARD_BORDER = "border-[#2a2a35]";

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

  async function startChat({ id, chatTitle, category, prompt }: StartChatArgs) {
    setPendingAction(id);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: chatTitle, category, initialMessage: prompt || undefined }),
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
      <p className="relative mt-1 text-[12.5px] text-white/55">{HOME_SUBTITLE}</p>

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
    <div className="pb-6" style={{ background: DARK }}>
      {header}

      {/* "How Strivo.ai works" -- same three steps, same labels and copy as
          the marketing site's own "How it works" section (MarketingHome.tsx)
          so a user never sees two different explanations of the same flow.
          Unlike the marketing version (static phone-mockup screenshots for
          visitors who can't act yet), these are real, functional buttons --
          product feedback was explicit that a logged-in user should be able
          to just tap Record / Create memory / Chat and go, not read a
          description of what those do. */}
      <div className={`border-t ${HAIRLINE} px-5 pt-6`}>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#6d6d7a]">How Strivo.ai works</p>
        <div className={`mt-3 flex items-stretch rounded-2xl border ${CARD_BORDER}`} style={{ background: "rgba(255,255,255,0.02)" }}>
          <FlowButton
            icon={<Mic size={17} />}
            label="1. Record"
            sublabel="Tap the mic, speak freely"
            onClick={() => router.push("/record")}
          />
          <div className="w-px shrink-0 self-stretch" style={{ background: "#2a2a35" }} />
          <FlowButton
            icon={<Sparkles size={17} />}
            label="2. Create memory"
            sublabel="Transcribed & tagged for you"
            onClick={() => router.push("/record?mode=type")}
          />
          <div className="w-px shrink-0 self-stretch" style={{ background: "#2a2a35" }} />
          <FlowButton
            icon={<MessageSquare size={17} />}
            label="3. Chat"
            sublabel="Ask for it back, anytime"
            onClick={() => router.push("/chats")}
          />
        </div>
      </div>

      {/* Career Profile -- the fun, quiz-based "front door" (Home redesign
          spec section 1), placed ahead of even Career Wrapped so a
          brand-new, zero-data user sees something to discover immediately
          rather than an empty evidence-based feature. Deliberately a
          separate system from Career Wrapped below -- see
          lib/careerProfile.ts's file comment. Renders nothing when the
          career_profile feature flag is off. */}
      {data.careerProfile && <CareerProfileHomeHero progress={data.careerProfile} />}

      {/* Career Wrapped -- placed immediately after the header, ahead of
          every other Home surface (trial banner, check-in, recap, growth,
          benchmark) per the spec: this is meant to read as a core part of
          the product, not one more secondary digest teaser. Renders nothing
          at all when the career_wrapped feature flag is off (see page.tsx). */}
      {data.careerWrapped && <CareerWrappedHomePreview data={data.careerWrapped} />}

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

      {/* Calm invitation to record — same brand gradient as the Career
          Profile/Wrapped cards above it, so it reads as a sibling in the
          same dark card family rather than a separate light-theme block. */}
      <div className="px-5 pt-5">
        <div className={`rounded-2xl border ${CARD_BORDER} p-5 text-center`} style={{ background: "linear-gradient(135deg,#1c1533,#221a3d)" }}>
          <div
            className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/8 text-purple-300"
          >
            <Mic size={19} />
          </div>
          <p className="text-sm font-semibold text-white">What&apos;s on your mind today?</p>
          <p className="mt-0.5 text-[11px] text-white/50">A minute of speaking is worth remembering.</p>
          <button
            onClick={() => router.push("/record")}
            className="mt-3.5 rounded-pill px-5 py-2.5 text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
          >
            Start recording
          </button>
        </div>
      </div>

      {data.recentChats.length > 0 && (
        <div className={`border-t ${HAIRLINE} mt-5 px-5 pt-5`}>
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#6d6d7a]">Continue</p>
            <button onClick={() => router.push("/chats")} className="text-[11px] font-semibold text-brand-secondary">
              View all
            </button>
          </div>
          <div className="space-y-3">
            {data.recentChats.map((chat) => {
              const Icon = chatCategoryIcon(chat.category);
              return (
                <button key={chat.id} onClick={() => router.push(`/chats/${chat.id}`)} className="flex w-full items-center gap-3 text-left">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${CARD_BORDER} text-brand-secondary`} style={{ background: "#161620" }}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-white">{chat.title}</p>
                    <p className="text-[11px] text-[#6d6d7a]">
                      Last active {formatDistanceToNowStrict(new Date(chat.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                  <ChevronRight size={15} className="shrink-0 text-[#4a4a55]" />
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
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-2 py-4 text-center transition-transform active:scale-[0.97]"
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2a2a35] text-brand-secondary"
        style={{ background: "#161620" }}
      >
        {icon}
      </div>
      <p className="text-[11px] font-semibold leading-tight text-white">{label}</p>
      <p className="text-[9.5px] leading-tight text-[#6d6d7a]">{sublabel}</p>
    </button>
  );
}

// Accent palette for the teaser cards below -- each feature keeps its own
// established color (see each card's own comment above its usage) but all
// now share the same dark, sparsely-bordered card shape as the marketing
// site's own cards (border-[#2a2a35], no solid pastel fills) instead of
// five different light, solid-fill boxes.
const TEASER_ACCENTS = {
  amber: { icon: "text-amber-400", chip: "bg-amber-400/10" },
  rose: { icon: "text-rose-400", chip: "bg-rose-400/10" },
  indigo: { icon: "text-indigo-400", chip: "bg-indigo-400/10" },
  violet: { icon: "text-violet-400", chip: "bg-violet-400/10" },
  emerald: { icon: "text-emerald-400", chip: "bg-emerald-400/10" },
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
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-2xl border border-[#2a2a35] px-4 py-3.5 text-left"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${chip} ${iconClass}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-white">{title}</p>
          <p className="truncate text-[11px] text-[#8a8a99]">{subtitle}</p>
        </div>
        <ChevronRight size={15} className="shrink-0 text-[#4a4a55]" />
      </button>
    </div>
  );
}
