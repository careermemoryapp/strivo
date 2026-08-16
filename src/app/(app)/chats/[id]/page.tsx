"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, MoreVertical, ArrowUp, Sparkles, Trash2, Mic, Square } from "lucide-react";
import { ChatBubble } from "@/components/ChatBubble";
import { LogoMark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import type { Chat } from "@/lib/repo/chats";
import type { Message } from "@/lib/repo/messages";

export default function ChatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastFailedContent, setLastFailedContent] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const speech = useSpeechRecognition();

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch(`/api/chats/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? "Chat not found." : "Failed to load chat.");
      const data = await res.json();
      setChat(data.chat);
      setMessages(data.messages);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- intentional fetch-on-mount
    load();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Mirror the transcribed speech into the text box once it's ready. The
  // recording is sent to the server to be transcribed (OpenAI's Whisper —
  // far more accurate than the browser's built-in recognizer, especially
  // on mixed-language speech), so fullText only updates a moment after you
  // stop recording, not live while you talk. Only the resulting text is
  // ever saved or sent onward; the audio itself isn't stored.
  useEffect(() => {
    if (speech.fullText) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirroring speech transcript into the input box
      setInput(speech.fullText);
    }
  }, [speech.fullText]);

  function toggleMic() {
    if (speech.listening) {
      speech.stop();
      return;
    }
    speech.reset();
    speech.start();
  }

  async function send(content: string) {
    if (!content.trim() || sending) return;
    if (speech.listening) speech.stop();
    setSending(true);
    setSendError(null);
    setLastFailedContent(null);
    setInput("");
    speech.reset();

    // Optimistic user bubble.
    const optimisticUser: Message = {
      id: `optimistic-${Date.now()}`,
      chat_id: id,
      user_id: "",
      sender: "user",
      content,
      retrieved_memories: null,
      status: "sent",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const res = await fetch(`/api/chats/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send message.");

      setMessages((prev) => [...prev.filter((m) => m.id !== optimisticUser.id), data.userMessage, data.aiMessage]);
      setChat((c) => (c ? { ...c, memory_count: data.retrieval?.memories?.length ?? c.memory_count } : c));
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      setLastFailedContent(content);
      setSendError(e instanceof Error ? e.message : "Couldn't send your message. Check your connection.");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteChat() {
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    router.push("/chats");
  }

  if (loadError) {
    return (
      <div className="px-5 pt-6">
        <button onClick={() => router.back()} className="mb-4 flex items-center text-ink-soft text-sm">
          <ChevronLeft size={18} /> Back
        </button>
        <ErrorBanner message={loadError} onRetry={load} />
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-6rem)]">
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur px-5 pt-6 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <button onClick={() => router.push("/chats")} aria-label="Back" className="-ml-1 mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white text-ink">
              <ChevronLeft size={22} />
            </button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface border border-border">
              <LogoMark size={17} />
            </div>
            <div className="min-w-0 ml-1">
              <h1 className="text-lg font-semibold text-ink truncate">{chat.title}</h1>
              <p className="text-xs text-ink-soft">Powered by your experiences</p>
            </div>
          </div>
          <div className="relative shrink-0">
            <button onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white text-ink">
              <MoreVertical size={20} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-10 w-44 rounded-card border border-border bg-surface p-1" style={{ boxShadow: "var(--shadow-card)" }}>
                <button
                  onClick={() => router.push(`/chats/${id}/memories`)}
                  className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-sm text-ink hover:bg-bg"
                >
                  <Sparkles size={15} /> View memories
                </button>
                <button
                  onClick={handleDeleteChat}
                  className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={15} /> Delete chat
                </button>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => router.push(`/chats/${id}/memories`)}
          className="mt-3 flex w-full items-center gap-3 rounded-card border border-border bg-surface p-3 text-left"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-white">
            <Sparkles size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink">
              I found {chat.memory_count} relevant {chat.memory_count === 1 ? "memory" : "memories"}.
            </p>
            <p className="text-xs text-ink-soft">I&apos;ll use your real experiences to give you personalized answers.</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-brand-primary">View</span>
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-ink-soft py-10">
            Ask your AI about your career or experiences to get started.
          </p>
        )}
        {messages.map((m) => (
          <ChatBubble key={m.id} sender={m.sender} content={m.content} status={m.status} createdAt={m.created_at} />
        ))}
        {sending && (
          <div className="flex items-center gap-2 pl-1">
            <Spinner />
            <span className="text-xs text-ink-soft">Thinking…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-5 pb-2">
        {speech.error && (
          <div className="mb-2">
            <ErrorBanner message={speech.error} />
          </div>
        )}
        {sendError && (
          <div className="mb-2">
            <ErrorBanner message={sendError} onRetry={lastFailedContent ? () => send(lastFailedContent) : undefined} />
          </div>
        )}
        {speech.transcribing && (
          <div className="mb-2 flex items-center gap-2 rounded-input border border-border bg-surface px-3.5 py-2.5">
            <Spinner className="h-4 w-4 border-brand-primary-soft border-t-brand-primary" />
            <p className="text-sm font-medium text-ink-soft">Transcribing your recording…</p>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-card border border-border bg-surface p-2"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {speech.supported && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={speech.transcribing}
              aria-label={speech.listening ? "Stop voice input" : "Speak instead of typing"}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 ${
                speech.listening ? "bg-red-500 text-white animate-pulse" : "bg-brand-primary-soft text-brand-primary"
              }`}
            >
              {speech.transcribing ? (
                <Spinner className="border-brand-primary-soft border-t-brand-primary h-4 w-4" />
              ) : speech.listening ? (
                <Square size={16} />
              ) : (
                <Mic size={18} />
              )}
            </button>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={
              speech.listening ? "Listening…" : speech.transcribing ? "Transcribing…" : "Ask your AI about your career or experiences..."
            }
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink placeholder:text-ink-faint outline-none max-h-28"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || speech.transcribing}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-white disabled:opacity-40"
          >
            <ArrowUp size={19} />
          </button>
        </form>
      </div>
    </div>
  );
}
