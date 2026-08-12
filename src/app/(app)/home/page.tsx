"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Flame, ChevronRight } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { LogoWithWordmark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { HOME_SUBTITLE, QUICK_ACTIONS } from "@/lib/config";
import { timeOfDayGreeting } from "@/lib/utils";
import { ACTION_ICON_DEFS, chatCategoryIcon } from "@/lib/categoryIcons";
import type { Chat } from "@/lib/repo/chats";

type HomeData = {
  user: { id: string; firstName: string; lastName: string; email: string } | null;
  streak: number;
  memoryCount: number;
  recentChats: Chat[];
};

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

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

  async function handleQuickAction(action: (typeof QUICK_ACTIONS)[number]) {
    setPendingAction(action.id);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: action.chatTitle, category: action.category, initialMessage: action.prompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error();
      router.push(`/chats/${json.chat.id}`);
    } catch {
      setPendingAction(null);
      setError("Couldn't start that conversation. Please try again.");
    }
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
    <div>
      <div className="flex items-center justify-between px-5 pt-6">
        <LogoWithWordmark size={24} />
        <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
          <Avatar firstName={data.user?.firstName} lastName={data.user?.lastName} size={36} />
        </button>
      </div>

      <div className="px-5 pt-5">
        <h1 className="text-2xl font-bold text-ink">
          {timeOfDayGreeting()}, <span className="text-gradient-brand">{firstName}</span> 👋
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{HOME_SUBTITLE}</p>
      </div>

      {error && (
        <div className="px-5 pt-4">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      )}

      <div className="px-5 pt-6">
        <Card className="p-0 overflow-hidden">
          <h2 className="px-4 pt-4 pb-2 font-semibold text-ink">What do you want to accomplish today?</h2>
          <div className="divide-y divide-border">
            {QUICK_ACTIONS.map((action) => {
              const iconDef = ACTION_ICON_DEFS[action.icon];
              const Icon = iconDef.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action)}
                  disabled={!!pendingAction}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconDef.bg} ${iconDef.text}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">{action.title}</p>
                    <p className="text-xs text-ink-soft">{action.description}</p>
                  </div>
                  {pendingAction === action.id ? <Spinner /> : <ChevronRight size={17} className="text-ink-faint shrink-0" />}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="px-5 pt-4">
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
        <div className="px-5 pt-4">
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

      <div className="px-5 pt-4 pb-2">
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <Flame size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink">
              {data.streak > 0 ? "You're doing great! 🔥" : "Start your streak"}
            </p>
            <p className="text-xs text-ink-soft">
              {data.streak > 0 ? "Keep capturing, keep growing." : "Capture a memory today to start one."}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold text-emerald-500 leading-none">{data.streak}</p>
            <p className="text-[11px] text-ink-faint">days in a row</p>
          </div>
        </Card>
      </div>
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
