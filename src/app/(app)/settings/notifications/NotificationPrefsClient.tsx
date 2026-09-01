"use client";

import { useState } from "react";
import { DarkHeader } from "@/components/DarkHeader";
import { Toggle } from "@/components/Toggle";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_META, type NotificationType } from "@/lib/notificationTypes";
import type { NotificationPrefs } from "@/lib/repo/notificationPrefs";

export function NotificationPrefsClient({ initialPrefs }: { initialPrefs: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [saving, setSaving] = useState<NotificationType | null>(null);

  // Optimistic, same pattern as NotificationsClient's mark-read -- flips
  // the switch instantly, fires the request in the background, and rolls
  // back only if the request actually fails (rare: this is just a boolean
  // column write).
  async function toggle(type: NotificationType, next: boolean) {
    setPrefs((p) => ({ ...p, [type]: next }));
    setSaving(type);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, enabled: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPrefs((p) => ({ ...p, [type]: !next }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="Notifications" />

      <div className="px-5 pt-5 space-y-6">
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          Choose which of these Strivo sends you. Turning one off stops it completely — no push, and it
          won&apos;t show up in your notification list either.
        </p>

        {NOTIFICATION_CATEGORIES.map((category) => (
          <div key={category.key}>
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[#a8a2bd]">
              {category.label}
            </h3>
            <div className="overflow-hidden rounded-[16px] border border-[#f0ecf7] bg-surface">
              {category.types.map((type, i) => {
                const meta = NOTIFICATION_META[type];
                const Icon = meta.icon;
                return (
                  <div
                    key={type}
                    className={`flex items-center gap-3 px-4 py-3.5 ${
                      i > 0 ? "border-t border-[#f4f1fa]" : ""
                    }`}
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${meta.color}1F`, color: meta.color }}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{meta.label}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{meta.description}</p>
                    </div>
                    <Toggle
                      checked={prefs[type]}
                      onChange={(next) => toggle(type, next)}
                      disabled={saving === type}
                      label={`${meta.label} ${prefs[type] ? "on" : "off"}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
