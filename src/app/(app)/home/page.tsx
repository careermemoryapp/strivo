"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Sparkles, ArrowUp } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { LogoWithWordmark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { HOME_SUBTITLE, QUICK_ACTIONS } from "@/lib/config";
import { timeOfDayGreeting, cn } from "@/lib/utils";
import { ACTION_ICON_DEFS, chatCategoryIcon } from "@/lib/categoryIcons";
import type { Chat } from "@/lib/repo/chats";

type HomeData = {
  user: { id: string; firstName: string; lastName: string; email: string } | null;
  streak: number;
  memoryCount: number;
  recentChats: Chat[];
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

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [heroInput, setHeroInput] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/home");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError("Couldn't load your home screen. Check your connection and try again.");
    }
  }, []);

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

  if (error && !data) {
    return (
      <div className="px-5 pt-10">
        <ErrorBanner message={error} onRetry={load} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const firstName = data.user?.firstName || "there";

  return (
    <div className="relative overflow-hidden">
      {/* Decorative ambient blobs — purely visual, gives the screen an "alive" AI feel */}
      <div
        className="pointer-events-none absolute -top-16 -right-20 h-56 w-56 rounded-full bg-brand-primary/20 blur-3xl animate-float-blob"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-24 -left-24 h-48 w-48 rounded-full bg-brand-secondary/20 blur-3xl animate-float-blob"
        style={{ animationDelay: "-4s" }}
        aria-hidden="true"
      />

      <div className="relative flex items-center justify-between px-5 pt-6">
        <LogoWithWordmark size={36} />
        <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
          <Avatar firstName={data.user?.firstName} lastName={data.user?.lastName} size={36} />
        </button>
      </div>

      <div className="relative px-5 pt-5">
        <h1 className="text-2xl font-bold text-ink">
          {timeOfDayGreeting()}, <span className="text-gradient-brand">{firstName}</span> 👋
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{HOME_SUBTITLE}</p>
      </div>

      {error && (
        <div className="relative px-5 pt-4">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      )}

      {/* Hero "ask anything" bar — the AI-forward entry point into the app */}
      <div className="relative px-5 pt-5">
        <form
          onSubmit={handleHeroSubmit}
          className="relative rounded-card p-[1.5px] bg-gradient-to-r from-brand-secondary via-brand-primary to-brand-secondary animate-shimmer-border shadow-card"
        >
          <div className="flex items-center gap-2 rounded-[calc(var(--radius-card)-1.5px)] bg-surface px-4 py-3.5">
            <Sparkles size={18} className="shrink-0 text-brand-primary" />
            <input
              value={heroInput}
              onChange={(e) => setHeroInput(e.target.value)}
              placeholder="Ask anything — career advice, prep, or just talk…"
              disabled={!!pendingAction}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!heroInput.trim() || !!pendingAction}
              aria-label="Start chat"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-white disabled:opacity-30"
            >
              {pendingAction === "hero" ? <Spinner /> : <ArrowUp size={16} />}
            </button>
          </div>
        </form>
      </div>

      <div className="relative px-5 pt-6">
        <h2 className="mb-3 font-semibold text-ink">What do you want to accomplish today?</h2>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_ACTIONS.map((action, i) => {
            const iconDef = ACTION_ICON_DEFS[action.icon];
            const Icon = iconDef.icon;
            const isOthers = action.id === "others";
            return (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action)}
                disabled={!!pendingAction}
                style={{ animationDelay: `${i * 60}ms` }}
                className={cn(
                  "animate-fade-in-up flex flex-col items-start gap-2.5 rounded-card border p-4 text-left transition-transform active:scale-[0.97] disabled:opacity-50",
                  isOthers ? "col-span-2 flex-row items-center border-dashed border-border bg-surface" : "border-border bg-surface shadow-card"
                )}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconDef.bg} ${iconDef.text}`}>
                  {pendingAction === action.id ? <Spinner /> : <Icon size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{action.title}</p>
                  <p className="text-xs text-ink-soft">{action.description}</p>
                </div>
                {isOthers && <ChevronRight size={17} className="text-ink-faint shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative px-5 pt-4">
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary-soft text-brand-primary">
            <MicIcon />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink">Capture a memory</p>
            <p className="text-xs text-ink-soft">Speak or type to save what matters.</p>
          </div>
          <button
            onClick={() => router.push("/record")}
            className="flex shrink-0 items-center gap-1 rounded-pill bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white"
          >
            Record Memory <ChevronRight size={15} />
          </button>
        </Card>
      </div>

      {data.recentChats.length > 0 && (
        <div className="relative px-5 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink">Continue where you left off</h2>
            <button onClick={() => router.push("/chats")} className="flex items-center text-sm font-medium text-brand-primary">
              View all <ChevronRight size={16} />
            </button>
          </div>
          <div className="space-y-2.5">
            {data.recentChats.map((chat) => {
              const Icon = chatCategoryIcon(chat.category);
              return (
                <button key={chat.id} onClick={() => router.push(`/chats/${chat.id}`)} className="block w-full text-left">
                  <Card className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary-soft text-brand-primary">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink truncate">{chat.title}</p>
                      <p className="text-xs text-ink-soft">
                        Last active {formatDistanceToNowStrict(new Date(chat.updated_at), { addSuffix: true })}
                      </p>
                      {chat.memory_count > 0 && (
                        <span className="mt-1.5 inline-block rounded-pill bg-brand-primary-soft px-2 py-0.5 text-[11px] font-medium text-brand-primary">
                          {chat.memory_count} {chat.memory_count === 1 ? "memory" : "memories"} available
                        </span>
                      )}
                    </div>
                    <ChevronRight size={17} className="text-ink-faint shrink-0" />
                  </Card>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="pb-6" />
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
