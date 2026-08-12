"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Mic, Square, Keyboard, Check, ArrowRight, Home as HomeIcon, RotateCcw,
  Target, Sparkles as SparklesIcon, CheckCircle2, MessageSquareText, Lock, ChevronRight, FileText,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LogoWithWordmark } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";

type Stage = "capture" | "review" | "success";

const TIPS = [
  { icon: Target, title: "Be specific", desc: "Add context and details that matter." },
  { icon: SparklesIcon, title: "Speak naturally", desc: "No need to structure. Just talk." },
  { icon: CheckCircle2, title: "One thought", desc: "Focus on one idea or moment at a time." },
];

export default function RecordPage() {
  const router = useRouter();
  const speech = useSpeechRecognition();

  const [stage, setStage] = useState<Stage>("capture");
  const [mode, setMode] = useState<"voice" | "type">("voice");
  const [typedText, setTypedText] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [previewTab, setPreviewTab] = useState<"Transcript" | "Summary">("Transcript");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMemoryId, setSavedMemoryId] = useState<string | null>(null);
  const [aiGenerated, setAiGenerated] = useState(true);

  const liveText = mode === "voice" ? speech.fullText : typedText;

  function goReview() {
    setReviewText(liveText.trim());
    setStage("review");
  }

  function startOver() {
    speech.reset();
    setTypedText("");
    setReviewText("");
    setSaveError(null);
    setStage("capture");
  }

  async function saveMemory() {
    if (!reviewText.trim()) {
      setSaveError("Add some text before saving.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: reviewText, source: mode === "voice" ? "voice" : "text" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSavedMemoryId(data.memory.id);
      setAiGenerated(!!data.aiMetadataGenerated);
      setStage("success");
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? `${e.message}. Your text is still here — you can try saving again.`
          : "Something went wrong saving your memory. Your text is still here — try again."
      );
    } finally {
      setSaving(false);
    }
  }

  if (stage === "success") {
    return (
      <div>
        <PageHeader title="Memory Saved" />
        <div className="px-5 pt-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Check size={30} />
          </div>
          <h2 className="text-lg font-semibold text-ink">Your memory is saved</h2>
          <p className="mt-1 text-sm text-ink-soft max-w-xs">
            {aiGenerated
              ? "Your AI has generated a title, summary, and tags for it."
              : "We saved your transcript. AI summary generation didn't complete, but your words are safe — you can still view and search this memory."}
          </p>
          <div className="mt-8 w-full space-y-3">
            {savedMemoryId && (
              <Button className="w-full" onClick={() => router.push(`/memories/${savedMemoryId}`)}>
                View Memory <ArrowRight size={16} />
              </Button>
            )}
            <Button variant="secondary" className="w-full" onClick={startOver}>
              <RotateCcw size={16} /> Capture Another
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => router.push("/home")}>
              <HomeIcon size={16} /> Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "review") {
    return (
      <div>
        <PageHeader title="Review Memory" subtitle="Edit anything before saving." back />
        <div className="px-5 pt-2 space-y-4">
          {saveError && <ErrorBanner message={saveError} />}
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            rows={12}
            className="w-full rounded-card border border-border bg-surface p-4 text-ink outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-soft resize-none"
            placeholder="Your memory..."
          />
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setStage("capture")}>
              Back
            </Button>
            <Button className="flex-1" onClick={saveMemory} loading={saving}>
              Save Memory
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-6">
        <LogoWithWordmark size={22} />
        <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
          <Avatar size={34} />
        </button>
      </div>

      <div className="px-5 pt-4">
        <h1 className="text-2xl font-bold text-ink">Record Memory</h1>
        <p className="mt-1 text-sm text-ink-soft">Capture your thoughts. Your AI will remember what matters.</p>
      </div>

      <div className="px-5 pt-5">
        <div className="rounded-card bg-brand-primary-soft/40 border border-border p-6">
          {mode === "voice" ? (
            <div className="flex flex-col items-center">
              {!speech.supported && (
                <div className="w-full mb-4">
                  <ErrorBanner message="Voice recording isn't supported in this browser. Please use Type Instead." />
                </div>
              )}
              {speech.error && (
                <div className="w-full mb-4">
                  <ErrorBanner message={`${speech.error} You can allow microphone access in your browser settings, or use Type Instead.`} />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Waveform active={speech.listening} />
                <button
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  disabled={!speech.supported}
                  aria-label={speech.listening ? "Stop recording" : "Tap to record"}
                  className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-surface text-brand-primary disabled:opacity-40"
                  style={{ boxShadow: "0 12px 32px rgba(124,58,237,0.25)" }}
                >
                  {speech.listening && <span className="absolute inset-0 rounded-full animate-pulse-ring" />}
                  {speech.listening ? <Square size={30} /> : <Mic size={36} />}
                </button>
                <Waveform active={speech.listening} />
              </div>

              <p className="mt-4 text-base font-semibold text-ink">
                {speech.listening ? "Listening… tap to stop" : "Tap to Record"}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">Speak freely and your AI will capture the key points.</p>

              <div className="mt-5 flex w-full items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-ink-faint">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <button
                onClick={() => setMode("type")}
                className="mt-4 flex items-center gap-2 rounded-pill border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-brand-primary"
              >
                <Keyboard size={16} /> Type instead
              </button>
            </div>
          ) : (
            <div>
              <textarea
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                rows={8}
                autoFocus
                placeholder="Type what you want to remember…"
                className="w-full rounded-card border border-border bg-surface p-4 text-ink outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-soft resize-none"
              />
              {speech.supported && (
                <button
                  onClick={() => setMode("voice")}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-pill border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-brand-primary"
                >
                  <Mic size={16} /> Use voice instead
                </button>
              )}
            </div>
          )}

          <Button
            className="w-full mt-5"
            onClick={goReview}
            disabled={speech.listening || !liveText.trim()}
          >
            Review &amp; Save
          </Button>
        </div>
      </div>

      <div className="px-5 pt-5">
        <div className="rounded-card border border-border bg-surface p-4">
          <h3 className="font-semibold text-ink">Tips for better memories</h3>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {TIPS.map((tip) => (
              <div key={tip.title}>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary-soft text-brand-primary">
                  <tip.icon size={16} />
                </div>
                <p className="mt-2 text-xs font-semibold text-ink">{tip.title}</p>
                <p className="text-[11px] text-ink-soft leading-snug">{tip.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="rounded-card border border-border bg-surface overflow-hidden">
          <div className="flex gap-1 p-2 border-b border-border">
            <button
              onClick={() => setPreviewTab("Transcript")}
              className={cn(
                "flex-1 rounded-pill py-2 text-sm font-medium",
                previewTab === "Transcript" ? "text-brand-primary" : "text-ink-faint"
              )}
            >
              Transcript
            </button>
            <button
              onClick={() => setPreviewTab("Summary")}
              className={cn(
                "flex-1 rounded-pill py-2 text-sm font-medium",
                previewTab === "Summary" ? "text-brand-primary" : "text-ink-faint"
              )}
            >
              Summary (AI)
            </button>
          </div>
          <div className="p-6 flex flex-col items-center text-center">
            {previewTab === "Transcript" ? (
              liveText.trim() ? (
                <p className="text-sm text-ink whitespace-pre-wrap">{liveText}</p>
              ) : (
                <>
                  <MessageSquareText size={22} className="text-ink-faint mb-2" />
                  <p className="text-sm font-medium text-ink">Your transcript will appear here</p>
                  <p className="text-xs text-ink-soft mt-0.5">Start recording to capture your thoughts…</p>
                </>
              )
            ) : (
              <>
                <FileText size={22} className="text-ink-faint mb-2" />
                <p className="text-sm font-medium text-ink">Summary appears after saving</p>
                <p className="text-xs text-ink-soft mt-0.5">Your AI generates this once you save the memory.</p>
              </>
            )}
          </div>
        </div>
      </div>

      <button className="mx-5 mt-4 mb-6 flex items-center gap-3 rounded-card border border-border bg-brand-primary-soft/30 p-3.5 text-left">
        <Lock size={18} className="text-brand-primary shrink-0" />
        <span className="flex-1 text-xs text-ink-soft">
          <span className="font-medium text-ink">Your memories are private and secure.</span> Only you and your AI can access them.
        </span>
        <ChevronRight size={16} className="text-ink-faint shrink-0" />
      </button>
    </div>
  );
}

function Waveform({ active }: { active: boolean }) {
  const bars = [6, 12, 18, 10, 16, 8, 14];
  return (
    <div className="hidden sm:flex items-center gap-1 h-10">
      {bars.map((h, i) => (
        <span
          key={i}
          className={cn("w-1 rounded-full bg-brand-primary/30", active && "bg-brand-primary/60")}
          style={{ height: h, animation: active ? `bar-pulse 0.9s ease-in-out ${i * 0.08}s infinite alternate` : undefined }}
        />
      ))}
    </div>
  );
}
