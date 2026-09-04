"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Mic, Square, Sparkles, Copy, ClipboardCheck, ArrowRight, Award, FileUp, FileText } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn, safeJsonParse } from "@/lib/utils";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";

// First-run "hero action" screen -- shown once, right after sign-in, BEFORE
// the plan picker (see the countMemories check in (app)/layout.tsx). The
// product problem this fixes: the old first-run order was splash -> plan
// picker -> Home, which meant the very first real decision a brand-new user
// made was "which billing plan," before they'd typed or said a single word
// to the app. This screen exists so the FIRST thing anyone does is
// experience the actual "wow" -- either talk/type about one thing and watch
// it turn into a resume line and competency callout, or upload a resume PDF
// and have Strivo already know their background -- and only then get asked
// about a plan.
//
// Deliberately trimmed vs the real Record screen (app/(app)/record/page.tsx):
// no DarkHeader/Avatar/NotificationBell chrome (this runs before
// CurrentUserProvider exists -- see (app)/layout.tsx), and the
// competency/resume-line output is shown inline rather than in a dismissible
// popup, since for a first-run moment it IS the point of the screen, not a
// bonus reaction to skim past.
//
// "Skip for now" is a real, first-class escape hatch, not a dark pattern --
// required for anyone who genuinely doesn't want to record on the spot, and
// for the Google Play review team, who need to be able to click through
// onboarding without getting stuck on a screen that requires speaking into a
// mic or having a resume handy.
type Mode = "voice" | "type" | "resume";

