"use client";

import { cn } from "@/lib/utils";

// Same on/off switch pattern as the admin panel's feature-flag toggles (see
// FEATURE_FLAGS rendering in app/admin/page.tsx), extracted here so the
// consumer-facing Settings > Notifications screen doesn't hand-roll its own
// copy -- tinted with the app's own violet brand color instead of the
// admin panel's emerald, since this lives in the main app, not admin.
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-pill transition-colors disabled:opacity-60",
        checked ? "bg-[#8b5cf6]" : "bg-[#d8d2e6]"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
