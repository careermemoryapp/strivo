"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Mic, Square, Check, ArrowRight, Home as HomeIcon, RotateCcw,
  Target, Sparkles as SparklesIcon, CheckCircle2, Lock, ChevronRight,
  Upload, Paperclip,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LogoWithWordmark } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { useCurrentUser } from "@/lib/useCurrentUser";

type Stage = "capture" | "success";
type Mode = "voice" | "type" | "upload";
type Source = "voice" | "text" | "file";

const TIPS = [
  { icon: Target, title: "Be specific", desc: "Add context and details that matter." },
  { icon: SparklesIcon, title: "Speak naturally", desc: "No need to structure. Just talk." },
  { icon: CheckCircle2, title: "One thought", desc: "Focus on one idea or moment at a time." },
];

const MAX_RECORD_SECONDS = 5 * 60;
const UPLOAD_ACCEPT = ".pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt";

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function RecordPage() {
  const router = useRouter();
  const speech = useSpeechRecognition();
  const user = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("capture");
  const [mode, setMode] = useState<Mode>("voice");
  const [typedText, setTypedText] = useState("");
  const [uploadText, setUploadText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMemoryId, setSavedMemoryId] = useState<string | null>(null);
  const [aiGenerated, setAiGenerated] = useState(true);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hitLimit, setHitLimit] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const content = mode === "voice" ? speech.fullText : mode === "type" ? typedText : uploadText;
  const source: Source = mode === "voice" ? "voice" : mode === "type" ? "text" : "file";

  // 5-minute cap on a single recording stretch — auto-stops and locks the
  // button until a fresh recording is started, per product requirement.
  useEffect(() => {
    if (!speech.listening) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => {
        if (s + 1 >= MAX_RECORD_SECONDS) {
          speech.stop();
          setHitLimit(true);
          return MAX_RECORD_SECONDS;
        }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speech.stop is a stable useCallback ref
  }, [speech.listening]);

  function toggleRecording() {
    if (speech.listening) {
      speech.stop();
    } else {
      setElapsedSeconds(0);
      setHitLimit(false);
      speech.start();
    }
  }

  function switchMode(next: Mode) {
    if (speech.listening || speech.transcribing) return;
    setSaveError(null);
    setMode(next);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setExtracting(true);
    setUploadError(null);
    setUploadText("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/memories/extract", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that file.");
      setUploadedFileName(file.name);
      setUploadText(data.text);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Couldn't read that file. Please try again.");
    } finally {
      setExtracting(false);
    }
  }

  function startOver() {
    speech.reset();
    setTypedText("");
    setUploadText("");
    setSaveError(null);
    setUploadError(null);
    setUploadedFileName(null);
    setElapsedSeconds(0);
    setHitLimit(false);
    setMode("voice");
    setStage("capture");
  }

  async function createMemory() {
    if (!content.trim()) {
      setSaveError("Add some content before creating a memory.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: content.trim(), source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSavedMemoryId(data.memory.id);
      setAiGenerated(!!data.aiMetadataGenerated);
      setStage("success");
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? `${e.message}. Your content is still here — you can try again.`
          : "Something went wrong creating your memory. Your content is still here — try again."
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

  const remainingSeconds = MAX_RECORD_SECONDS - elapsedSeconds;
  const nearLimit = speech.listening && remainingSeconds <= 30;
  const createDisabled = speech.listening || speech.transcribing || extracting || saving || !content.trim();

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-6">
        <LogoWithWordmark size={36} />
        <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
          <Avatar firstName={user?.firstName} lastName={user?.lastName} size={34} />
        </button>
      </div>

      <div className="px-5 pt-4">
        <h1 className="text-2xl font-bold text-ink">Record Memory</h1>
        <p className="mt-1 text-sm text-ink-soft">Capture your thoughts. Your AI will remember what matters.</p>
      </div>

      <div className="px-5 pt-5">
        <div className="rounded-card bg-brand-primary-soft/40 border border-border p-6">
          <div className="mb-5 flex gap-1 rounded-pill bg-surface border border-border p-1">
            {(
              [
                { id: "voice" as const, label: "Voice" },
                { id: "type" as const, label: "Type" },
                { id: "upload" as const, label: "Upload" },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => switchMode(tab.id)}
                disabled={speech.listening || speech.transcribing}
                className={cn(
                  "flex-1 rounded-pill py-2 text-xs font-semibold disabled:opacity-50",
                  mode === tab.id ? "bg-brand-primary-soft text-brand-primary" : "text-ink-faint"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {saveError && (
            <div className="w-full mb-4">
              <ErrorBanner message={saveError} />
            </div>
          )}

          {mode === "voice" && (
            <div className="flex flex-col items-center">
              {!speech.supported && (
                <div className="w-full mb-4">
                  <ErrorBanner message="Voice recording isn't supported in this browser. Please use Type Instead." />
                </div>
              )}
              {speech.error && (
                <div className="w-full mb-4">
                  <ErrorBanner
                    message={
                      speech.error === "Microphone access was denied."
                        ? `${speech.error} You can allow microphone access in your browser settings, or use Type Instead.`
                        : speech.error
                    }
                  />
                </div>
              )}
              {hitLimit && !speech.listening && (
                <div className="w-full mb-4">
                  <ErrorBanner message="Reached the 5-minute limit for a single recording — recording stopped automatically. You can create the memory with what was captured, or start a new recording." />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Waveform active={speech.listening} />
                <button
                  onClick={toggleRecording}
                  disabled={!speech.supported || speech.transcribing}
                  aria-label={speech.listening ? "Stop recording" : "Tap to record"}
                  className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-surface text-brand-primary disabled:opacity-40"
                  style={{ boxShadow: "0 12px 32px rgba(124,58,237,0.25)" }}
                >
                  {speech.listening && <span className="absolute inset-0 rounded-full animate-pulse-ring" />}
                  {speech.transcribing ? (
                    <Spinner className="border-brand-primary-soft border-t-brand-primary h-8 w-8" />
                  ) : speech.listening ? (
                    <Square size={30} />
                  ) : (
                    <Mic size={36} />
                  )}
                </button>
                <Waveform active={speech.listening} />
              </div>

              <p className="mt-4 text-base font-semibold text-ink">
                {speech.transcribing ? "Transcribing…" : speech.listening ? "Listening… tap to stop" : "Tap to Record"}
              </p>
              {speech.listening ? (
                <p className={cn("mt-0.5 text-xs font-medium", nearLimit ? "text-red-600" : "text-ink-soft")}>
                  {formatClock(remainingSeconds)} left of a 5-minute stretch
                </p>
              ) : speech.transcribing ? (
                <p className="mt-0.5 text-xs text-ink-soft">Turning your recording into text…</p>
              ) : (
                <p className="mt-0.5 text-xs text-ink-soft">Speak freely — up to 5 minutes at a stretch.</p>
              )}

              {/* Shows right where the user is already looking, instead of
                  a separate panel further down the page — makes it obvious
                  the recording is still being processed, and then shows
                  exactly what was captured before they hit Create Memory. */}
              {(content.trim() || speech.transcribing) && (
                <div className="w-full mt-5 rounded-input border border-border bg-surface p-4 text-left">
                  {speech.transcribing ? (
                    <div className="flex items-center gap-2">
                      <Spinner className="h-4 w-4 border-brand-primary-soft border-t-brand-primary" />
                      <p className="text-sm font-medium text-ink-soft">Transcribing your recording…</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-1.5">Transcript</p>
                      <p className="text-sm text-ink whitespace-pre-wrap">{content}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === "type" && (
            <div>
              <textarea
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                rows={8}
                autoFocus
                placeholder="Type what you want to remember…"
                className="w-full rounded-card border border-border bg-surface p-4 text-ink outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-soft resize-none"
              />
            </div>
          )}

          {mode === "upload" && (
            <div className="flex flex-col items-center text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept={UPLOAD_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-brand-primary"
                style={{ boxShadow: "0 12px 32px rgba(124,58,237,0.2)" }}
              >
                <Paperclip size={26} />
              </div>
              <p className="mt-4 text-base font-semibold text-ink">Upload a document</p>
              <p className="mt-0.5 text-xs text-ink-soft max-w-xs">
                PDF, Word, PowerPoint, or Excel — we&apos;ll pull out the text and turn it into a memory.
              </p>

              {uploadError && (
                <div className="w-full mt-4">
                  <ErrorBanner message={uploadError} />
                </div>
              )}

              {uploadedFileName && uploadText && !uploadError && (
                <div className="w-full mt-4 rounded-input border border-border bg-surface px-3.5 py-2.5 text-left">
                  <p className="text-xs font-medium text-ink truncate">{uploadedFileName}</p>
                  <p className="text-[11px] text-ink-soft mt-0.5">Text extracted — ready to create the memory below.</p>
                </div>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={extracting}
                className="mt-5 flex items-center gap-2 rounded-pill bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {extracting ? <Spinner className="border-white/40 border-t-white h-4 w-4" /> : <Upload size={16} />}
                {extracting ? "Reading file…" : uploadedFileName ? "Choose a different file" : "Choose File"}
              </button>
              <p className="mt-3 text-[11px] text-ink-faint">.pdf, .docx, .pptx, .xlsx, .csv, .txt — up to 15MB</p>
            </div>
          )}

          <Button className="w-full mt-5" onClick={createMemory} disabled={createDisabled} loading={saving}>
            Create Memory
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
