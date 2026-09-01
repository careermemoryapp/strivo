"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Bell, CalendarDays, TrendingUp, Scale, MessageCircleQuestion, Heart, Megaphone, Sparkles,
} from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";

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

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

// Same icon/color pairing as each feature's own Home teaser card (see
// HomeClient.tsx) AND the Features page (settings/features/page.tsx) so a
// row here is instantly recognizable as "the same kind of thing" someone
// may have already seen elsewhere -- underplayed_win and nudge are the two
// exceptions, since neither has a Home teaser today (the underplayed-win
// callout is push/notification-only by design -- see
// generateUnderplayedWinCallout in lib/ai.ts -- and nudges never had an
// in-app surface before this feature existed at all).
const TYPE_STYLES: Record<string, { icon: typeof Bell; color: string }> = {
  weekly_recap: { icon: CalendarDays, color: "#6366f1" },
  growth_narrative: { icon: TrendingUp, color: "#7c6ff0" },
  quarterly_benchmark: { icon: Scale, color: "#10b981" },
  checkin: { icon: MessageCircleQuestion, color: "#f43f5e" },
  underplayed_win: { icon: Heart, color: "#db2777" },
  nudge: { icon: Megaphone, color: "#f59e0b" },
};
const DEFAULT_STYLE = { icon: Bell, color: "#7c6ff0" };

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

      <div className="px-5 pt-5 space-y-5">
        {/* Same gradient-hero language as /growth, /benchmark, and the
            Features page -- this is the "human side" of the app, so it
            shouldn't read as a plain settings sub-page even when it's
            empty. */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="relative overflow-hidden rounded-[20px] p-5"
          style={{ background: "linear-gradient(135deg,#2a1550,#1c1435 60%,#150c2e)" }}
        >
          <div
            className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(167,139,250,0.35), transparent 70%)" }}
          />
          <div className="relative flex items-center gap-2">
            <Sparkles size={15} className="text-[#c9bdf0]" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#c9bdf0]">Everything, unprompted</p>
          </div>
          <p className="relative mt-2 text-[16px] font-bold leading-snug text-white">
            {unreadCount > 0
              ? `${unreadCount} new thing${unreadCount === 1 ? "" : "s"} Strivo noticed`
              : "Every recap, callout, and check-in — in one place"}
          </p>
          <p className="relative mt-1.5 text-[12px] leading-relaxed text-white/65">
            Nothing here gets lost, even if you miss the push.
          </p>
        </motion.div>

        {notifications.length === 0 ? (
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="relative overflow-hidden rounded-[18px] border border-[#ece5f5] p-6 text-center"
            style={{ background: "linear-gradient(135deg,#f5f3fd,#faf8ff)" }}
          >
            <div
              className="pointer-events-none absolute -left-8 -bottom-10 h-32 w-32 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(124,111,240,0.18), transparent 70%)" }}
            />
            <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white" style={{ boxShadow: "0 6px 18px rgba(124,111,240,0.25)" }}>
              <Bell size={22} className="text-[#7c6ff0]" />
            </div>
            <p className="relative mt-4 text-[15px] font-bold text-[#3c3650]">Nothing here yet</p>
            <p className="relative mx-auto mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-[#4a4270]/75">
              A weekly recap, a growth narrative, a check-in, or something you undersold without realizing it —
              the moment Strivo has something to say, it&apos;ll show up right here.
            </p>
            <div className="relative mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: i % 2 === 0 ? "#a78bfa" : "#34d399" }}
                  animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-2.5">
            {notifications.map((n) => {
              const style = TYPE_STYLES[n.type] ?? DEFAULT_STYLE;
              const Icon = style.icon;
              const unread = n.read === 0;
              return (
                <motion.button
                  key={n.id}
                  variants={fadeUp}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => openNotification(n)}
                  disabled={!n.route}
                  className={`flex w-full items-start gap-3 rounded-[16px] border p-3.5 text-left disabled:cursor-default ${
                    unread ? "border-[#e6e0f7]" : "border-[#f0ecf7]"
                  }`}
                  style={{
                    background: unread ? "linear-gradient(135deg,#f8f6fd,#fdfcff)" : "var(--color-surface, #fff)",
                    boxShadow: unread ? "0 2px 12px rgba(124,111,240,0.1)" : "0 2px 10px rgba(60,50,90,0.05)",
                  }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${style.color}1F`, color: style.color, boxShadow: `0 4px 12px ${style.color}33` }}
                  >
                    <Icon size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {n.title && <p className="truncate text-[12.5px] font-semibold text-ink">{n.title}</p>}
                      {unread && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#f43f5e", boxShadow: "0 0 5px #f43f5e" }} />
                      )}
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{n.body}</p>
                    <p className="mt-1 text-[10.5px] text-ink-soft/60">
                      {formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
