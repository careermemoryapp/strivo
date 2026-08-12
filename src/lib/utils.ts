import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function timeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

// Consecutive-day streak based on distinct memory-creation dates (most
// recent first), counting back from today (or yesterday, so a user who
// captured yesterday but hasn't yet today doesn't lose their streak mid-day).
export function computeStreak(datesDesc: string[]): number {
  if (datesDesc.length === 0) return 0;
  const dateSet = new Set(datesDesc);
  const today = new Date();
  const toKey = (d: Date) => d.toISOString().slice(0, 10);

  const cursor = new Date(today);
  if (!dateSet.has(toKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dateSet.has(toKey(cursor))) return 0;
  }
  let streak = 0;
  while (dateSet.has(toKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function groupMemoriesByTime<T extends { created_at: string }>(items: T[]) {
  const groups: { label: string; items: T[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "This Week", items: [] },
    { label: "Earlier", items: [] },
  ];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  for (const item of items) {
    const created = new Date(item.created_at);
    if (created >= startOfToday) groups[0].items.push(item);
    else if (created >= startOfYesterday) groups[1].items.push(item);
    else if (created >= startOfWeek) groups[2].items.push(item);
    else groups[3].items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

export function initials(firstName?: string | null, lastName?: string | null): string {
  const a = (firstName ?? "").trim().charAt(0);
  const b = (lastName ?? "").trim().charAt(0);
  return (a + b).toUpperCase() || "?";
}
