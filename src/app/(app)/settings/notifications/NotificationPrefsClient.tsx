"use client";

import { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Sparkles } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Toggle } from "@/components/Toggle";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_META, NOTIFICATION_TYPES, type NotificationType } from "@/lib/notificationTypes";
import type { NotificationPrefs } from "@/lib/repo/notificationPrefs";

// Same entrance/hero language as app/(app)/notifications/NotificationsClient.tsx
// -- this screen is the control panel for that one, so it should read as
// the same place, not a plain settings sub-page bolted on next to it.
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

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

  const onCount = Object.values(prefs).filter(Boolean).length;

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="Notifications" />

      <div className="px-5 pt-5 space-y-6">
        {/* Same gradient-hero card as /notifications -- purple glow blob,
            uppercase eyebrow, bold headline -- so tapping through from the
            bell's list into its own settings still feels like the same
            place. */}
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
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#c9bdf0]">Your call</p>
          </div>
          <p className="relative mt-2 text-[16px] font-bold leading-snug text-white">
            {onCount} of {NOTIFICATION_TYPES.length} turned on
          </p>
          <p className="relative mt-1.5 text-[12px] leading-relaxed text-white/65">
            Turn any of these off and it stops completely — no push, and it won&apos;t show up in your
            notification list either.
          </p>
        </motion.div>

        {NOTIFICATION_CATEGORIES.map((category, groupIndex) => (
          <motion.div
            key={category.key}
            initial="hidden"
            animate="show"
            variants={stagger}
            transition={{ delayChildren: 0.1 + groupIndex * 0.05 }}
          >
            <div className="mb-2.5 flex items-center gap-2 px-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: NOTIFICATION_META[category.types[0]].color,
                  boxShadow: `0 0 6px ${NOTIFICATION_META[category.types[0]].color}`,
                }}
              />
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#8a82a8]">{category.label}</h3>
            </div>
            <div className="space-y-2.5">
              {category.types.map((type) => {
                const meta = NOTIFICATION_META[type];
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={type}
                    variants={fadeUp}
                    className="flex items-center gap-3 rounded-[16px] border border-[#f0ecf7] bg-surface p-4"
                    style={{ boxShadow: "0 2px 10px rgba(60,50,90,0.05)" }}
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${meta.color}1F`, color: meta.color, boxShadow: `0 4px 12px ${meta.color}33` }}
                    >
                      <Icon size={17} />
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
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
