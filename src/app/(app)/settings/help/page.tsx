"use client";

import { useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";

export default function HelpSupportPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Add a message before sending.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim() || undefined, message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send your message.");
      setSent(true);
      setSubject("");
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="pb-8">
      <DarkHeader back inlineTitle="Help & Support" inlineSubtitle="We'll get back to you by email" />

      <div className="px-5 pt-5 space-y-4">
        {sent ? (
          <Card className="flex flex-col items-center text-center py-8 border-[#f0ecf7]">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
              <CheckCircle2 size={24} />
            </div>
            <p className="font-semibold text-ink">Message sent</p>
            <p className="mt-1 text-sm text-ink-soft max-w-xs">
              Thanks for reaching out — we&apos;ll follow up by email if we need more details.
            </p>
            <Button variant="secondary" className="mt-5" onClick={() => setSent(false)}>
              Send another message
            </Button>
          </Card>
        ) : (
          <Card className="border-[#f0ecf7]">
            {error && (
              <div className="mb-4">
                <ErrorBanner message={error} />
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <TextField
                label="Subject (optional)"
                placeholder="What's this about?"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  required
                  placeholder="Tell us what's going on, what you expected, and any details that would help."
                  className="w-full rounded-input border border-border bg-surface p-3.5 text-ink placeholder:text-ink-faint outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20 resize-none"
                />
              </div>
              <Button type="submit" className="w-full" loading={sending}>
                <Mail size={16} /> Send message
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
