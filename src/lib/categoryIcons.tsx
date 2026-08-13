import {
  Briefcase, Users, Award, Lightbulb, TrendingUp, GraduationCap, Trophy, Heart, FileText,
  Target, Sparkles, MoreHorizontal,
} from "lucide-react";
import { ComponentType } from "react";

type IconDef = {
  icon: ComponentType<{ size?: number; className?: string }>;
  bg: string;
  text: string;
  // Tailwind gradient "from-*" stop matching `bg`, used for richer hero
  // headers (e.g. memory detail page). Written out explicitly (not derived
  // from `bg` at runtime) so Tailwind's static scanner can see the literal
  // class name and generate the CSS for it.
  from?: string;
};

// Memory categories. Each maps to a distinct icon + soft color pair so the
// Memories list is scannable at a glance, matching the product's visual
// design. Add a new category here (and to CATEGORY_OPTIONS in lib/ai.ts) to
// extend the taxonomy.
export const MEMORY_CATEGORIES: Record<string, IconDef> = {
  Work: { icon: Briefcase, bg: "bg-blue-50", text: "text-blue-500", from: "from-blue-100" },
  Meeting: { icon: Users, bg: "bg-emerald-50", text: "text-emerald-500", from: "from-emerald-100" },
  Career: { icon: Award, bg: "bg-purple-50", text: "text-purple-500", from: "from-purple-100" },
  Idea: { icon: Lightbulb, bg: "bg-amber-50", text: "text-amber-500", from: "from-amber-100" },
  Review: { icon: TrendingUp, bg: "bg-teal-50", text: "text-teal-500", from: "from-teal-100" },
  Learning: { icon: GraduationCap, bg: "bg-violet-50", text: "text-violet-500", from: "from-violet-100" },
  Achievement: { icon: Trophy, bg: "bg-orange-50", text: "text-orange-500", from: "from-orange-100" },
  Personal: { icon: Heart, bg: "bg-pink-50", text: "text-pink-500", from: "from-pink-100" },
  General: { icon: FileText, bg: "bg-slate-100", text: "text-slate-500", from: "from-slate-200" },
};

export function memoryCategoryDef(category?: string | null): IconDef {
  return MEMORY_CATEGORIES[category ?? "General"] ?? MEMORY_CATEGORIES.General;
}

export function memoryCategoryIcon(category?: string | null) {
  return memoryCategoryDef(category).icon;
}

// Chat categories — mirrors the 5 home quick actions (plus "All" as a filter-only value).
export const CHAT_CATEGORIES_DEF: Record<string, IconDef> = {
  Interview: { icon: Target, bg: "bg-indigo-50", text: "text-indigo-500" },
  Resume: { icon: FileText, bg: "bg-blue-50", text: "text-blue-500" },
  Leadership: { icon: Users, bg: "bg-violet-50", text: "text-violet-500" },
  "Performance Review": { icon: Award, bg: "bg-amber-50", text: "text-amber-500" },
  Others: { icon: MoreHorizontal, bg: "bg-slate-100", text: "text-slate-500" },
};

export function chatCategoryDef(category?: string | null): IconDef {
  return CHAT_CATEGORIES_DEF[category ?? "Others"] ?? CHAT_CATEGORIES_DEF.Others;
}

export function chatCategoryIcon(category?: string | null) {
  return chatCategoryDef(category).icon;
}

// Icons for the Home screen "What do you want to accomplish today?" grid.
export const ACTION_ICON_DEFS: Record<string, IconDef> = {
  target: { icon: Target, bg: "bg-indigo-50", text: "text-indigo-500" },
  "file-text": { icon: FileText, bg: "bg-blue-50", text: "text-blue-500" },
  "trending-up": { icon: TrendingUp, bg: "bg-emerald-50", text: "text-emerald-500" },
  users: { icon: Users, bg: "bg-violet-50", text: "text-violet-500" },
  briefcase: { icon: Briefcase, bg: "bg-orange-50", text: "text-orange-500" },
  sparkles: { icon: Sparkles, bg: "bg-teal-50", text: "text-teal-500" },
  award: { icon: Award, bg: "bg-amber-50", text: "text-amber-500" },
  more: { icon: MoreHorizontal, bg: "bg-slate-100", text: "text-slate-500" },
};
