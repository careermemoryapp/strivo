import type { ComponentType } from "react";
import { CalendarDays, TrendingUp, Scale, MessageCircleQuestion, Heart, Megaphone, PieChart } from "lucide-react";

// Single source of truth for the 7 kinds of automatic notification this app
// sends (see lib/notify.ts's notifyUser -- every one of these goes through
// that one function). Used by: the notification history list
// (app/(app)/notifications/NotificationsClient.tsx, for icon/color per
// row), the per-type on/off preferences screen
// (app/(app)/settings/notifications), and the preferences repo/API (for the
// canonical list of valid type keys). Keeping this in one place means the
// history list and the preferences screen can never drift out of sync on
// what a type is called or what it looks like.
export const NOTIFICATION_TYPES = [
  "weekly_recap",
  "growth_narrative",
  "quarterly_benchmark",
  "checkin",
  "underplayed_win",
  "nudge",
  "category_insight",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_META: Record<
  NotificationType,
  { label: string; description: string; icon: ComponentType<{ size?: number }>; color: string }
> = {
  weekly_recap: {
    label: "Your week in stories",
    description: "A short recap of your best 2-3 stories, every Monday.",
    icon: CalendarDays,
    color: "#6366f1",
  },
  growth_narrative: {
    label: "How you've grown",
    description: "A genuine pattern of change reflected back, roughly monthly.",
    icon: TrendingUp,
    color: "#7c6ff0",
  },
  quarterly_benchmark: {
    label: "You vs. you",
    description: "An honest check-in comparing this quarter to the last, four times a year.",
    icon: Scale,
    color: "#10b981",
  },
  checkin: {
    label: "Proactive check-ins",
    description: "Follows up, unprompted, on something you said was coming up.",
    icon: MessageCircleQuestion,
    color: "#f43f5e",
  },
  underplayed_win: {
    label: "Someone noticed",
    description: "Points out a real win you described like it was nothing.",
    icon: Heart,
    color: "#db2777",
  },
  nudge: {
    label: "Messages from Strivo",
    description: "Occasional updates or reminders sent directly by the team.",
    icon: Megaphone,
    color: "#f59e0b",
  },
  category_insight: {
    label: "Patterns in your memories",
    description: "Points out when your memories have leaned heavily one way, in case there's more worth capturing.",
    icon: PieChart,
    color: "#0ea5e9",
  },
};

// Groups the 7 types for display -- same three-way split used when
// explaining these to the founder: rituals that fire on a schedule, things
// that reach out about something specific in your own memories, and
// messages the team sends directly.
export const NOTIFICATION_CATEGORIES: { key: string; label: string; types: NotificationType[] }[] = [
  { key: "rituals", label: "Scheduled rituals", types: ["weekly_recap", "growth_narrative", "quarterly_benchmark"] },
  {
    key: "reaches_out",
    label: "Reaches out about something specific",
    types: ["checkin", "underplayed_win", "category_insight"],
  },
  { key: "from_us", label: "From us directly", types: ["nudge"] },
];
