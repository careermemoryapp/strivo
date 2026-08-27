"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Sparkles, ArrowUp, Mic } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Avatar } from "@/components/Avatar";
import { LogoMark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { HOME_SUBTITLE, QUICK_ACTIONS } from "@/lib/config";
import { timeOfDayGreeting } from "@/lib/utils";
import { ACTION_ICON_DEFS, chatCategoryIcon } from "@/lib/categoryIcons";
import type { Chat } from "@/lib/repo/chats";

type HomeData = {
  user: { id: string; firstName: string; lastName: string; email: string } | null;
  streak: number;
  memoryCount: number;
  recentChats: Chat[];
  needsPlanChoice: boolean;
};

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

// Home's own palette — deliberately not the shared theme tokens, since only
// Home has this dark-header/soothing-body treatment for now (staged
// rollout; the rest of the app is still the standard light theme). Kept in
// one place so the header, hero, and bottom nav (see BottomNav.tsx) can be
// kept in sync by eye.
const DARK = "#26213c";

export default function HomePage() {
  const router = useRouter();
  // Instant, not fetched: comes from (app)/layout.tsx's context provider,
  // which already has the name by the time Home renders. Used only for the
  // header Avatar, which otherwise flashed "?" on every navigation to Home
  // while waiting on this page's own /api/home fetch (still used below for
  // the greeting text and everything else, since that needs the fuller
  // payload anyway).
  const currentUser = useCurrentUser();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [heroInput, setHeroInput] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/home");
      if (!res.ok) throw new Error();
      const json: HomeData = await res.json();
      // First-run, one-time: send them to pick a plan before they see Home
      // at all, rather than rendering Home and then yanking them away.
      // welcome-trial redirects back here once a choice is recorded, so
      // this never loops.
      if (json.needsPlanChoice) {
        router.replace("/welcome-trial");
        return;
      }
      setData(json);
    } catch {
      setError("Couldn't load your home screen. Check your connection and try again.");
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, [load]);

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
      router.push(`/chats/${json.chat.id}`);
    } catch {
      setPendingAction(null);
      setError("Couldn't start that conversation. Please try again.");
    }
  }

  function handleQuickAction(action: (typeof QUICK_ACTIONS)[number]) {
    startChat({ id: action.id, chatTitle: action.chatTitle, category: action.category, prompt: action.prompt });
  }

  function handleHeroSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = heroInput.trim();
    if (!trimmed || pendingAction) return;
    const title = trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
    setHeroInput("");
    startChat({ id: "hero", chatTitle: title, category: guessCategory(trimmed), prompt: trimmed });
  }

  // The dark header is now a bounded card at the top of the page (not a
  // full-page background), so it renders correctly regardless of how tall
  // the rest of the content is — no more of the earlier full-page
  // background bugs. Shown even during loading/error so the screen doesn't
  // flash unstyled before data arrives.
  const header = (
    // Fully square now — no rounding on any corner. Kept coming back as
    // "still rounded" through a couple of fixes aimed at the soft glow
    // blobs; removing the border-radius entirely settles it either way.
    <div className="relative overflow-hidden px-5 pb-7 pt-6" style={{ background: DARK }}>
      {/* Glow blobs sit well inside the card now, not touching the top edge
          or corners — at the corners they were softening/blurring the top
          edge enough to read as rounded even though the box itself has
          square top corners, which read as unintentional/messy. */}
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
        <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
          <Avatar
            firstName={currentUser?.firstName ?? data?.user?.firstName}
            lastName={currentUser?.lastName ?? data?.user?.lastName}
            size={32}
          />
        </button>
      </div>

      {data && (
        <>
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
        </>
      )}
    </div>
  );

  if (error && !data) {
    return (
      <div className="pb-6">
        {header}
        <div className="px-5 pt-6">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pb-6">
        {header}
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {header}

      {error && (
        <div className="px-5 pt-4">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      )}

      {/* Calm invitation to record — the emotional centerpiece of the light
          body, styled as a gentle prompt rather than a loud banner. */}
      <div className="px-5 pt-5">
        <div className="rounded-[18px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-5 text-center">
          <div
            className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-[#8b5cf6]"
            style={{ boxShadow: "0 6px 16px rgba(139,92,246,0.18)" }}
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
      </div>

      {/* Quick actions — one restrained accent color throughout (not a
          rainbow tint per category) and a plain vertical list rather than a
          crowded grid. */}
      <div className="px-5 pt-6">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
          Or accomplish today
        </p>
        <div>
          {QUICK_ACTIONS.map((action) => {
            const Icon = ACTION_ICON_DEFS[action.icon].icon;
            return (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action)}
                disabled={!!pendingAction}
                className="flex w-full items-center gap-3 border-t border-[#f0ecf7] py-2.5 text-left transition-colors last:border-b active:bg-[#faf8fd] disabled:opacity-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#f2effa] text-[#8b5cf6]">
                  {pendingAction === action.id ? <Spinner /> : <Icon size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{action.title}</p>
                  <p className="text-[11px] text-ink-faint">{action.description}</p>
                </div>
                <ChevronRight size={15} className="shrink-0 text-[#cec7dd]" />
              </button>
            );
          })}
        </div>
      </div>

      {data.recentChats.length > 0 && (
        <div className="px-5 pt-5">
          {/* A colorful accent bar instead of a plain gray line — ties this
              section back to the header/CTA gradient instead of just being
              a generic hairline divider. */}
          <div
            className="mb-4 h-[3px] w-14 rounded-full"
            style={{ background: "linear-gradient(90deg,#a78bfa,#60a5fa)" }}
          />
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
