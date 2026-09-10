"use client";

import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { CheckCheck, Copy, Check, Volume2, VolumeX } from "lucide-react";
import { format } from "date-fns";
import { LogoMark } from "@/components/Logo";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

// Lightweight inline formatter — just handles **bold**, since that's what
// the AI's responses actually use. Not a full markdown parser on purpose:
// keeps the chat bubble simple and avoids pulling in a markdown dependency
// for one formatting case.
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// Renders AI message text with basic bold + numbered/bulleted list support,
// since the model's replies commonly use both and raw asterisks/dashes look
// broken in a chat bubble otherwise.
function AiMessageContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === "") return null;

        const numbered = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numbered) {
          return (
            <div key={i} className="flex gap-1.5">
              <span className="shrink-0 text-ink-soft">{numbered[1]}.</span>
              <span>{renderInline(numbered[2])}</span>
            </div>
          );
        }

        const bulleted = trimmed.match(/^[-*]\s+(.*)/);
        if (bulleted) {
          return (
            <div key={i} className="flex gap-1.5">
              <span className="shrink-0 text-ink-soft">•</span>
              <span>{renderInline(bulleted[1])}</span>
            </div>
          );
        }

        return <div key={i}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

// Strips the AI reply down to plain, speakable text -- mirrors what
// AiMessageContent above already does visually (bold markers, list
// markers), but for the ear instead of the eye. Without this,
// speechSynthesis reads "**bold**" and "1. " literally ("asterisk asterisk
// bold asterisk asterisk").
function toPlainText(content: string): string {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/^\d+\.\s+/, "")
        .replace(/^[-*]\s+/, "")
    )
    .join(". ");
}

