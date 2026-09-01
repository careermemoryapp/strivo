"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, ArrowUp, Sparkles, Trash2, Mic, Square } from "lucide-react";
import { ChatBubble } from "@/components/ChatBubble";
import { DarkHeader } from "@/components/DarkHeader";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import type { Chat } from "@/lib/repo/chats";
import type { Message } from "@/lib/repo/messages";

// Roughly 6 lines of text before the input box stops growing and scrolls
// internally instead -- see the auto-grow effect below.
const MAX_TEXTAREA_HEIGHT = 160;

// Seeded with data page.tsx (a Server Component) already fetched during the
// initial render, instead of fetching it again here on mount. The old
// version of this file fetched `/api/chats/${id}` itself in a useEffect,
// which meant every tap into a chat waited on: navigate -> mount -> fire a
// second network round-trip -> wait for it -> only then render real content.
// That extra round-trip was adding real, visible delay on every open (not
// just a perception problem like the earlier tap-feedback fix) -- moving
// the fetch server-side means the chat and its messages arrive in the very
// first response, so there's nothing left to wait on here.
export function ChatDetailClient({
  chatId,
  initialChat,
  initialMessages,
}: {
  chatId: string;
  initialChat: Chat;
  initialMessages: Message[];
}) {
  const router = useRouter();

  const [chat, setChat] = useState<Chat>(initialChat);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastFailedContent, setLastFailedContent] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeechRecognition();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Auto-grow the textarea with its content (like Claude/ChatGPT's input),
  // instead of staying pinned at rows={1} and scrolling internally. Runs on
  // every `input` change -- both typing and the speech-transcript mirror
  // effect below -- so the box always matches what's actually in it. Resets
  // itself back to one line automatically once `input` is cleared after
  // sending, since that's just another `input` change through this same
  // effect. Caps out at MAX_TEXTAREA_HEIGHT and lets the textarea's own
  // scrollbar take over past that, rather than growing indefinitely and
  // pushing the send button off-screen.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [input]);

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
      chat_id: chatId,
      user_id: "",
      sender: "user",
      content,
      retrieved_memories: null,
      status: "sent",
      created_at: new Date().toISOString(),
      embedding: null,
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send message.");

      setMessages((prev) => [...prev.filter((m) => m.id !== optimisticUser.id), data.userMessage, data.aiMessage]);
      setChat((c) => ({ ...c, memory_count: data.retrieval?.memories?.length ?? c.memory_count }));
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      setLastFailedContent(content);
      setSendError(e instanceof Error ? e.message : "Couldn't send your message. Check your connection.");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteChat() {
    await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    router.push("/chats");
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-6rem)]">
      <div className="sticky top-0 z-20">
        <DarkHeader
          back
          logoMark
          inlineTitle={chat.title}
          inlineSubtitle="Powered by your experiences"
          right={
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Menu"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/85 active:bg-white/10"
              >
                <MoreVertical size={19} />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-9 z-10 w-44 rounded-card border border-border bg-surface p-1"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <button
                    onClick={() => router.push(`/chats/${chatId}/memories`)}
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
          }
        >
          <button
            onClick={() => router.push(`/chats/${chatId}/memories`)}
            className="relative mt-4 flex w-full items-center gap-3 rounded-[13px] border border-white/10 bg-white/8 p-3 text-left"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
            >
              <Sparkles size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">
                I found {chat.memory_count} relevant {chat.memory_count === 1 ? "memory" : "memories"}.
              </p>
              <p className="text-xs text-white/55">I&apos;ll use your real experiences to give you personalized answers.</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-white">View</span>
          </button>
        </DarkHeader>
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
          className="flex items-end gap-2 rounded-[16px] border border-[#ece5f5] bg-surface p-2"
          style={{ boxShadow: "0 8px 20px rgba(60,50,90,0.1)" }}
        >
          {speech.supported && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={speech.transcribing}
              aria-label={speech.listening ? "Stop voice input" : "Speak instead of typing"}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 ${
                speech.listening ? "bg-red-500 text-white animate-pulse" : "bg-[#f2effa] text-[#8b5cf6]"
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
            ref={textareaRef}
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
              speech.listening ? "Listening…" : speech.transcribing ? "Transcribing…" : "Ask about your experiences..."
            }
            className="flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-sm text-ink placeholder:text-ink-faint outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || speech.transcribing}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
          >
            <ArrowUp size={19} />
          </button>
        </form>
      </div>
    </div>
  );
}
