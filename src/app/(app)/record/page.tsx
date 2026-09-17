"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { Capacitor } from "@capacitor/core";
import {
  Mic, Square, Check, ArrowRight, Home as HomeIcon, RotateCcw,
  Target, Sparkles as SparklesIcon, CheckCircle2, Lock, ChevronRight,
  Upload, Paperclip, Copy, ClipboardCheck, Award, MessageCircleQuestion,
} from "lucide-react";
import { safeJsonParse, pickVariant } from "@/lib/utils";
import { markExpectedResume } from "@/lib/nativePlatform";
import { DarkHeader } from "@/components/DarkHeader";
import { Avatar } from "@/components/Avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { ProjectAssigner, type ProjectSuggestion } from "@/components/ProjectAssigner";

type Stage = "capture" | "success";
type Mode = "voice" | "type" | "upload";
type Source = "voice" | "text" | "file";

const TIPS = [
  { icon: Target, title: "Be specific", desc: "Add context and details that matter." },
  { icon: SparklesIcon, title: "Speak naturally", desc: "No need to structure. Just talk." },
  { icon: CheckCircle2, title: "One thought", desc: "Focus on one idea or moment at a time." },
];

// The Record success screen is shown after literally every save -- the
// single most-repeated screen in the app -- so its copy is the highest-
// leverage place to avoid the "same sentence every single time" robotic
// feeling. Picked deterministically per-memory (see pickVariant in
// lib/utils.ts) rather than randomly on every render, so it's stable for a
// given memory instead of flickering. Kept to small, equivalent-meaning
// pools -- this is a tone touch, not a place to introduce ambiguity.
const SAVED_HEADINGS = ["Your memory is saved", "Saved — one more story captured", "Got it, safely saved"];
const AI_GENERATED_SUBTEXT = [
  "Your AI has generated a title, summary, and tags for it.",
  "We've pulled out a title, summary, and tags automatically.",
  "Titled, summarized, and tagged — ready whenever you want it.",
];
const ONE_MORE_THING_LABELS = ["One more thing —", "Quick follow-up —", "Curious about one thing —"];

const MAX_RECORD_SECONDS = 2 * 60;
// Mirrors MIN_CHARS_FOR_SPLIT_CHECK in app/api/memories/split/route.ts --
// short-circuits the split-detection request client-side for anything that
// was never going to be a genuine multi-story document (voice/typed notes,
// short file uploads), rather than always making the round trip and having
// the server immediately return an empty story list. The server enforces
// this same floor independently either way.
const MIN_CHARS_FOR_SPLIT_CHECK = 3000;
// IANA media types, for FilePicker's `types` option -- replaces the old
// extension-based accept="..." string now that file picking goes through
// @capawesome/capacitor-file-picker instead of a raw <input type="file">.
const UPLOAD_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
];

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Home's flow-strip buttons deep-link here with ?mode=type|voice|upload
// (see FlowStep in HomeClient.tsx) so "Record" and "Create Memory" can land
// on this same page pre-set to the right tab instead of always defaulting
// to Voice. useSearchParams needs a Suspense boundary in the app router --
// same pattern as (auth)/login/page.tsx.
export default function RecordPage() {
  return (
    <Suspense fallback={null}>
      <RecordPageInner />
    </Suspense>
  );
}

