"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import * as Sentry from "@sentry/nextjs";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { Capacitor } from "@capacitor/core";
import { FileUp, FileText, Trash2, CheckCircle2, Sparkles, MessageCircle, Target } from "lucide-react";
import { markExpectedResume } from "@/lib/nativePlatform";
import { DarkHeader } from "@/components/DarkHeader";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";

type ResumeStatus = { hasResume: boolean; filename: string | null; uploadedAt: string | null };

// What actually happens with an uploaded resume behind the scenes -- shown
// as a "why this helps" list (same icon-chip/title/description rhythm as
// Home's Quick Actions) so this page reads as a real feature with a payoff,
// not just a bare upload control sitting under a paragraph of text.
const RESUME_BENEFITS = [
  {
    icon: MessageCircle,
    title: "Sharper chat answers",
    description: "Strivo already knows your background, so it doesn't ask you to repeat it.",
  },
  {
    icon: FileText,
    title: "Stronger resume lines",
    description: "New resume lines build on what's already there instead of starting blank.",
  },
  {
    icon: Target,
    title: "Faster interview prep",
    description: "Your real experience shows up in answers without digging it back up.",
  },
] as const;

// Lets someone upload (or replace/remove) a resume PDF at any time, not just
// once during /first-record onboarding -- the same underlying pipeline
// (extract via /api/memories/extract, then save via /api/profile/resume) is
// used from both places. Stored as background context on the user row (see
// resume_text's comment in repo/users.ts), not as a Memory -- it feeds chat
// answers and future memory generation without cluttering the Memories list
// with one giant resume-dump entry.
//
// Styled to match /first-record and /record's capture cards (gradient panel,
// glow-shadowed icon circle, gradient pill buttons) rather than a flat
// settings-list row -- this is a moment the user should feel good about, not
// a form field to fill in.
export default function ResumeSettingsPage() {
  const [status, setStatus] = useState<ResumeStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile/resume")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStatus)
      .catch(() => setLoadError(true));
  }, []);

  // Uses @capawesome/capacitor-file-picker instead of a raw
  // <input type="file"> -- that old approach (plus a hidden input + ref
  // click) was silently dropping selected files app-wide on Android: the
  // system picker opened, a file got chosen, and then nothing happened, no
  // error, page just sat there looking like nothing was uploaded. This
  // turned out to affect every file-upload flow in the app (Record's
  // Upload tab too), not just Resume -- so this plugin replaces the flaky
  // WebView file-chooser bridge everywhere rather than patching around it.
  async function pickFile() {
    setUploading(true);
    setUploadError(null);
    setJustSaved(false);
    try {
      // Opening the native picker backgrounds the app, which fires
      // Capacitor's "resume" event when it returns -- see
      // lib/nativePlatform.ts for why this has to be marked as expected
      // (otherwise Providers.tsx's reload-on-resume wipes this whole
      // in-flight pick before it can finish, which was the real cause of
      // the "picker opens, then reverts" bug).
      markExpectedResume();
      const result = await FilePicker.pickFiles({ types: ["application/pdf"], limit: 1 });
      const picked = result.files[0];
      if (!picked) {
        setUploading(false);
        return; // user dismissed the picker without choosing a file
      }

      // On web the plugin returns a Blob directly; on Android/iOS it
      // returns a native file path that has to be fetched as a blob via
      // Capacitor's convertFileSrc().
      let blob: Blob;
      if (picked.blob) {
        blob = picked.blob;
      } else {
        const fileRes = await fetch(Capacitor.convertFileSrc(picked.path!));
        blob = await fileRes.blob();
      }

      const formData = new FormData();
      formData.append("file", blob, picked.name);
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

      setStatus({ hasResume: true, filename: saveData.filename, uploadedAt: saveData.uploadedAt });
      setJustSaved(true);
    } catch (e) {
      // Reported live (unlike most catch blocks in this app) because this
      // exact flow has failed silently in the field before with no visible
      // error banner -- if it happens again we need a real stack trace
      // instead of guessing, and this is cheap insurance either way.
      Sentry.captureException(e, { tags: { flow: "resume-upload", surface: "settings" } });
      setUploadError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch("/api/profile/resume", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setStatus({ hasResume: false, filename: null, uploadedAt: null });
      setJustSaved(false);
    } catch {
      setUploadError("Couldn't remove your resume. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="pb-8">
      <DarkHeader back inlineTitle="Resume" />
      <div className="px-5 pt-5">
        <p className="text-sm text-ink-soft">
          Upload a resume so Strivo already knows your background. It&apos;s never shown as a memory of its own —
          Strivo just uses it quietly to make chat answers and resume lines sharper.
        </p>

        {loadError && (
          <div className="mt-4">
            <ErrorBanner message="Couldn't load your resume status." />
          </div>
        )}

        {!status && !loadError && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {status && (
          <div className="relative mt-5 overflow-hidden rounded-[18px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-6">
            {/* Ambient glow blobs -- same device the dark header and Home use
                (see DarkHeader.tsx / HomeClient.tsx's DARK header), scaled
                down and softened for a light card instead of a dark one, so
                this page doesn't feel flat next to them. */}
            <div
              className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[#c4b5fd]/40 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-[#93c5fd]/30 blur-3xl"
              aria-hidden="true"
            />

            {status.hasResume ? (
              <div className="relative flex flex-col items-center text-center">
                <div
                  className="relative flex h-16 w-16 items-center justify-center rounded-full bg-surface text-[#8b5cf6]"
                  style={{ boxShadow: "0 12px 32px rgba(139,92,246,0.25)" }}
                >
                  <FileText size={26} />
                  {justSaved && (
                    <span
                      className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white"
                      style={{ boxShadow: "0 4px 10px rgba(34,197,94,0.4)" }}
                    >
                      <CheckCircle2 size={14} />
                    </span>
                  )}
                </div>

                <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-green-600">
                  <Sparkles size={14} /> {justSaved ? "Saved — this version is live" : "Resume on file"}
                </p>
                <p className="mt-1 truncate text-sm font-medium text-[#3c3650] max-w-full px-2">{status.filename}</p>
                {status.uploadedAt && (
                  <p className="mt-0.5 text-xs text-[#8a82a8]">
                    Uploaded {formatDistanceToNow(new Date(status.uploadedAt), { addSuffix: true })}
                  </p>
                )}

                {/* Quick reminder of what this file is actually doing for
                    them, right where they can see it -- otherwise a resume
                    that's just "on file" can feel like it vanished into a
                    settings screen and did nothing. */}
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  <span className="flex items-center gap-1 rounded-pill bg-surface/70 px-2.5 py-1 text-[10.5px] font-semibold text-[#6d5fa8]">
                    <MessageCircle size={11} /> Chat answers
                  </span>
                  <span className="flex items-center gap-1 rounded-pill bg-surface/70 px-2.5 py-1 text-[10.5px] font-semibold text-[#6d5fa8]">
                    <Sparkles size={11} /> Resume lines
                  </span>
                </div>

                {uploadError && (
                  <div className="w-full mt-4">
                    <ErrorBanner message={uploadError} />
                  </div>
                )}

                <div className="mt-5 flex w-full gap-2.5">
                  <button
                    onClick={pickFile}
                    disabled={uploading}
                    className="flex flex-1 items-center justify-center gap-2 rounded-pill py-3 text-sm font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
                  >
                    {uploading ? <Spinner className="border-white/40 border-t-white h-4 w-4" /> : <FileUp size={16} />}
                    {uploading ? "Uploading…" : "Upload new version"}
                  </button>
                  <button
                    onClick={handleRemove}
                    disabled={removing}
                    className="flex items-center justify-center gap-2 rounded-pill border border-[#ece5f5] bg-surface px-4 py-3 text-sm font-semibold text-[#8a82a8] disabled:opacity-60"
                  >
                    {removing ? <Spinner className="h-4 w-4" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative flex flex-col items-center text-center">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-[#8b5cf6]"
                  style={{ boxShadow: "0 12px 32px rgba(139,92,246,0.2)" }}
                >
                  <FileUp size={26} />
                </div>
                <p className="mt-4 text-base font-semibold text-[#3c3650]">No resume on file yet</p>
                <p className="mt-1 text-xs text-[#8a82a8] max-w-xs">
                  Upload a PDF and Strivo will quietly use it as background context in chats and memories.
                </p>

                {uploadError && (
                  <div className="w-full mt-4">
                    <ErrorBanner message={uploadError} />
                  </div>
                )}

                <button
                  onClick={pickFile}
                  disabled={uploading}
                  className={cn(
                    "mt-5 flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white disabled:opacity-60"
                  )}
                  style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
                >
                  {uploading ? <Spinner className="border-white/40 border-t-white h-4 w-4" /> : <FileUp size={16} />}
                  {uploading ? "Uploading…" : "Upload PDF"}
                </button>
              </div>
            )}
          </div>
        )}

        <p className="mt-3 text-center text-[11px] text-ink-faint">PDF only, up to 2MB.</p>

        {/* Why this helps -- same accent-bar + icon-chip rhythm as Home's
            "Continue"/Quick Actions sections, so this page reads as a real
            feature with a payoff rather than a bare upload control. Shown
            regardless of upload state -- it's the pitch for someone who
            hasn't uploaded yet, and the receipt for someone who already
            has. */}
        <div className="mt-7">
          <div
            className="mb-4 h-[3px] w-14 rounded-full"
            style={{ background: "linear-gradient(90deg,#a78bfa,#60a5fa)" }}
          />
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Why this helps</p>
          <div>
            {RESUME_BENEFITS.map((benefit) => (
              <div key={benefit.title} className="flex items-start gap-3 border-t border-[#f0ecf7] py-3 last:border-b">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#f2effa] text-[#8b5cf6]">
                  <benefit.icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{benefit.title}</p>
                  <p className="text-[11px] text-ink-faint">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
