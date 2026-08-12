"use client";

import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-pill bg-bg border border-border p-1">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={cn(
            "flex-1 rounded-pill py-2 text-sm font-medium transition-colors",
            active === tab ? "bg-surface text-brand-primary shadow-sm" : "text-ink-soft"
          )}
          style={active === tab ? { boxShadow: "var(--shadow-card)" } : undefined}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
