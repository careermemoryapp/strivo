"use client";

import { useState, FormEvent } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { dialCodeForCountry } from "@/lib/dialCodes";

// Simple, recognizable WhatsApp glyph -- same "hand-drawn inline SVG" style
// as GoogleIcon/AppleIcon in (auth)/login/page.tsx. Used instead of a
// generic lucide icon so the ask reads as "connect WhatsApp" at a glance,
// not just "give us your phone number."
function WhatsAppGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="#fff"
        d="M12.01 2C6.48 2 2 6.48 2 12.01c0 1.87.5 3.63 1.44 5.15L2 22l4.97-1.4a9.96 9.96 0 0 0 5.04 1.37h.01c5.52 0 10-4.48 10-10.01C22.02 6.48 17.54 2 12.01 2zm5.84 14.24c-.25.7-1.24 1.28-2.02 1.44-.55.12-1.26.21-3.67-.79-3.08-1.27-5.06-4.4-5.22-4.6-.15-.21-1.25-1.66-1.25-3.17s.78-2.24 1.06-2.55c.27-.3.6-.38.8-.38.2 0 .4 0 .58.01.19.01.44-.07.68.52.25.6.85 2.09.92 2.24.07.15.12.33.02.53-.1.2-.15.33-.3.5-.15.18-.31.4-.44.54-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.36 1.46.3.15.48.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.73.82 2.03.97.3.15.5.22.57.35.08.13.08.73-.17 1.43z"
      />
    </svg>
  );
}

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
//
// `country` is the 2-letter code already captured on this user (see
// maybeSetUserCountry) -- founder feedback on the first version was
// "don't ask for the country code, you already know it," so the input
// starts pre-filled with the right dial code from dialCodes.ts instead of
// making someone look their own up. Falls back to an empty, fully-editable
// field for the (small) slice of users with no country on file yet.
export function PhoneNumberBanner({ initiallyVisible, country }: { initiallyVisible: boolean; country: string | null }) {
  const [visible, setVisible] = useState(initiallyVisible);
  const detected = dialCodeForCountry(country);
  const [phone, setPhone] = useState(detected ? `${detected.dialCode} ` : "");
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
    // Strip everything but digits, then restore a single leading "+" --
    // collapses whatever the pre-filled "+91 " + typed digits looks like
    // (spaces, stray characters) into the plain E.164 shape the API
    // expects, without making the user think about formatting at all.
    const digitsOnly = phone.replace(/[^\d]/g, "");
    if (!digitsOnly || submitting) return;
    const candidate = `+${digitsOnly}`;
    setSubmitting("save");
    setError(null);
    try {
      const res = await fetch("/api/user/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: candidate }),
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="px-5 pt-5"
    >
      <div
        className="relative overflow-hidden rounded-[18px] p-[1.5px]"
        style={{ background: "linear-gradient(135deg,#25D366,#a78bfa,#60a5fa)" }}
      >
        <div className="relative rounded-[16.5px] bg-gradient-to-br from-[#eefcf3] to-[#f5ecfb] p-4">
          <div
            className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-[#25D366]/15 blur-2xl"
            aria-hidden="true"
          />

          <button
            onClick={dismiss}
            disabled={submitting !== null}
            aria-label="Not now"
            className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[#8a8296] transition hover:bg-white/70 disabled:opacity-50"
          >
            <X size={14} />
          </button>

          <div className="relative flex items-start gap-3 pr-6">
            <motion.div
              animate={{ boxShadow: ["0 0 0 0 rgba(37,211,102,0.35)", "0 0 0 7px rgba(37,211,102,0)"] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366]"
            >
              <WhatsAppGlyph />
            </motion.div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-ink">Never lose a memory again ⚡</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-soft">
                Drop your WhatsApp number and Strivo will nudge you before a great memory fades — right in your
                chats.
              </p>
            </div>
          </div>

          <form onSubmit={save} className="relative mt-3 flex items-start gap-2">
            <div className="flex-1">
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                disabled={submitting !== null}
                aria-label="WhatsApp number"
                className="w-full rounded-input border border-[#d7f0e0] bg-white px-3.5 py-2.5 text-[13px] font-medium text-ink outline-none transition focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20"
              />
            </div>
            <button
              type="submit"
              disabled={!phone.replace(/[^\d]/g, "") || submitting !== null}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-input px-4 py-2.5 text-[13px] font-bold text-white transition active:scale-[0.97] disabled:opacity-50"
              style={{ background: "#25D366", boxShadow: "0 4px 14px rgba(37,211,102,0.4)" }}
            >
              {submitting === "save" ? <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" /> : "Save"}
            </button>
          </form>
          {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
          <p className="mt-2.5 text-[10.5px] leading-relaxed text-[#8a8296]">
            By saving, you agree to receive WhatsApp messages about your own Strivo activity. No
            spam, ever — see our{" "}
            <a href="/privacy" target="_blank" className="font-semibold underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </motion.div>
  );
}
