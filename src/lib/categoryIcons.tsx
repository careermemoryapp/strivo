import {
  Briefcase, Users, Award, Lightbulb, TrendingUp, GraduationCap, Trophy, Heart, FileText,
  Target, Sparkles, MoreHorizontal, MessageCircle,
} from "lucide-react";
import { ComponentType } from "react";

type IconDef = {
  icon: ComponentType<{ size?: number; className?: string }>;
  bg?: string;
  text?: string;
  // Tailwind gradient "from-*" stop matching `bg`, used for richer hero
  // headers (e.g. memory detail page). Written out explicitly (not derived
  // from `bg` at runtime) so Tailwind's static scanner can see the literal
  // class name and generate the CSS for it.
  from?: string;
  // Kept only for ACTION_ICON_DEFS (Home screen grid, below), which still
  // has its own per-action bg/text pair. Memory/chat categories used to
  // carry a per-category gradient/glow/wash here too (a different hue per
  // category -- blue, emerald, amber, teal, indigo, orange, pink...), but
  // that rainbow was the actual source of the "colors don't feel aligned"
  // problem: every screen that lists memories or chats looked like a
  // scrapbook of unrelated accent colors. MemoryCard/ChatCard now render a
  // single brand-primary treatment for every category (see those files) and
  // rely on `icon` alone to keep categories visually distinct -- so this
  // field only needs to exist for the unrelated Home quick-action grid.
  gradient?: [string, string];
  glow?: string;
  wash?: string;
};

// Memory categories. Each maps to a distinct icon so the Memories list is
// scannable at a glance -- all categories share one brand-primary color
// treatment now (rendered in MemoryCard.tsx), not a different hue per
// category. Add a new category here (and to CATEGORY_OPTIONS in lib/ai.ts)
// to extend the taxonomy.
export const MEMORY_CATEGORIES: Record<string, IconDef> = {
  Work: { icon: Briefcase },
  Meeting: { icon: Users },
  Career: { icon: Award },
  Idea: { icon: Lightbulb },
  Review: { icon: TrendingUp },
  Learning: { icon: GraduationCap },
  Achievement: { icon: Trophy },
  Personal: { icon: Heart },
  General: { icon: FileText },
};

export function memoryCategoryDef(category?: string | null): IconDef {
  return MEMORY_CATEGORIES[category ?? "General"] ?? MEMORY_CATEGORIES.General;
}

export function memoryCategoryIcon(category?: string | null) {
  return memoryCategoryDef(category).icon;
}

// Chat categories — mirrors the 5 home quick actions (plus "All" as a filter-only value).
// Others uses MessageCircle rather than MoreHorizontal (three dots) — the
// dots read as an empty/placeholder icon at the size the Chats list renders
// it, not as a meaningful "general conversation" symbol.
export const CHAT_CATEGORIES_DEF: Record<string, IconDef> = {
  Interview: { icon: Target },
  Resume: { icon: FileText },
  Leadership: { icon: Users },
  "Performance Review": { icon: Award },
  Others: { icon: MessageCircle },
};

export function chatCategoryDef(category?: string | null): IconDef {
  return CHAT_CATEGORIES_DEF[category ?? "Others"] ?? CHAT_CATEGORIES_DEF.Others;
}

export function chatCategoryIcon(category?: string | null) {
  return chatCategoryDef(category).icon;
}

// Icons for the Home screen "What do you want to accomplish today?" grid.
// Home is the only consumer of this map (see grep before changing it), and
// Home now renders on a dark gradient background — so these are translucent
// tints tuned for a dark card rather than the pale bg-*-50 swatches used
// everywhere else in the (still light-themed) app.
export const ACTION_ICON_DEFS: Record<string, IconDef> = {
  target: { icon: Target, bg: "bg-indigo-400/20", text: "text-indigo-300" },
  "file-text": { icon: FileText, bg: "bg-blue-400/20", text: "text-blue-300" },
  "trending-up": { icon: TrendingUp, bg: "bg-emerald-400/20", text: "text-emerald-300" },
  users: { icon: Users, bg: "bg-violet-400/20", text: "text-violet-300" },
  briefcase: { icon: Briefcase, bg: "bg-orange-400/20", text: "text-orange-300" },
  sparkles: { icon: Sparkles, bg: "bg-teal-400/20", text: "text-teal-300" },
  award: { icon: Award, bg: "bg-amber-400/20", text: "text-amber-300" },
  more: { icon: MoreHorizontal, bg: "bg-white/10", text: "text-white/60" },
};
