"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileUp, FileText, Trash2, CheckCircle2 } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";

type ResumeStatus = { hasResume: boolean; filename: string | null; uploadedAt: string | null };

// Lets someone upload (or replace/remove) a resume PDF at any time, not just
// once during /first-record onboarding -- the same underlying pipeline
// (extract via /api/memories/extract, then save via /api/profile/resume) is
// used from both places. Stored as background context on the user row (see
// resume_text's comment in repo/users.ts), not as a Memory -- it feeds chat
// answers and future memory generation without cluttering the Memories list
// with one giant resume-dump entry.
export default function ResumeSettingsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setJustSaved(false);
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

      setStatus({ hasResume: true, filename: saveData.filename, uploadedAt: saveData.uploadedAt });
      setJustSaved(true);
    } catch (e) {
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

        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />

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
          <div className="mt-5 rounded-[16px] border border-[#f0ecf7] bg-surface p-4">
            {status.hasResume ? (
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2effa] text-[#8b5cf6]">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{status.filename}</p>
                  {status.uploadedAt && (
                    <p className="mt-0.5 text-xs text-ink-faint">
                      Uploaded {formatDistanceToNow(new Date(status.uploadedAt), { addSuffix: true })}
                    </p>
                  )}
                  {justSaved && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-green-600">
                      <CheckCircle2 size={13} /> Saved
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f2effa] text-[#8b5cf6]">
                  <FileUp size={22} />
                </div>
                <p className="mt-3 text-sm font-semibold text-ink">No resume on file yet</p>
                <p className="mt-1 text-xs text-ink-faint max-w-xs">Upload a PDF to get started.</p>
              </div>
            )}

            {uploadError && (
              <div className="mt-4">
                <ErrorBanner message={uploadError} />
              </div>
            )}

            <div className="mt-4 flex gap-2.5">
              <Button
                variant={status.hasResume ? "secondary" : "primary"}
                className="flex-1"
                onClick={() => fileInputRef.current?.click()}
                loading={uploading}
              >
                <FileUp size={16} /> {status.hasResume ? "Replace" : "Upload PDF"}
              </Button>
              {status.hasResume && (
                <Button variant="ghost" className="flex-1" onClick={handleRemove} loading={removing}>
                  <Trash2 size={16} /> Remove
                </Button>
              )}
            </div>
          </div>
        )}

        <p className="mt-3 text-[11px] text-ink-faint">PDF only, up to 2MB.</p>
      </div>
    </div>
  );
}