function RecordPageInner() {
  const router = useRouter();
  const speech = useSpeechRecognition();
  const user = useCurrentUser();
  const searchParams = useSearchParams();

  const initialMode: Mode = searchParams.get("mode") === "type" ? "type" : searchParams.get("mode") === "upload" ? "upload" : "voice";

  const [stage, setStage] = useState<Stage>("capture");
  const [mode, setMode] = useState<Mode>(initialMode);
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
  // One-time milestone callouts (see MEMORY_COUNT_MILESTONES and the
  // per-competency/hard-number checks in app/api/memories/route.ts) --
  // small, earned moments ("First Leadership story", "10th memory
  // recorded") rather than a repetitive streak counter. Shown in the same
  // popup as the praise above when present, but can also open the popup on
  // its own when there's a milestone with no competency praise attached.
  const [savedMilestones, setSavedMilestones] = useState<string[]>([]);
  // The optional "someone is actually listening" follow-up question (see
  // reflectiveQuestion in generateMemoryMetadata, lib/ai.ts) -- shown as an
  // inline, skippable prompt on the success screen rather than a popup,
  // since it asks for input instead of just delivering a reaction. Null
  // when the AI judged this memory too thin to follow up on.
  const [savedReflectiveQuestion, setSavedReflectiveQuestion] = useState<string | null>(null);
  const [reflectionText, setReflectionText] = useState("");
  const [reflectionSaving, setReflectionSaving] = useState(false);
  // "answered" | "skipped" collapses the prompt into a quiet confirmation
  // instead of leaving an answered (or dismissed) question sitting on
  // screen looking unfinished.
  const [reflectionOutcome, setReflectionOutcome] = useState<"answered" | "skipped" | null>(null);

  // The AI's guess at which project this memory belongs to (see
  // suggestedExistingProjectName/suggestedNewProjectName in
  // generateMemoryMetadata, lib/ai.ts, resolved into this shape by
  // /api/memories' POST handler). Null suggestion fields mean "no guess" --
  // ProjectAssigner itself decides whether that's worth showing a card for.
  // Freshly-created memory always starts with no project assigned, so
  // there's no currentProjectId/currentProjectName to seed here.
  const [savedProjectSuggestion, setSavedProjectSuggestion] = useState<ProjectSuggestion | null>(null);
  const [assignedProjectId, setAssignedProjectId] = useState<string | null>(null);
  const [assignedProjectName, setAssignedProjectName] = useState<string | null>(null);

  // Set instead of savedMemoryId when a long uploaded document turned out
  // to be a collection of multiple stories (see POST /api/memories/split
  // and createMemory below) -- each one is now its own real memory, so the
  // success screen below shows a list instead of the single-memory fields
  // (praise/resume line/reflective question/project assigner) that only
  // ever describe ONE memory. Empty means "not a split" -- the normal
  // single-memory success screen renders instead.
  const [splitMemories, setSplitMemories] = useState<{ id: string; title: string; competencies: string[] }[]>([]);
  // How many of the stories a split document found couldn't be saved (each
  // story is now its own separate request -- see the comment on
  // createMemory below -- so one story failing doesn't lose the others).
  // 0 for the normal case; shown as a small note on the batch success
  // screen only when it's actually non-zero.
  const [splitSaveFailedCount, setSplitSaveFailedCount] = useState(0);
  // "Saving 3 of 18..." progress while a split document's stories are being
  // saved one request at a time -- null outside of that (the plain
  // single-memory save has no meaningful sub-progress to show).
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hitLimit, setHitLimit] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  // Optional context the user can add about what the uploaded document
  // actually is (e.g. "my career history before my MBA") -- folded into
  // the saved transcript as a short prefix (see `content` below) rather
  // than a separate field, so it flows through the exact same AI pipeline
  // (title/summary/tags, and the multi-story split for long documents --
  // see splitDocumentIntoStories in lib/ai.ts) as everything else, with no
  // new plumbing needed. Purely optional -- never blocks Create Memory.
  const [uploadNote, setUploadNote] = useState("");

  const content =
    mode === "voice"
      ? speech.fullText
      : mode === "type"
        ? typedText
        : uploadNote.trim()
          ? `Document note from the user: ${uploadNote.trim()}\n\n${uploadText}`
          : uploadText;
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

  // Uses @capawesome/capacitor-file-picker instead of a raw
  // <input type="file"> + hidden ref + WebView file-chooser bridge -- that
  // old approach was silently dropping selected files app-wide on Android
  // (system picker opens, user picks a file, nothing happens, no error).
  // This plugin talks to the OS picker directly instead of going through
  // the flaky Chromium WebView file-input bridge.
  async function pickFile() {
    setExtracting(true);
    setUploadError(null);
    setUploadText("");
    setUploadNote("");
    try {
      // See lib/nativePlatform.ts -- has to mark this resume as expected or
      // Providers.tsx's reload-on-resume wipes this in-flight pick before
      // it finishes.
      markExpectedResume();
      const result = await FilePicker.pickFiles({ types: UPLOAD_TYPES, limit: 1 });
      const picked = result.files[0];
      if (!picked) {
        setExtracting(false);
        return; // user dismissed the picker without choosing a file
      }

      // On web, the plugin hands back a Blob directly. On Android/iOS, it
      // hands back a native file path -- convertFileSrc() turns that into a
      // URL the WebView can actually fetch, then we read it as a blob.
      let blob: Blob;
      if (picked.blob) {
        blob = picked.blob;
      } else {
        const fileRes = await fetch(Capacitor.convertFileSrc(picked.path!));
        blob = await fileRes.blob();
      }

      const formData = new FormData();
      formData.append("file", blob, picked.name);
      const res = await fetch("/api/memories/extract", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that file.");
      setUploadedFileName(picked.name);
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
    setUploadNote("");
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
    setSavedMilestones([]);
    setSavedReflectiveQuestion(null);
    setReflectionText("");
    setReflectionSaving(false);
    setReflectionOutcome(null);
    setSavedProjectSuggestion(null);
    setAssignedProjectId(null);
    setAssignedProjectName(null);
    setSplitMemories([]);
    setSplitSaveFailedCount(0);
    setBatchProgress(null);
  }

  async function submitReflection() {
    if (!savedMemoryId || !reflectionText.trim()) return;
    setReflectionSaving(true);
    try {
      const res = await fetch(`/api/memories/${savedMemoryId}/reflect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: reflectionText.trim() }),
      });
      if (!res.ok) throw new Error();
      setReflectionOutcome("answered");
    } catch {
      // Best-effort, non-critical enrichment -- the memory itself is
      // already safely saved either way, so a failure here just leaves the
      // prompt visible to retry rather than showing a scary error banner.
      setReflectionSaving(false);
      return;
    }
    setReflectionSaving(false);
  }

  async function createMemory() {
    if (!content.trim()) {
      setSaveError("Add some content before creating a memory.");
      return;
    }
    const trimmed = content.trim();
    setSaving(true);
    setSaveError(null);
    setBatchProgress(null);
    try {
      // Long file uploads only -- see MIN_CHARS_FOR_SPLIT_CHECK's comment.
      // Voice/type stay single-memory unconditionally: those already carry
      // the app's "one thought at a time" framing (see the Tips row above),
      // so there's no reason to spend an extra AI call checking something
      // that's essentially never going to be a bundled document.
      let storySegments: { title: string; content: string }[] = [];
      if (source === "file" && trimmed.length >= MIN_CHARS_FOR_SPLIT_CHECK) {
        try {
          const splitRes = await fetch("/api/memories/split", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: trimmed }),
          });
          if (splitRes.ok) {
            const splitData = await splitRes.json();
            if (Array.isArray(splitData.stories)) storySegments = splitData.stories;
          }
          // A non-ok response here (rate limit, transient error, etc.) just
          // means "couldn't check -- treat it as one normal document,"
          // never something that should block the save below.
        } catch {
          // Same reasoning -- split-detection is best-effort.
        }
      }

      if (storySegments.length >= 2) {
        // This document is a genuine collection of separate stories (the
        // 35-page career-history case). Save each one as its OWN short
        // request instead of one giant request doing 20-30 sequential AI
        // calls -- see the comment on POST /api/memories/split for why
        // that used to risk a proxy timeout on a genuinely story-rich
        // document, even though the save itself had actually finished
        // server-side by the time the client gave up on it. One story
        // failing here doesn't lose the others -- each is independent.
        const savedMemories: { id: string; title: string; competencies: string | null }[] = [];
        const allMilestones: string[] = [];
        let anyMetadataGenerated = false;
        let failedCount = 0;

        for (let i = 0; i < storySegments.length; i++) {
          setBatchProgress({ current: i + 1, total: storySegments.length });
          const story = storySegments[i];
          try {
            const res = await fetch("/api/memories", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transcript: story.content, title: story.title, source: "file" }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to save");
            savedMemories.push(data.memory);
            if (Array.isArray(data.milestones)) allMilestones.push(...data.milestones);
            if (data.aiMetadataGenerated) anyMetadataGenerated = true;
          } catch {
            failedCount++;
          }
        }

        setBatchProgress(null);

        if (savedMemories.length === 0) {
          throw new Error("Couldn't save any of the stories in that document");
        }

        setSplitSaveFailedCount(failedCount);
        setSavedMilestones(allMilestones);
        setAiGenerated(anyMetadataGenerated);
        // A long uploaded document turned out to be a collection of
        // several distinct stories -- each one is now its own real memory.
        // There's no single praise/competency/resume-line/reflective-
        // question set to show (each story has its own, on its own
        // memory), so this takes the batch success branch below instead of
        // the single-memory fields.
        setSplitMemories(
          savedMemories.map((m) => ({
            id: m.id,
            title: m.title,
            competencies: safeJsonParse<string[]>(m.competencies, []),
          }))
        );
        setStage("success");
        if (allMilestones.length > 0) {
          setTimeout(() => setShowPraisePopup(true), 450);
        }
        return;
      }

      // Single-memory path -- unchanged behavior for voice, typed text,
      // short file uploads, and any file upload the split check above
      // decided (or couldn't determine) wasn't really a multi-story
      // collection.
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: trimmed, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      const milestones: string[] = Array.isArray(data.milestones) ? data.milestones : [];
      setSavedMilestones(milestones);
      setAiGenerated(!!data.aiMetadataGenerated);

      setSavedMemoryId(data.memory.id);
      const competencies = safeJsonParse<string[]>(data.memory.competencies, []);
      setSavedCompetencies(competencies);
      setSavedPraise(data.memory.praise ?? null);
      setSavedResumeLine(data.memory.resume_line ?? null);
      setSavedReflectiveQuestion(data.memory.reflective_question ?? null);
      setSavedProjectSuggestion(data.projectSuggestion ?? null);
      setStage("success");
      // Small delay so the popup lands a beat after the success screen
      // appears, instead of both flashing in at once — reads as a genuine
      // reaction to what was just recorded rather than a loading artifact.
      // Opens for EITHER competency praise or a milestone, since a
      // milestone (e.g. "10th memory recorded") can land on a memory with
      // no competency at all.
      if ((competencies.length > 0 && data.memory.praise) || milestones.length > 0) {
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
      setBatchProgress(null);
    }
  }

  // Shared between the single-memory and the multi-story split success
  // screens below -- the milestone popup only ever depends on
  // savedMilestones/savedPraise/savedCompetencies/savedResumeLine, none of
  // which are specific to which success screen is showing. Factored out
  // once rather than duplicated so the two screens can't quietly drift
  // apart on this shared piece.
  const praisePopup = showPraisePopup && (savedPraise || savedMilestones.length > 0) && (
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
          className={cn(
            "mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full",
            savedPraise ? "bg-amber-50 text-amber-500" : "bg-indigo-50 text-indigo-500"
          )}
          style={{ boxShadow: savedPraise ? "0 8px 20px rgba(245,158,11,0.2)" : "0 8px 20px rgba(99,102,241,0.2)" }}
        >
          {savedPraise ? <SparklesIcon size={26} /> : <Award size={26} />}
        </div>

        {/* Milestones -- small, earned, one-time badges. Shown above
            the competency/praise section (if any) since a milestone
            is the rarer, more special event of the two. */}
        {savedMilestones.length > 0 && (
          <div className="flex flex-col items-center gap-1.5">
            {savedMilestones.map((m) => (
              <span
                key={m}
                className="flex items-center gap-1.5 rounded-pill bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600"
              >
                <Award size={13} /> {m}
              </span>
            ))}
          </div>
        )}

        {savedPraise && (
          <>
            {savedCompetencies.length > 0 && (
              <div className={cn("flex flex-wrap justify-center gap-1.5", savedMilestones.length > 0 && "mt-3")}>
                {savedCompetencies.map((c) => (
                  <span key={c} className="rounded-pill bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    {c}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-[15px] leading-relaxed text-ink">{savedPraise}</p>
          </>
        )}

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
          style={{
            background: savedPraise
              ? "linear-gradient(135deg,#fbbf24,#f97316)"
              : "linear-gradient(135deg,#818cf8,#6366f1)",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );

  // Multi-story split success screen -- a long uploaded document (see
  // POST /api/memories/split and createMemory above) turned out to be a
  // collection of several distinct stories, each now its own real memory.
  // Deliberately a simpler screen than the single-memory one below (no
  // per-story praise popup, resume line, reflective question, or project
  // assigner -- each of those already lives on that story's own memory
  // detail page): the point here is confirming the split happened and
  // giving a fast way into each story, not repeating the full single-
  // memory ceremony N times in a row.
  if (stage === "success" && splitMemories.length > 1) {
    return (
      <div className="pb-6">
        <DarkHeader inlineTitle="Memories Saved" />
        <div className="px-5 pt-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Check size={30} />
          </div>
          <h2 className="text-lg font-semibold text-ink">Saved — split into {splitMemories.length} stories</h2>
          <p className="mt-1 text-sm text-ink-soft max-w-xs">
            {aiGenerated
              ? "That document had several separate stories, so Strivo.ai saved each one as its own memory, tagged on its own."
              : "We saved each story as its own memory. AI tagging didn't complete, but your words are safe — you can still view and search them."}
          </p>

          {splitSaveFailedCount > 0 && (
            <p className="mt-2 text-xs text-amber-600 max-w-xs">
              {splitSaveFailedCount === 1
                ? "One story in the document couldn't be saved — you can try uploading it again."
                : `${splitSaveFailedCount} stories in the document couldn't be saved — you can try uploading it again.`}
            </p>
          )}

          <div className="mt-6 w-full space-y-2.5 text-left">
            {splitMemories.map((m) => (
              <button
                key={m.id}
                onClick={() => router.push(`/memories/${m.id}`)}
                className="flex w-full items-center gap-3 rounded-[14px] border border-[#ece5f5] bg-surface p-3.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">{m.title}</p>
                  {m.competencies.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.competencies.map((c) => (
                        <span key={c} className="rounded-pill bg-[#f2effa] px-2 py-0.5 text-[10px] font-semibold text-[#8b5cf6]">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ArrowRight size={15} className="shrink-0 text-[#cec7dd]" />
              </button>
            ))}
          </div>

          <div className="mt-8 w-full space-y-3">
            <Button variant="secondary" className="w-full" onClick={startOver}>
              <RotateCcw size={16} /> Capture Another
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => router.push("/home")}>
              <HomeIcon size={16} /> Go Home
            </Button>
          </div>
        </div>

        {praisePopup}
      </div>
    );
  }

  if (stage === "success") {
    // Seeded by the memory id so the phrasing is stable for this memory
    // (no flicker on re-render) but varies from save to save -- see
    // SAVED_HEADINGS etc. above.
    const variantSeed = savedMemoryId ?? "";
    return (
      <div className="pb-6">
        <DarkHeader inlineTitle="Memory Saved" />
        <div className="px-5 pt-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Check size={30} />
          </div>
          <h2 className="text-lg font-semibold text-ink">{pickVariant(variantSeed, SAVED_HEADINGS)}</h2>
          <p className="mt-1 text-sm text-ink-soft max-w-xs">
            {aiGenerated
              ? pickVariant(variantSeed, AI_GENERATED_SUBTEXT)
              : "We saved your transcript. AI summary generation didn't complete, but your words are safe — you can still view and search this memory."}
          </p>

          {/* Optional, skippable follow-up question -- the "someone is
              actually listening" layer. Answering folds the answer into
              the transcript itself (see /api/memories/[id]/reflect), so a
              thin memory can become genuinely richer, not just decorated.
              Inline rather than a popup since it asks for input instead of
              just delivering a reaction. */}
          {savedReflectiveQuestion && (
            <div className="mt-5 w-full rounded-[14px] border border-[#ece5f5] bg-[#f9f8fc] p-4 text-left">
              {reflectionOutcome ? (
                <p className="flex items-center gap-1.5 text-sm text-ink-soft">
                  <CheckCircle2 size={15} className="shrink-0 text-[#8b5cf6]" />
                  {reflectionOutcome === "answered"
                    ? "Added to your memory — thanks for the extra detail."
                    : "No problem — you can always add more from the memory later."}
                </p>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-[#3c3650]">
                    <MessageCircleQuestion size={15} className="shrink-0 text-[#8b5cf6]" />
                    {pickVariant(variantSeed, ONE_MORE_THING_LABELS)}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">{savedReflectiveQuestion}</p>
                  <textarea
                    value={reflectionText}
                    onChange={(e) => setReflectionText(e.target.value)}
                    rows={2}
                    placeholder="Totally optional…"
                    className="mt-2.5 w-full rounded-[10px] border border-[#ece5f5] bg-surface p-2.5 text-sm text-ink outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20 resize-none"
                  />
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => setReflectionOutcome("skipped")}
                      disabled={reflectionSaving}
                      className="flex-1 rounded-pill border border-[#ece5f5] py-2 text-xs font-semibold text-ink-soft disabled:opacity-50"
                    >
                      Skip
                    </button>
                    <button
                      onClick={submitReflection}
                      disabled={!reflectionText.trim() || reflectionSaving}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2 text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
                    >
                      {reflectionSaving && <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" />}
                      Add this
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI's guess at which project this belongs to (see
              savedProjectSuggestion above) -- "AI proposes, human confirms":
              nothing here has assigned a project yet, this is just a
              pre-filled starting point. Placed after the reflective-question
              card and before the action buttons, its own natural next step
              in the same "one more thing before you move on" flow. */}
          {savedMemoryId && (
            <div className="mt-5 w-full text-left">
              <ProjectAssigner
                memoryId={savedMemoryId}
                currentProjectId={assignedProjectId}
                currentProjectName={assignedProjectName}
                suggestion={savedProjectSuggestion}
                onChange={(projectId, projectName) => {
                  setAssignedProjectId(projectId);
                  setAssignedProjectName(projectName);
                }}
              />
            </div>
          )}

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

        {praisePopup}
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
          <div className="flex items-center gap-3.5">
            <NotificationBell />
            <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
              <Avatar firstName={user?.firstName} lastName={user?.lastName} size={32} />
            </button>
          </div>
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
                  exactly what was captured before they hit Create Memory.
                  Editable once transcription finishes (not while actively
                  listening/transcribing) — speech-to-text regularly misses
                  or mishears a word, and until this was editable the only
                  fix was re-recording the whole memory from scratch. Typing
                  here calls speech.setFinalText directly, the same state
                  Create Memory reads from, so the edit is what actually
                  gets saved. */}
              {(content.trim() || speech.transcribing) && (
                <div className="w-full mt-5 rounded-[13px] border border-[#ece5f5] bg-surface p-4 text-left">
                  {speech.transcribing ? (
                    <div className="flex items-center gap-2">
                      <Spinner className="h-4 w-4 border-brand-primary-soft border-t-brand-primary" />
                      <p className="text-sm font-medium text-[#8a82a8]">Transcribing your recording…</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#a8a2bd] uppercase tracking-wide">Transcript</p>
                        <p className="text-[11px] text-[#a8a2bd]">Tap to edit</p>
                      </div>
                      <textarea
                        value={content}
                        onChange={(e) => speech.setFinalText(e.target.value)}
                        disabled={speech.listening}
                        rows={4}
                        placeholder="Your transcript will appear here…"
                        className="w-full resize-none rounded-[10px] border border-transparent bg-transparent p-0 text-sm text-ink outline-none focus:border-[#ece5f5] focus:bg-[#faf9fc] focus:p-2.5 disabled:opacity-60"
                      />
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

              {/* Optional context about the document -- purely a courtesy
                  to the AI (and to future-you reading the transcript back),
                  never required. Only shown once there's actually a file to
                  attach it to. */}
              {uploadedFileName && uploadText && !uploadError && (
                <div className="w-full mt-3 text-left">
                  <label className="text-[11px] font-medium text-[#8a82a8]" htmlFor="upload-note">
                    Add a note about this document <span className="text-[#c2bcd4]">(optional)</span>
                  </label>
                  <textarea
                    id="upload-note"
                    value={uploadNote}
                    onChange={(e) => setUploadNote(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="e.g. This is my career history before my MBA — includes reviews and project stories."
                    className="mt-1.5 w-full resize-none rounded-[10px] border border-[#ece5f5] bg-surface p-2.5 text-sm text-ink outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
                  />
                </div>
              )}

              <button
                onClick={pickFile}
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
            {batchProgress ? `Saving story ${batchProgress.current} of ${batchProgress.total}…` : "Create Memory"}
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
