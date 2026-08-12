"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSubmitted(true);
    setDevLink(data.devResetLink ?? null);
  }

  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand text-white">
          <KeyRound size={22} />
        </div>
        <h1 className="text-2xl font-semibold text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-soft">Enter your email and we&apos;ll help you reset it.</p>
      </div>

      {submitted ? (
        <div className="space-y-4">
          <div className="rounded-card border border-border bg-surface p-4 text-sm text-ink-soft">
            If an account exists for <span className="font-medium text-ink">{email}</span>, a reset link has been created.
          </div>
          {devLink ? (
            <div className="rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-medium">Development mode notice</p>
              <p className="mt-1">
                This MVP doesn&apos;t have an email service connected yet, so here&apos;s your reset link directly:
              </p>
              <Link href={devLink} className="mt-2 inline-block break-all font-medium text-brand-primary underline">
                {devLink}
              </Link>
            </div>
          ) : null}
          <Link href="/login" className="block text-center text-sm font-medium text-brand-primary">
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <ErrorBanner message={error} />}
          <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full" loading={loading}>
            Send Reset Link
          </Button>
          <Link href="/login" className="block text-center text-sm font-medium text-ink-soft">
            Back to login
          </Link>
        </form>
      )}
    </div>
  );
}
