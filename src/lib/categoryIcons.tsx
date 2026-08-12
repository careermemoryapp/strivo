import {
  Briefcase, Users, Award, Lightbulb, TrendingUp, GraduationCap, Trophy, Heart, FileText,
  Target, Sparkles, MoreHorizontal,
} from "lucide-react";
import { ComponentType } from "react";

type IconDef = {
  icon: ComponentType<{ size?: number; className?: string }>;
  bg: string;
  text: string;
};

// Memory categories. Each maps to a distinct icon + soft color pair so the
// Memories list is scannable at a glance, matching the product's visual
// design. Add a new category here (and to CATEGORY_OPTIONS in lib/ai.ts) to
// extend the taxonomy.
export const MEMORY_CATEGORIES: Record<string, IconDef> = {
  Work: { icon: Briefcase, bg: "bg-blue-50", text: "text-blue-500" },
  Meeting: { icon: Users, bg: "bg-emerald-50", text: "text-emerald-500" },
  Career: { icon: Award, bg: "bg-purple-50", text: "text-purple-500" },
  Idea: { icon: Lightbulb, bg: "bg-amber-50", text: "text-amber-500" },
  Review: { icon: TrendingUp, bg: "bg-teal-50", text: "text-teal-500" },
  Learning: { icon: GraduationCap, bg: "bg-violet-50", text: "text-violet-500" },
  Achievement: { icon: Trophy, bg: "bg-orange-50", text: "text-orange-500" },
  Personal: { icon: Heart, bg: "bg-pink-50", text: "text-pink-500" },
  General: { icon: FileText, bg: "bg-slate-100", text: "text-slate-500" },
};

export function memoryCategoryDef(category?: string | null): IconDef {
  return MEMORY_CATEGORIES[category ?? "General"] ?? MEMORY_CATEGORIES.General;
}

export function memoryCategoryIcon(category?: string | null) {
  return memoryCategoryDef(category).icon;
}

// Chat categories.
export const CHAT_CATEGORIES_DEF: Record<string, IconDef> = {
  "Interview Prep": { icon: Target, bg: "bg-indigo-50", text: "text-indigo-500" },
  "Career Advice": { icon: TrendingUp, bg: "bg-purple-50", text: "text-purple-500" },
  Personal: { icon: Sparkles, bg: "bg-pink-50", text: "text-pink-500" },
  Other: { icon: MoreHorizontal, bg: "bg-slate-100", text: "text-slate-500" },
};

export function chatCategoryDef(category?: string | null): IconDef {
  return CHAT_CATEGORIES_DEF[category ?? "Other"] ?? CHAT_CATEGORIES_DEF.Other;
}

export function chatCategoryIcon(category?: string | null) {
  return chatCategoryDef(category).icon;
}

// Icons for the Home screen "What do you want to accomplish today?" list.
export const ACTION_ICON_DEFS: Record<string, IconDef> = {
  target: { icon: Target, bg: "bg-purple-50", text: "text-purple-500" },
  "file-text": { icon: FileText, bg: "bg-blue-50", text: "text-blue-500" },
  "trending-up": { icon: TrendingUp, bg: "bg-emerald-50", text: "text-emerald-500" },
  users: { icon: Users, bg: "bg-violet-50", text: "text-violet-500" },
  briefcase: { icon: Briefcase, bg: "bg-orange-50", text: "text-orange-500" },
  sparkles: { icon: Sparkles, bg: "bg-teal-50", text: "text-teal-500" },
  award: { icon: Award, bg: "bg-amber-50", text: "text-amber-500" },
};
