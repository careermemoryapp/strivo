"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the Web Speech API, which isn't in TS's default DOM lib.
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { isFinal: boolean; [altIndex: number]: { transcript: string } };
  };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export type SpeechState = "idle" | "listening" | "error" | "unsupported";

export function useSpeechRecognition() {
  const [state, setState] = useState<SpeechState>("idle");
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTextRef = useRef("");
  // Tracks whether the user actually wants the mic on right now, separate
  // from the engine's own "listening" state — lets onend tell the
  // difference between "user tapped stop" and "the browser silently ended
  // the session on its own" (which Chrome does periodically even in
  // continuous mode, roughly every 60s).
  const shouldBeListeningRef = useRef(false);
  // Final text already counted from the *current* internal engine segment.
  // When the engine restarts that segment behind the scenes, results reset
  // to a shorter list starting over — without tracking this we'd re-append
  // already-committed text and produce duplicated/garbled phrases.
  const segmentFinalTextRef = useRef("");

  useEffect(() => {
    const Ctor =
      typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
    if (!Ctor) {
      queueMicrotask(() => setState("unsupported"));
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      // Recompute the full final/interim text from *all* current results
      // each time, rather than trusting resultIndex to only point at new
      // ones — the engine's internal segment can reset mid-session (see
      // segmentFinalTextRef comment above), which makes resultIndex point
      // at stale positions and would otherwise re-append already-seen text.
      let finalInSegment = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalInSegment = `${finalInSegment} ${text}`.trim();
        } else {
          interim += text;
        }
      }

      // Segment reset detected (this event's finalized text is shorter
      // than what we'd already counted) — start diffing from scratch
      // against this new segment instead of the old one.
      if (finalInSegment.length < segmentFinalTextRef.current.length) {
        segmentFinalTextRef.current = "";
      }

      if (finalInSegment.length > segmentFinalTextRef.current.length) {
        const newText = finalInSegment.slice(segmentFinalTextRef.current.length).trim();
        if (newText) {
          finalTextRef.current = `${finalTextRef.current} ${newText}`.trim();
          setFinalText(finalTextRef.current);
        }
        segmentFinalTextRef.current = finalInSegment;
      }

      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      const fatal = event.error === "not-allowed" || event.error === "service-not-allowed";
      // Permission errors won't fix themselves by retrying — don't let
      // onend's auto-restart (below) keep hammering start() on a mic the
      // user was never granted.
      if (fatal) shouldBeListeningRef.current = false;
      setError(fatal ? "Microphone access was denied." : "Speech recognition failed.");
      setState("error");
    };

    recognition.onend = () => {
      // The browser can end the recognition session on its own during a
      // long continuous recording without us ever calling stop() — if the
      // user hasn't asked to stop, restart immediately so it feels like one
      // continuous recording instead of the mic silently going dead.
      if (shouldBeListeningRef.current) {
        segmentFinalTextRef.current = "";
        try {
          recognition.start();
          return;
        } catch {
          // If the immediate restart itself throws, fall through to idle
          // below rather than leaving the UI stuck showing "Listening…".
        }
      }
      setState((s) => (s === "listening" ? "idle" : s));
    };

    recognitionRef.current = recognition;
  }, []);

  const start = useCallback(() => {
    setError(null);
    if (!recognitionRef.current) {
      setState("unsupported");
      return;
    }
    shouldBeListeningRef.current = true;
    segmentFinalTextRef.current = "";
    try {
      recognitionRef.current.start();
      setState("listening");
    } catch {
      // start() throws if already started — ignore.
    }
  }, []);

  const stop = useCallback(() => {
    shouldBeListeningRef.current = false;
    recognitionRef.current?.stop();
    setState("idle");
  }, []);

  const reset = useCallback(() => {
    finalTextRef.current = "";
    segmentFinalTextRef.current = "";
    setFinalText("");
    setInterimText("");
    setError(null);
  }, []);

  return {
    state,
    supported: state !== "unsupported",
    listening: state === "listening",
    finalText,
    interimText,
    fullText: `${finalText} ${interimText}`.trim(),
    error,
    start,
    stop,
    reset,
    setFinalText,
  };
}