// Copy + read-aloud controls under a completed AI reply -- same pattern as
// ChatGPT/Claude's own chat UIs. Copy reuses the exact
// navigator.clipboard.writeText + icon-swap pattern already used in
// MemoryDetailClient/record/first-record.
//
// "Read aloud" is a hybrid: it always tries the browser's free built-in Web
// Speech API (speechSynthesis) first, so the common case costs nothing and
// starts instantly. Only when that silently fails -- a well-known bug where
// some Android WebView builds expose window.speechSynthesis but never
// actually produce sound, with no error event and onstart never firing --
// does it fall back to a paid OpenAI TTS call (POST /api/chats/speak),
// which is slower and costs money per use but works everywhere. This keeps
// the vast majority of reads free while still guaranteeing every device can
// hear a reply. Both paths feature-detect / fail gracefully rather than
// assuming availability.
function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // True only while fetching the paid fallback's audio -- separate from
  // `speaking` so the button can show a distinct "Loading..." state instead
  // of looking like it's already playing.
  const [loadingFallback, setLoadingFallback] = useState(false);
  // True for a few seconds after BOTH the free voice and the paid fallback
  // have failed -- see fetchFallback below.
  const [unsupported, setUnsupported] = useState(false);
  const speakingRef = useRef(false);
  // Mirrored via an effect rather than written directly during render --
  // writing a ref's .current in the render body itself is a react-hooks
  // lint error (refs are for event handlers/effects, not render), even
  // though the actual risk it guards against (stale reads in unrelated
  // components) doesn't apply to a ref only ever read in this same
  // component's own unmount cleanup below.
  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The <audio> element currently playing the paid fallback's mp3, if any.
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  // Caches this message's generated mp3 as an object URL once fetched, so a
  // second tap (stop then listen again) replays it instantly instead of
  // re-billing OpenAI for audio that already exists.
  const fallbackUrlRef = useRef<string | null>(null);

  function clearWatchdog() {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }

  // If this bubble is mid-speech (either path) and gets unmounted
  // (navigating away from the chat), stop audio from continuing to play
  // over whatever's on screen next, and release the cached blob URL. Reads
  // speakingRef (not the `speaking` state directly) so the cleanup always
  // sees the latest value rather than the one from whichever render first
  // registered this effect.
  useEffect(() => {
    return () => {
      clearWatchdog();
      if (speakingRef.current) {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        fallbackAudioRef.current?.pause();
      }
      if (fallbackUrlRef.current) {
        URL.revokeObjectURL(fallbackUrlRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable in some contexts (older WebViews,
      // non-secure origins) -- fail silently for a nice-to-have action
      // rather than surface an error, same as the other three call sites.
    }
  }

  function flashUnsupported() {
    setSpeaking(false);
    setLoadingFallback(false);
    setUnsupported(true);
    setTimeout(() => setUnsupported(false), 3000);
  }

  function stopAll() {
    clearWatchdog();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    fallbackAudioRef.current?.pause();
    fallbackAudioRef.current = null;
    setSpeaking(false);
    setLoadingFallback(false);
  }

  function playFallbackUrl(url: string) {
    const audio = new Audio(url);
    fallbackAudioRef.current = audio;
    audio.onended = () => {
      setSpeaking(false);
      if (fallbackAudioRef.current === audio) fallbackAudioRef.current = null;
    };
    audio
      .play()
      .then(() => {
        setLoadingFallback(false);
        setSpeaking(true);
      })
      .catch(() => {
        // Autoplay/decoding can still fail in rare cases -- both the free
        // and paid paths are now exhausted, so this is a genuine dead end.
        flashUnsupported();
      });
  }

  // Paid fallback: only reached when the free browser voice above didn't
  // actually produce sound. Reuses a cached blob URL when this message's
  // audio was already generated once (e.g. the user tapped Stop then
  // Listen again), so repeat plays never re-bill OpenAI.
  async function fetchFallback() {
    if (fallbackUrlRef.current) {
      playFallbackUrl(fallbackUrlRef.current);
      return;
    }
    setLoadingFallback(true);
    try {
      const res = await fetch("/api/chats/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: toPlainText(content) }),
      });
      if (!res.ok) throw new Error("tts request failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      fallbackUrlRef.current = url;
      playFallbackUrl(url);
    } catch {
      setLoadingFallback(false);
      flashUnsupported();
    }
  }

  function handleSpeak() {
    if (speaking || loadingFallback) {
      stopAll();
      return;
    }
    // No Web Speech API at all (rather than "has it but it's broken") --
    // skip straight to the paid fallback instead of waiting out the
    // watchdog for nothing.
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      fetchFallback();
      return;
    }
    // Cancel anything already queued -- e.g. tapping Listen on a different
    // reply while one is still playing -- so only one bubble ever talks at
    // a time instead of overlapping.
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(toPlainText(content));
    utterance.onstart = () => clearWatchdog();
    utterance.onend = () => {
      clearWatchdog();
      setSpeaking(false);
    };
    utterance.onerror = () => {
      clearWatchdog();
      fetchFallback();
    };
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);

    // A lot of Android WebView builds expose window.speechSynthesis but
    // silently do nothing when asked to speak -- no sound, no onerror,
    // onstart never fires (the underlying getVoices() bug is well-known;
    // this is its practical symptom). Without this watchdog the button
    // would stay stuck on "Stop" forever with nothing audible playing. If
    // speech genuinely hasn't started within 1.2s, treat it as one of those
    // silent failures and fall back to the paid OpenAI TTS path instead.
    watchdogRef.current = setTimeout(() => {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      fetchFallback();
    }, 1200);
  }

  return (
    <div className="mt-2 flex items-center gap-3 border-t border-border/60 pt-1.5">
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink-soft"
        aria-label="Copy response"
      >
        {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        onClick={handleSpeak}
        className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink-soft"
        aria-label={speaking ? "Stop reading aloud" : "Read aloud"}
      >
        {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
        {unsupported ? "Not supported here" : loadingFallback ? "Loading…" : speaking ? "Stop" : "Listen"}
      </button>
    </div>
  );
}

export function ChatBubble({
  sender,
  content,
  status,
  createdAt,
}: {
  sender: "user" | "ai";
  content: string;
  status?: "sent" | "error" | "pending";
  createdAt?: string;
}) {
  const time = createdAt ? format(new Date(createdAt), "h:mm a") : null;

  if (sender === "user") {
    return (
      <div className="flex flex-col items-end">
        {time && (
          <div className="mb-1 flex items-center gap-1.5 pr-1 text-xs text-ink-faint">
            <span className="font-medium text-ink-soft">You</span>
            <span>{time}</span>
          </div>
        )}
        <div
          className={cn(
            "max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-white whitespace-pre-wrap flex items-end gap-1.5",
            status === "pending" && "opacity-60"
          )}
          style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
        >
          <span>{content}</span>
          {status === "sent" && <CheckCheck size={14} className="mb-0.5 shrink-0 text-white/80" />}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start">
      {time && (
        <div className="mb-1 flex items-center gap-1.5 pl-9 text-xs text-ink-faint">
          <span className="font-medium text-ink-soft">{APP_NAME}</span>
          <span>{time}</span>
        </div>
      )}
      {/* No width cap on this row (unlike the user bubble above) -- AI
          replies are often multi-sentence/multi-line, and capping this row
          at e.g. 85% on top of the avatar column already eating space left
          a genuinely narrow text column (short lines wrapping after just a
          couple of words, unlike ChatGPT/Claude's own chat UIs which let
          the model's reply use the full available width). `min-w-0` on the
          bubble itself is required alongside `flex-1` for a flex child to
          actually wrap long text instead of overflowing it. */}
      <div className="flex gap-2 w-full">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface border border-border mt-0.5">
          <LogoMark size={16} />
        </div>
        <div
          className={cn(
            "flex-1 min-w-0 rounded-2xl rounded-tl-sm bg-surface border border-border px-3.5 py-2.5 text-ink",
            status === "error" && "border-red-200 bg-red-50 text-red-700"
          )}
          style={status !== "error" ? { boxShadow: "var(--shadow-card)" } : undefined}
        >
          <AiMessageContent content={content} />
          {status !== "pending" && <MessageActions content={content} />}
        </div>
      </div>
    </div>
  );
}
