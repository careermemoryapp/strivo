import { Check, X } from "lucide-react";
import { COMPARISON_POINTS } from "@/lib/marketingContent";

// Non-animated twin of the homepage's "Things ChatGPT and Claude can't
// do" section (MarketingHome.tsx) -- same real COMPARISON_POINTS source
// of truth, no framer-motion (the blog pages are plain server components,
// same reasoning as TestimonialMarquee.tsx). Added 2026-10-11, direct
// founder request: the blog's whole job is converting readers into app
// downloads, not just ranking for keywords, so the index page needed the
// same "why Strivo, not just ChatGPT" argument the homepage leads with
// instead of reading as a bare list of article links.
export function ChatGptComparisonSection() {
  return (
    <section className="border-t border-[#1e1e26] px-8 py-16 sm:px-12" style={{ background: "#0a0a0f" }}>
      <p className="text-center text-xs font-semibold tracking-[0.15em] text-brand-primary">STRIVO VS. GENERIC AI CHATBOTS</p>
      <h2 className="mx-auto mb-3 mt-2 max-w-xl text-center text-2xl font-bold tracking-tight sm:text-3xl">
        Things ChatGPT and Claude simply can&apos;t do
      </h2>
      <p className="mx-auto mb-12 max-w-lg text-center text-sm leading-relaxed text-[#8a8a99]">
        Not a bigger model, not a better prompt — a different job. A general-purpose chatbot only
        answers what you ask it, inside a conversation you started. Strivo is built to act on your
        behalf, in the background, without being asked.
      </p>
      <div className="mx-auto grid max-w-3xl gap-4">
        {COMPARISON_POINTS.map((c, i) => {
          const accent = i % 2 === 0 ? "#8b5cf6" : "#60a5fa";
          const accentSoft = i % 2 === 0 ? "#c4b5fd" : "#93c5fd";
          return (
            <div
              key={c.title}
              className="rounded-2xl border-y border-r border-[#2a2a35] p-5 sm:p-6"
              style={{
                background: i % 2 === 0 ? "linear-gradient(160deg,#1c1029,#0d0d14)" : "linear-gradient(160deg,#0d1a2c,#0d0d14)",
                borderLeft: `3px solid ${accent}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `${accent}33`, color: accentSoft, boxShadow: `0 0 14px ${accent}40` }}
                >
                  <Check size={15} strokeWidth={3.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white sm:text-base">{c.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#a8a8b3]">{c.strivo}</p>
                </div>
              </div>
              <div className="ml-10 mt-3 flex items-start gap-3 border-t border-[#232330] pt-3 sm:ml-10">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-[#5c5c68]">
                  <X size={14} strokeWidth={3} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#5c5c68]">ChatGPT / Claude</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-[#6a6a75]">{c.others}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