export default function FirstRecordPage() {
  const router = useRouter();
  const speech = useSpeechRecognition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("voice");
  const [typedText, setTypedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Which path produced the saved state -- the success screen shows
  // resume-line/competency output for "memory", and a simpler "we've got
  // your background now" confirmation for "resume" (a PDF upload never
  // generates competencies/praise/a resume line of its own -- it just
  // becomes background context, see /api/profile/resume).
  const [savedVia, setSavedVia] = useState<"memory" | "resume" | null>(null);
  const [savedCompetencies, setSavedCompetencies] = useState<string[]>([]);
  const [savedPraise, setSavedPraise] = useState<string | null>(null);
  const [savedResumeLine, setSavedResumeLine] = useState<string | null>(null);
  const [resumeLineCopied, setResumeLineCopied] = useState(false);
  const [savedResumeFilename, setSavedResumeFilename] = useState<string | null>(null);

  const content = mode === "voice" ? speech.fullText : typedText;
  const createDisabled = speech.listening || speech.transcribing || saving || !content.trim();

  function switchMode(next: Mode) {
    if (speech.listening || speech.transcribing) return;
    setSaveError(null);
    setMode(next);
  }

  function toggleRecording() {
    if (speech.listening) {
      speech.stop();
    } else {
      speech.start();
    }
  }

  async function copyResumeLine() {
    if (!savedResumeLine) return;
    try {
      await navigator.clipboard.writeText(savedResumeLine);
      setResumeLineCopied(true);
      setTimeout(() => setResumeLineCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable in some contexts -- fail silently,
      // the line is still visible to select and copy manually.
    }
  }

  function skip() {
    router.replace("/welcome-trial");
  }

  async function createMemory() {
    if (!content.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: content.trim(), source: mode === "voice" ? "voice" : "text" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSavedCompetencies(safeJsonParse<string[]>(data.memory.competencies, []));
      setSavedPraise(data.memory.praise ?? null);
      setSavedResumeLine(data.memory.resume_line ?? null);
      setSavedVia("memory");
      setSaved(true);
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? `${e.message}. What you recorded is still here -- you can try again.`
          : "Something went wrong. What you recorded is still here -- you can try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // Reuses the same extraction pipeline Record's file-upload mode and
  // settings/resume use (/api/memories/extract) -- then saves the result as
  // background profile context via /api/profile/resume rather than
  // creating a memory, matching how a resume upload from Settings behaves.
  async function handleResumeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSaving(true);
    setSaveError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const extractRes = await fetch("/api/memories/extract", { method: "POST", body: formData });
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error ?? "Couldn't read that file.");

      const saveRes = await fetch("/api/profile/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: extractData.text, filename: extractData.filename }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error ?? "Couldn't save your resume.");

      setSavedResumeFilename(saveData.filename ?? extractData.filename);
      setSavedVia("resume");
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-8 pt-8">
        <div className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="text-[17px] font-bold tracking-tight text-ink">Strivo</span>
        </div>

        <div className="mt-8 flex flex-col items-center text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-500"
            style={{ boxShadow: "0 8px 20px rgba(245,158,11,0.2)" }}
          >
            {savedVia === "resume" ? <FileText size={26} /> : savedPraise ? <Sparkles size={26} /> : <Award size={26} />}
          </div>

          {savedVia === "resume" ? (
            <>
              <h1 className="mt-4 text-[19px] font-bold text-ink">Got it</h1>
              <p className="mt-1 text-[13px] text-ink-soft max-w-xs">
                {savedResumeFilename} is saved. Strivo will quietly use it to make chat answers and resume lines
                sharper -- it won&apos;t show up as a memory of its own. You can replace or remove it anytime in
                Settings.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-[19px] font-bold text-ink">That&apos;s it -- that&apos;s the app</h1>
              <p className="mt-1 text-[13px] text-ink-soft max-w-xs">
                One thing you said just became something you can actually use.
              </p>
            </>
          )}

          {savedCompetencies.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {savedCompetencies.map((c) => (
                <span key={c} className="rounded-pill bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  {c}
                </span>
              ))}
            </div>
          )}

          {savedPraise && <p className="mt-3 text-[15px] leading-relaxed text-ink">{savedPraise}</p>}

          {savedResumeLine && (
            <div className="mt-4 w-full rounded-[12px] border border-[#ece5f5] bg-[#f9f8fc] p-3 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#a29ab9]">Resume-ready line</p>
              <p className="mt-1 text-sm text-ink leading-snug">{savedResumeLine}</p>
              <button onClick={copyResumeLine} className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#8b5cf6]">
                {resumeLineCopied ? <ClipboardCheck size={13} /> : <Copy size={13} />}
                {resumeLineCopied ? "Copied" : "Copy"}
              </button>
            </div>
          )}

          {savedVia === "memory" && !savedPraise && !savedResumeLine && savedCompetencies.length === 0 && (
            <p className="mt-4 text-sm text-ink-soft">
              Saved. As you record more, Strivo starts spotting patterns, resume lines, and interview-ready stories in what you share.
            </p>
          )}
        </div>

        <div className="mt-auto pt-8">
          <button
            onClick={() => router.replace("/welcome-trial")}
            className="flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
          >
            Continue <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-8 pt-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="text-[17px] font-bold tracking-tight text-ink">Strivo</span>
        </div>
        <button onClick={skip} className="text-[13px] font-semibold text-ink-faint underline">
          Skip for now
        </button>
      </div>

      <h1 className="mt-8 text-[22px] font-bold text-ink">Let&apos;s try it</h1>
      <p className="mt-1.5 text-[13px] text-ink-soft">
        {mode === "resume"
          ? "Upload your resume and Strivo already knows your background -- no talking or typing needed."
          : "Tell us about one thing you did this week -- a project, a decision, a problem you solved. Just talk, no need to structure it. We’ll show you what Strivo does with it."}
      </p>

      <div className="mt-6 rounded-[18px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-6">
        <div className="mb-5 flex gap-1 rounded-pill bg-[#f2effa] p-1">
          {(
            [
              { id: "voice" as const, label: "Voice" },
              { id: "type" as const, label: "Type" },
              { id: "resume" as const, label: "Resume" },
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
                <ErrorBanner message="Voice recording isn't supported in this browser. Please use Type instead." />
              </div>
            )}
            {speech.error && (
              <div className="w-full mb-4">
                <ErrorBanner message={speech.error} />
              </div>
            )}

            <button
              onClick={toggleRecording}
              disabled={!speech.supported || speech.transcribing}
              aria-label={speech.listening ? "Stop recording" : "Tap to record"}
              className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-surface text-[#8b5cf6] disabled:opacity-40"
              style={{ boxShadow: "0 12px 32px rgba(139,92,246,0.25)" }}
            >
              {speech.listening && <span className="absolute inset-0 rounded-full animate-pulse-ring" />}
              {speech.transcribing ? (
                <Spinner className="border-brand-primary-soft border-t-brand-primary h-7 w-7" />
              ) : speech.listening ? (
                <Square size={26} />
              ) : (
                <Mic size={32} />
              )}
            </button>

            <p className="mt-4 text-sm font-semibold text-[#3c3650]">
              {speech.transcribing ? "Transcribing…" : speech.listening ? "Listening… tap to stop" : "Tap to record"}
            </p>

            {(content.trim() || speech.transcribing) && (
              <div className="w-full mt-5 rounded-[13px] border border-[#ece5f5] bg-surface p-4 text-left">
                {speech.transcribing ? (
                  <div className="flex items-center gap-2">
                    <Spinner className="h-4 w-4 border-brand-primary-soft border-t-brand-primary" />
                    <p className="text-sm font-medium text-[#8a82a8]">Transcribing…</p>
                  </div>
                ) : (
                  <p className="text-sm text-ink whitespace-pre-wrap">{content}</p>
                )}
              </div>
            )}
          </div>
        )}

        {mode === "type" && (
          <textarea
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            rows={6}
            autoFocus
            placeholder="Type what you want to remember…"
            className="w-full rounded-[13px] border border-[#ece5f5] bg-surface p-4 text-ink outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20 resize-none"
          />
        )}

        {mode === "resume" && (
          <div className="flex flex-col items-center text-center">
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleResumeFile} />
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-[#8b5cf6]"
              style={{ boxShadow: "0 12px 32px rgba(139,92,246,0.2)" }}
            >
              <FileUp size={26} />
            </div>
            <p className="mt-4 text-sm font-semibold text-[#3c3650]">Upload your resume</p>
            <p className="mt-0.5 text-xs text-[#8a82a8] max-w-xs">
              PDF only, up to 2MB. We&apos;ll use it as background context -- it won&apos;t show up as a memory.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              className="mt-5 flex items-center gap-2 rounded-pill px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
            >
              {saving ? <Spinner className="border-white/40 border-t-white h-4 w-4" /> : <FileUp size={16} />}
              {saving ? "Reading file…" : "Choose PDF"}
            </button>
          </div>
        )}

        {mode !== "resume" && (
          <button
            onClick={createMemory}
            disabled={createDisabled}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
          >
            {saving && <Spinner className="border-white/40 border-t-white h-4 w-4" />}
            See what Strivo does with this
          </button>
        )}
      </div>
    </div>
  );
}
