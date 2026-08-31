"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircleQuestion, CheckCircle2, ArrowRight } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Spinner } from "@/components/Spinner";

type Checkin = {
  id: string;
  question: string;
  status: "pending" | "active" | "answered" | "dismissed" | "expired";
  sourceMemoryTitle: string | null;
  sourceMemoryId: string | null;
};

// The page a proactive check-in's push notification deep-links to (see
// route: `/check-in/${id}` in app/api/checkins/run) -- also reachable from
// the Home teaser (see HomeClient.tsx) for anyone who opens the app on
// their own instead of tapping the push. Rose/pink rather than any of the
// existing feature accent colors (indigo recap, violet growth, emerald
// benchmark) -- this one is the odd one out on purpose: it's the only
// feature that reaches OUT to the user about something real-life-shaped,
// rather than a digest the user comes looking for.
export function CheckinClient({ checkin }: { checkin: Checkin }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"answered" | "dismissed" | null>(null);
  const [newMemoryId, setNewMemoryId] = useState<string | null>(null);

  const alreadyResolved = checkin.status === "answered" || checkin.status === "dismissed" || checkin.status === "expired";

  async function submitAnswer() {
    if (!answer.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/checkins/${checkin.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answer.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save your answer.");
      setNewMemoryId(json.memory?.id ?? null);
      setOutcome("answered");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your answer. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function dismiss() {
    if (dismissing) return;
    setDismissing(true);
    setError(null);
    try {
      const res = await fetch(`/api/checkins/${checkin.id}/dismiss`, { method: "POST" });
      if (!res.ok) throw new Error();
      setOutcome("dismissed");
    } catch {
      setError("Couldn't dismiss this. Please try again.");
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="Checking in" />

      <div className="px-5 pt-5">
        {alreadyResolved || outcome ? (
          <div className="rounded-[18px] border border-rose-100 bg-rose-50 p-6 text-center">
            <div
              className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-rose-500"
              style={{ boxShadow: "0 6px 16px rgba(244,63,94,0.15)" }}
            >
              <CheckCircle2 size={19} />
            </div>
            <p className="text-sm font-semibold text-rose-800">
              {outcome === "answered" || checkin.status === "answered"
                ? "Added to your memories — thanks for the update."
                : outcome === "dismissed" || checkin.status === "dismissed"
                  ? "No problem, dismissed."
                  : "This one's already passed."}
            </p>
            {outcome === "answered" && newMemoryId && (
              <button
                onClick={() => router.push(`/memories/${newMemoryId}`)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-pill px-5 py-2.5 text-xs font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
              >
                View memory <ArrowRight size={13} />
              </button>
            )}
            {outcome !== "answered" && checkin.status !== "answered" && (
              <button onClick={() => router.push("/home")} className="mt-4 text-xs font-semibold text-rose-700">
                Back to Home
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="rounded-[18px] border border-rose-100 bg-gradient-to-br from-rose-50 to-[#fdf1f3] p-5">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-rose-500">
                  <MessageCircleQuestion size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">
                    Strivo remembered
                  </p>
                  {checkin.sourceMemoryTitle && (
                    <p className="truncate text-[11px] text-rose-700/70">
                      From: {checkin.sourceMemoryTitle}
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-3 text-[15px] font-semibold leading-snug text-rose-900">{checkin.question}</p>

              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={4}
                autoFocus
                placeholder="Tell me how it went…"
                className="mt-4 w-full rounded-[12px] border border-rose-200 bg-white p-3 text-sm text-ink outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200 resize-none"
              />

              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={dismiss}
                  disabled={saving || dismissing}
                  className="flex-1 rounded-pill border border-rose-200 py-2.5 text-xs font-semibold text-rose-700 disabled:opacity-50"
                >
                  {dismissing ? <Spinner className="mx-auto h-3.5 w-3.5 border-rose-300 border-t-rose-600" /> : "Not now"}
                </button>
                <button
                  onClick={submitAnswer}
                  disabled={!answer.trim() || saving || dismissing}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#fb7185,#f43f5e)" }}
                >
                  {saving && <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" />}
                  Save this
                </button>
              </div>
            </div>

            <p className="mt-4 px-1 text-center text-[11px] leading-relaxed text-ink-faint">
              This becomes its own memory, linked back to where it started — nothing about the
              original gets rewritten.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
