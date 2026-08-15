"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// This used to wrap the browser's built-in Web Speech API (live captions
// while you talk). That engine is free but its accuracy on mixed-language
// speech (e.g. Hindi/English) is poor, and Chrome silently ends/restarts
// its recognition session periodically even mid-recording — both were
// reported as real problems by testers. This now records real audio with
// MediaRecorder and sends it to the server for transcription with OpenAI's
// Whisper model (the same category of model ChatGPT/Claude's voice input
// uses), which is far more accurate and doesn't have the browser engine's
// stop-on-its-own flakiness. The one UX trade-off: no live captions while
// speaking — the transcript appears a few seconds after you stop, same as
// sending a voice note. The hook keeps the same name/shape (state,
// listening, fullText, error, supported, start, stop, reset) so the Record
// and Chat screens didn't need to change how they consume it.

export type SpeechState = "idle" | "listening" | "transcribing" | "error" | "unsupported";

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export function useSpeechRecognition() {
  const [state, setState] = useState<SpeechState>("idle");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finalTextRef = useRef("");

  useEffect(() => {
    if (!isSupported()) queueMicrotask(() => setState("unsupported"));
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const transcribeChunks = useCallback(async (mimeType: string) => {
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    // A couple of KB is essentially silence/a mis-tap, not worth a round
    // trip to the transcription API.
    if (blob.size < 2000) {
      setState("idle");
      return;
    }
    setState("transcribing");
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/memories/transcribe", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Transcription failed");
      const text = typeof data.text === "string" ? data.text.trim() : "";
      if (text) {
        finalTextRef.current = `${finalTextRef.current} ${text}`.trim();
        setFinalText(finalTextRef.current);
      }
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't transcribe that recording. Please try again.");
      setState("error");
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!isSupported()) {
      setState("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        releaseStream();
        transcribeChunks(recorder.mimeType);
      };
      recorderRef.current = recorder;
      recorder.start();
      setState("listening");
    } catch (e) {
      releaseStream();
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was denied."
          : "Couldn't access the microphone. Please try again."
      );
      setState("error");
    }
  }, [releaseStream, transcribeChunks]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // onstop above kicks off transcription and flips state
    } else {
      releaseStream();
      setState("idle");
    }
  }, [releaseStream]);

  const reset = useCallback(() => {
    finalTextRef.current = "";
    setFinalText("");
    setError(null);
  }, []);

  return {
    state,
    supported: state !== "unsupported",
    listening: state === "listening",
    transcribing: state === "transcribing",
    finalText,
    interimText: "", // kept for compatibility; there's no live interim text anymore
    fullText: finalText,
    error,
    start,
    stop,
    reset,
    setFinalText,
  };
}
