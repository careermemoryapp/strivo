"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Bell, CalendarDays, TrendingUp, Scale, MessageCircleQuestion, Heart, Megaphone,
} from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { EmptyState } from "@/components/EmptyState";

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  body: string;
  route: string | null;
  read: number;
  created_at: string;
};

// Same icon/color pairing as each feature's own Home teaser card (see
// HomeClient.tsx) so a row here is instantly recognizable as "the same kind
// of thing" someone may have already seen there -- underplayed_win and
// nudge are the two exceptions, since neither has a Home teaser today (the
// underplayed-win callout is push/notification-only by design -- see
// generateUnderplayedWinCallout in lib/ai.ts -- and nudges never had an
// in-app surface before this feature existed at all).
const TYPE_STYLES: Record<string, { icon: typeof Bell; bg: string; fg: string }> = {
  weekly_recap: { icon: CalendarDays, bg: "#eef2ff", fg: "#4338ca" },
  growth_narrative: { icon: TrendingUp, bg: "#f5f3fd", fg: "#7c6ff0" },
  quarterly_benchmark: { icon: Scale, bg: "#ecfdf5", fg: "#059669" },
  checkin: { icon: MessageCircleQuestion, bg: "#fff1f2", fg: "#e11d48" },
  underplayed_win: { icon: Heart, bg: "#fdf2f8", fg: "#db2777" },
  nudge: { icon: Megaphone, bg: "#fdf6e8", fg: "#b3811f" },
};
const DEFAULT_STYLE = { icon: Bell, bg: "#f3f0fb", fg: "#7c6ff0" };

export function NotificationsClient({ notifications: initial }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initial);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter((n) => n.read === 0).length;

  async function markAllRead() {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    try {
      await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    } finally {
      setMarkingAll(false);
    }
  }

  // Marks the row read (optimistically, then fire-and-forget to the server
  // -- same "don't block navigation on a write that can't meaningfully
  // fail" pattern used elsewhere in this app) and follows its route, same
  // destination the original push already pointed at.
  function openNotification(n: NotificationRow) {
    if (n.read === 0) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: 1 } : x)));
      fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {});
    }
    if (n.route) router.push(n.route);
  }

  return (
    <div className="pb-10">
      <DarkHeader
        back
        inlineTitle="Notifications"
        right={
          unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="shrink-0 text-[12px] font-semibold text-white/70 active:text-white disabled:opacity-50"
            >
              Mark all read
            </button>
          )
        }
      />

      <div className="px-5 pt-5">
        {notifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={22} />}
            title="Nothing here yet"
            description="This is where everything Strivo says to you unprompted shows up — a weekly recap, a growth narrative, a check-in, or something you didn't realize was a big deal. Nothing to see for now."
          />
        ) : (
          <div className="space-y-2.5">
            {notifications.map((n) => {
              const style = TYPE_STYLES[n.type] ?? DEFAULT_STYLE;
              const Icon = style.icon;
              const unread = n.read === 0;
              return (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  disabled={!n.route}
                  className={`flex w-full items-start gap-3 rounded-[14px] border p-3.5 text-left disabled:cursor-default ${
                    unread ? "border-[#ece5f5] bg-[#faf8ff]" : "border-[#f0ecf7] bg-surface"
                  }`}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: style.bg, color: style.fg }}
                  >
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {n.title && <p className="truncate text-[12.5px] font-semibold text-ink">{n.title}</p>}
                      {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#f43f5e" }} />}
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{n.body}</p>
                    <p className="mt-1 text-[10.5px] text-ink-soft/60">
                      {formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
