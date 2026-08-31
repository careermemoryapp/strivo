"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Mic, Square, Check, ArrowRight, Home as HomeIcon, RotateCcw,
  Target, Sparkles as SparklesIcon, CheckCircle2, Lock, ChevronRight,
  Upload, Paperclip, Copy, ClipboardCheck,
} from "lucide-react";
import { safeJsonParse } from "@/lib/utils";
import { DarkHeader } from "@/components/DarkHeader";
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

const MAX_RECORD_SECONDS = 2 * 60;
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
  // Competencies (Leadership, Problem-Solving, etc.) the AI spotted in what
  // was just recorded -- see COMPETENCY_OPTIONS in lib/ai.ts. This is the
  // actual point of the feature: most people dictating a normal story have
  // no idea it happens to be a strong interview example, so surfacing it
  // right here, the moment it's saved, is what makes that visible instead
  // of it sitting undiscovered until someone happens to open the memory.
  const [savedCompetencies, setSavedCompetencies] = useState<string[]>([]);
  // Short, specific, warm compliment paired with the competencies above
  // (see the `praise` field in generateMemoryMetadata, lib/ai.ts) — the
  // "human angle" layer. Shown as a one-time popup (see showPraisePopup)
  // rather than a permanent inline card, so it reads as a genuine reaction
  // in the moment instead of decorative UI chrome. Always null when no
  // competency was detected.
  const [savedPraise, setSavedPraise] = useState<string | null>(null);
  const [showPraisePopup, setShowPraisePopup] = useState(false);
  // Ready-to-use resume bullet (always English — see resumeLine in
  // generateMemoryMetadata, lib/ai.ts) shown alongside the praise in the
  // same popup, with a one-tap copy so the value isn't just a compliment
  // but something immediately usable.
  const [savedResumeLine, setSavedResumeLine] = useState<string | null>(null);
  const [resumeLineCopied, setResumeLineCopied] = useState(false);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hitLimit, setHitLimit] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const content = mode === "voice" ? speech.fullText : mode === "type" ? typedText : uploadText;
  const source: Source = mode === "voice" ? "voice" : mode === "type" ? "text" : "file";

  // 2-minute cap on a single recording stretch — auto-stops and locks the
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

  async function copyResumeLine() {
    if (!savedResumeLine) return;
    try {
      await navigator.clipboard.writeText(savedResumeLine);
      setResumeLineCopied(true);
      setTimeout(() => setResumeLineCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable in some contexts (e.g. no HTTPS,
      // permission denied) — fail silently, the line is still visible to
      // select and copy manually.
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
    setSavedCompetencies([]);
    setSavedPraise(null);
    setShowPraisePopup(false);
    setSavedResumeLine(null);
    setResumeLineCopied(false);
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
      const competencies = safeJsonParse<string[]>(data.memory.competencies, []);
      setSavedCompetencies(competencies);
      setSavedPraise(data.memory.praise ?? null);
      setSavedResumeLine(data.memory.resume_line ?? null);
      setStage("success");
      // Small delay so the popup lands a beat after the success screen
      // appears, instead of both flashing in at once — reads as a genuine
      // reaction to what was just recorded rather than a loading artifact.
      if (competencies.length > 0 && data.memory.praise) {
        setTimeout(() => setShowPraisePopup(true), 450);
      }
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
      <div className="pb-6">
        <DarkHeader inlineTitle="Memory Saved" />
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
              <button
                onClick={() => router.push(`/memories/${savedMemoryId}`)}
                className="flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
              >
                View Memory <ArrowRight size={16} />
              </button>
            )}
            <Button variant="secondary" className="w-full" onClick={startOver}>
              <RotateCcw size={16} /> Capture Another
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => router.push("/home")}>
              <HomeIcon size={16} /> Go Home
            </Button>
          </div>
        </div>

        {/* The actual point of competency detection: most people telling a
            normal, casual story have no reason to know it happens to be a
            strong interview example -- so tell them, in the moment, with an
            actual reaction rather than a permanent inline box they might
            skim past. Auto-opens (see the setTimeout in createMemory) and
            only appears when the AI genuinely found something to praise --
            see the `praise` field in generateMemoryMetadata (lib/ai.ts),
            which is only ever non-null when competencies is non-empty. */}
        {showPraisePopup && savedPraise && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-5 pb-5 sm:items-center sm:pb-0"
            onClick={() => setShowPraisePopup(false)}
          >
            <div
              className="w-full max-w-sm rounded-[22px] bg-surface p-6 text-center"
              style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.28)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-500"
                style={{ boxShadow: "0 8px 20px rgba(245,158,11,0.2)" }}
              >
                <SparklesIcon size={26} />
              </div>
              {savedCompetencies.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {savedCompetencies.map((c) => (
                    <span key={c} className="rounded-pill bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      {c}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[15px] leading-relaxed text-ink">{savedPraise}</p>

              {/* Immediately usable, not just a compliment -- a real resume
                  bullet pulled from this specific story, with any numbers
                  in the transcript worked in. Always English (see
                  resumeLine in generateMemoryMetadata, lib/ai.ts) even when
                  the memory itself was recorded in Hindi, since that's the
                  resume convention here. */}
              {savedResumeLine && (
                <div className="mt-4 rounded-[12px] border border-[#ece5f5] bg-[#f9f8fc] p-3 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#a29ab9]">
                    Resume-ready line
                  </p>
                  <p className="mt-1 text-sm text-ink leading-snug">{savedResumeLine}</p>
                  <button
                    onClick={copyResumeLine}
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#8b5cf6]"
                  >
                    {resumeLineCopied ? <ClipboardCheck size={13} /> : <Copy size={13} />}
                    {resumeLineCopied ? "Copied" : "Copy"}
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowPraisePopup(false)}
                className="mt-5 w-full rounded-pill py-3 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#fbbf24,#f97316)" }}
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const remainingSeconds = MAX_RECORD_SECONDS - elapsedSeconds;
  const nearLimit = speech.listening && remainingSeconds <= 30;
  const createDisabled = speech.listening || speech.transcribing || extracting || saving || !content.trim();

  return (
    <div className="pb-6">
      <DarkHeader
        wordmark
        avatarRight={
          <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} size={32} />
          </button>
        }
        title="Record Memory"
        subtitle="Capture your thoughts. Your AI will remember what matters."
      />

      <div className="px-5 pt-5">
        <div className="rounded-[18px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-6">
          <div className="mb-5 flex gap-1 rounded-pill bg-[#f2effa] p-1">
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
                  mode === tab.id ? "bg-surface text-[#8b5cf6]" : "text-[#a29ab9]"
                )}
                style={mode === tab.id ? { boxShadow: "0 2px 6px rgba(60,50,90,0.08)" } : undefined}
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
                  <ErrorBanner message="Reached the 2-minute limit for a single recording — recording stopped automatically. You can create the memory with what was captured, or start a new recording." />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Waveform active={speech.listening} />
                <button
                  onClick={toggleRecording}
                  disabled={!speech.supported || speech.transcribing}
                  aria-label={speech.listening ? "Stop recording" : "Tap to record"}
                  className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-surface text-[#8b5cf6] disabled:opacity-40"
                  style={{ boxShadow: "0 12px 32px rgba(139,92,246,0.25)" }}
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

              <p className="mt-4 text-base font-semibold text-[#3c3650]">
                {speech.transcribing ? "Transcribing…" : speech.listening ? "Listening… tap to stop" : "Tap to Record"}
              </p>
              {speech.listening ? (
                <p className={cn("mt-0.5 text-xs font-medium", nearLimit ? "text-red-600" : "text-[#8a82a8]")}>
                  {formatClock(remainingSeconds)} left of a 2-minute stretch
                </p>
              ) : speech.transcribing ? (
                <p className="mt-0.5 text-xs text-[#8a82a8]">Turning your recording into text…</p>
              ) : (
                <p className="mt-0.5 text-xs text-[#8a82a8]">Speak freely — up to 2 minutes at a stretch.</p>
              )}

              {/* Shows right where the user is already looking, instead of
                  a separate panel further down the page — makes it obvious
                  the recording is still being processed, and then shows
                  exactly what was captured before they hit Create Memory. */}
              {(content.trim() || speech.transcribing) && (
                <div className="w-full mt-5 rounded-[13px] border border-[#ece5f5] bg-surface p-4 text-left">
                  {speech.transcribing ? (
                    <div className="flex items-center gap-2">
                      <Spinner className="h-4 w-4 border-brand-primary-soft border-t-brand-primary" />
                      <p className="text-sm font-medium text-[#8a82a8]">Transcribing your recording…</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-[#a8a2bd] uppercase tracking-wide mb-1.5">Transcript</p>
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
                className="w-full rounded-[13px] border border-[#ece5f5] bg-surface p-4 text-ink outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20 resize-none"
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
                className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-[#8b5cf6]"
                style={{ boxShadow: "0 12px 32px rgba(139,92,246,0.2)" }}
              >
                <Paperclip size={26} />
              </div>
              <p className="mt-4 text-base font-semibold text-[#3c3650]">Upload a document</p>
              <p className="mt-0.5 text-xs text-[#8a82a8] max-w-xs">
                PDF, Word, PowerPoint, or Excel — we&apos;ll pull out the text and turn it into a memory.
              </p>

              {uploadError && (
                <div className="w-full mt-4">
                  <ErrorBanner message={uploadError} />
                </div>
              )}

              {uploadedFileName && uploadText && !uploadError && (
                <div className="w-full mt-4 rounded-[13px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-left">
                  <p className="text-xs font-medium text-ink truncate">{uploadedFileName}</p>
                  <p className="text-[11px] text-[#8a82a8] mt-0.5">Text extracted — ready to create the memory below.</p>
                </div>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={extracting}
                className="mt-5 flex items-center gap-2 rounded-pill px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
              >
                {extracting ? <Spinner className="border-white/40 border-t-white h-4 w-4" /> : <Upload size={16} />}
                {extracting ? "Reading file…" : uploadedFileName ? "Choose a different file" : "Choose File"}
              </button>
              <p className="mt-3 text-[11px] text-[#a8a2bd]">.pdf, .docx, .pptx, .xlsx, .csv, .txt — up to 2MB</p>
            </div>
          )}

          <button
            onClick={createMemory}
            disabled={createDisabled}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
          >
            {saving && <Spinner className="border-white/40 border-t-white h-4 w-4" />}
            Create Memory
          </button>
        </div>
      </div>

      <div className="px-5 pt-6">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Tips for better memories</p>
        <div className="grid grid-cols-3 gap-3">
          {TIPS.map((tip) => (
            <div key={tip.title}>
              <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#f2effa] text-[#8b5cf6]">
                <tip.icon size={16} />
              </div>
              <p className="mt-2 text-xs font-semibold text-ink">{tip.title}</p>
              <p className="text-[11px] text-ink-faint leading-snug">{tip.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <button className="mx-5 mt-5 flex items-center gap-3 rounded-[14px] bg-[#f2effa] p-3.5 text-left">
        <Lock size={18} className="text-[#8b5cf6] shrink-0" />
        <span className="flex-1 text-xs text-[#7d7594]">
          <span className="font-semibold text-ink">Your memories are private and secure.</span> Only you and your AI can access them.
        </span>
        <ChevronRight size={16} className="text-[#cec7dd] shrink-0" />
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
          className={cn("w-1 rounded-full bg-[#c9bdf0]", active && "bg-[#8b5cf6]/70")}
          style={{ height: h, animation: active ? `bar-pulse 0.9s ease-in-out ${i * 0.08}s infinite alternate` : undefined }}
        />
      ))}
    </div>
  );
}
