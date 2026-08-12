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
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalTextRef.current = `${finalTextRef.current} ${text}`.trim();
          setFinalText(finalTextRef.current);
        } else {
          interim += text;
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was denied."
          : "Speech recognition failed."
      );
      setState("error");
    };

    recognition.onend = () => {
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
    try {
      recognitionRef.current.start();
      setState("listening");
    } catch {
      // start() throws if already started — ignore.
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setState("idle");
  }, []);

  const reset = useCallback(() => {
    finalTextRef.current = "";
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
