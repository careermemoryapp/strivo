"use client";

import { useState, FormEvent } from "react";
import { X, MessageCircle } from "lucide-react";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Spinner } from "@/components/Spinner";

// Non-blocking Home banner asking for a phone number -- product decision
// 2026-09-19: push notifications are effectively dead as a re-engagement
// channel (every current user has them off), and this is step one of
// moving that to WhatsApp instead. Deliberately NOT a full-screen gate like
// /ai-consent or /plan-nudge (see (app)/layout.tsx's gate sequence) -- it
// shouldn't add friction to a brand-new signup's path to their first
// memory, so it just lives on Home like the other teaser cards there, and
// server-side gating (shouldShowPhoneBanner in repo/users.ts) already only
// renders it for people without a number who aren't in their snooze
// window.
//
// `initiallyVisible` is computed server-side (page.tsx) from that same
// function -- this component then manages its own visibility locally after
// a save or dismiss, rather than requiring a full Home refetch just to hide
// itself.
export function PhoneNumberBanner({ initiallyVisible }: { initiallyVisible: boolean }) {
  const [visible, setVisible] = useState(initiallyVisible);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState<"save" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  async function dismiss() {
    setSubmitting("dismiss");
    // Optimistic: hide immediately, don't make dismissing feel slow. If the
    // request fails, worst case it just shows again next visit (no worse
    // than never having clicked it) rather than blocking the UI on a retry.
    setVisible(false);
    try {
      await fetch("/api/user/phone/dismiss", { method: "POST" });
    } catch {
      // Best-effort -- see comment above.
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed || submitting) return;
    setSubmitting("save");
    setError(null);
    try {
      const res = await fetch("/api/user/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: trimmed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Couldn't save that number. Please try again.");
        setSubmitting(null);
        return;
      }
      setVisible(false);
    } catch {
      setError("Couldn't save that number. Please try again.");
      setSubmitting(null);
    }
  }

  return (
    <div className="px-5 pt-5">
      <div className="relative rounded-[18px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-4">
        <button
          onClick={dismiss}
          disabled={submitting !== null}
          aria-label="Not now"
          className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-[#a8a2bd] transition hover:bg-white/60 disabled:opacity-50"
        >
          <X size={14} />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
          >
            <MessageCircle size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">Never lose a memory</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-soft">
              Add your WhatsApp number and Strivo will remind you about memories you haven&apos;t turned into
              resume lines yet.
            </p>
          </div>
        </div>

        <form onSubmit={save} className="mt-3 flex items-start gap-2">
          <div className="flex-1">
            <TextField
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              disabled={submitting !== null}
              aria-label="WhatsApp number"
              className="py-2.5 text-[13px]"
            />
          </div>
          <Button type="submit" disabled={!phone.trim() || submitting !== null} className="shrink-0 px-4 py-2.5 text-[13px]">
            {submitting === "save" ? <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" /> : "Save"}
          </Button>
        </form>
        {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
        <p className="mt-2.5 text-[10.5px] leading-relaxed text-[#a8a2bd]">
          Include your country code. We&apos;ll only message you about your own Strivo activity.
        </p>
      </div>
    </div>
  );
}
