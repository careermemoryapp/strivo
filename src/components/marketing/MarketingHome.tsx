"use client";

import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, type Variants } from "framer-motion";
import {
  Check, X, Plus, Sparkles, Copy, MessageCircleQuestion, Award, LayoutGrid, CalendarDays, TrendingUp, Scale, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { APP_NAME, PLAY_STORE_URL } from "@/lib/config";

// The public marketing homepage at strivo.ai — the ONLY thing a browser
// visitor ever sees. The real app (voice recording, chat, memories) lives
// behind the native Android app now; this page's only job is to sell that
// download. See src/app/app/page.tsx for where the app itself now lives,
// and capacitor.config.ts for how the native shell skips this page
// entirely and opens straight to /app.
//
// Design direction: bold black-background editorial layout (large stacked
// headlines, generous whitespace, a white pill CTA) rather than a colorful
// gradient SaaS template — chosen directly from mockup options shown to
// the founder. The three phone mockups below are hand-built recreations of
// the ACTUAL app screens (Home, Record, Chat — see src/app/(app)/home,
// /record, and the chat UI) rather than abstract placeholders, so visitors
// get a feel for the real product before downloading. Copy is grounded in
// Strivo's real QUICK_ACTIONS (lib/config.ts) — this is a career-memory
// coach (interview prep, resumes, performance reviews, leadership
// examples), not a generic journaling app.
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

// A button that visually "leans toward" the cursor as it approaches — a
// small magnetic-pull effect, spring-damped so it feels physical.
function Magnetic({ children, strength = 0.25 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 200, damping: 15, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 200, damping: 15, mass: 0.4 });

  function handleMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * strength);
    y.set((e.clientY - rect.top - rect.height / 2) * strength);
  }
  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div ref={ref} onMouseMove={handleMove} onMouseLeave={handleLeave} style={{ x: springX, y: springY }} className="inline-block">
      {children}
    </motion.div>
  );
}

// 3D tilt that tracks the cursor position, spring-damped back to flat on
// leave — used on the use-case and pricing cards for a "premium, physical"
// feel without a fixed hover angle.
function TiltCard({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRX = useSpring(rotateX, { stiffness: 300, damping: 25 });
  const springRY = useSpring(rotateY, { stiffness: 300, damping: 25 });

  function handleMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 10);
    rotateX.set(py * -10);
  }
  function handleLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ rotateX: springRX, rotateY: springRY, transformStyle: "preserve-3d", ...style }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function PillButton({ className = "" }: { className?: string }) {
  return (
    <Magnetic>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-block rounded-full bg-white px-9 py-4 text-sm font-bold text-[#0a0a0f] transition-transform hover:-translate-y-0.5 active:scale-[0.98] ${className}`}
        style={{ boxShadow: "0 8px 24px rgba(255,255,255,0.15)" }}
      >
        Get the app →
      </a>
    </Magnetic>
  );
}

// --- Phone mockups — faithful recreations of the real app screens -------

function PhoneFrame({ children, width = 210, glow }: { children: React.ReactNode; width?: number; glow?: string }) {
  return (
    <div
      className="overflow-hidden rounded-[32px] border-[7px] border-[#1c1c24]"
      style={{ width, background: "#0a0a0f", boxShadow: glow }}
    >
      {children}
    </div>
  );
}

function HomeScreenMock() {
  const actions = [
    { title: "Prepare for an interview", icon: "◎" },
    { title: "Update my resume", icon: "▤" },
    { title: "Find leadership examples", icon: "◆" },
  ];
  return (
    <PhoneFrame width={230} glow="0 40px 90px rgba(124,58,237,0.25), 0 0 0 1px rgba(255,255,255,0.06)">
      <div className="px-3.5 pb-5 pt-4" style={{ background: "linear-gradient(160deg,#1c1435,#2a1550,#150c2e)" }}>
        <p className="text-[10px] text-[#c9bdf0]">Good evening</p>
        <p className="mt-0.5 text-sm font-bold text-white">Shikhar</p>
        <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-[#1c1830] px-3 py-2.5">
          <span className="text-[9px] text-[#c9bdf0]">✦</span>
          <span className="text-[10px] text-white/40">Ask anything — career advice…</span>
        </div>
      </div>
      <div className="bg-white px-3 py-3.5">
        <div className="rounded-[13px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-3 text-center">
          <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs text-[#8b5cf6]" style={{ boxShadow: "0 4px 10px rgba(139,92,246,0.2)" }}>●</div>
          <p className="text-[10px] font-bold text-[#3c3650]">What&apos;s on your mind today?</p>
          <div className="mt-1.5 inline-block rounded-full px-3 py-1.5 text-[9px] font-bold text-white" style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}>
            Start recording
          </div>
        </div>
        <p className="mb-1 mt-3 text-[8px] font-bold tracking-wide text-[#a8a2bd]">OR ACCOMPLISH TODAY</p>
        {actions.map((a, i) => (
          <div key={a.title} className={`flex items-center gap-2 py-2 ${i === 0 ? "border-t border-[#f0ecf7]" : "border-t border-[#f0ecf7]"} ${i === actions.length - 1 ? "border-b" : ""}`}>
            <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[#f2effa] text-[10px] text-[#8b5cf6]">{a.icon}</div>
            <p className="text-[9.5px] font-semibold text-[#3c3650]">{a.title}</p>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

function RecordScreenMock() {
  const bars = [10, 20, 14, 22, 12, 18, 10];
  return (
    <PhoneFrame width={200} glow="0 24px 60px rgba(124,58,237,0.3)">
      <div
        className="flex flex-col items-center text-center"
        style={{ background: "linear-gradient(160deg,#1c1435,#150c2e)", height: 340, padding: "22px 18px" }}
      >
        <div className="flex items-center gap-1.5 rounded-full bg-[#2a1550] px-3 py-1.5">
          <span className="h-[6px] w-[6px] rounded-full bg-[#ef4444]" />
          <span className="text-[10px] font-semibold tracking-wide text-[#e0d5f7]">RECORDING</span>
        </div>
        <p className="mt-2 text-[11px] text-[#a08fc9]">00:42</p>
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-xl text-[#8b5cf6]" style={{ boxShadow: "0 0 0 10px rgba(139,92,246,0.25)" }}>●</div>
          <div className="flex h-[22px] items-end justify-center gap-[3px]">
            {bars.map((h, i) => (
              <span
                key={i}
                className={`w-[3px] rounded-full ${i % 2 === 0 ? "bg-[#c9bdf0]" : "bg-[#8b5cf6]"}`}
                style={{ height: h, animation: `bar-pulse 0.9s ease-in-out ${i * 0.08}s infinite alternate` }}
              />
            ))}
          </div>
        </div>
        <div className="rounded-full bg-white/10 px-5 py-2 text-[11px] font-bold text-white">Stop</div>
      </div>
    </PhoneFrame>
  );
}

function CreateMemoryScreenMock() {
  const tags = ["Leadership", "Work", "Achievement"];
  return (
    <PhoneFrame width={200} glow="0 24px 60px rgba(0,0,0,0.35)">
      <div className="flex flex-col bg-white text-left" style={{ height: 340, padding: "20px 18px" }}>
        <p className="mb-2 text-[9px] font-bold uppercase tracking-wide text-[#a8a2bd]">Transcript</p>
        <p className="mb-4 text-[11px] leading-relaxed text-[#3c3650]">
          &quot;...led the launch when two teammates were out, shipped on time...&quot;
        </p>
        <div className="mb-3 border-t border-[#f0ecf7] pt-3">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-[#a8a2bd]">Title</p>
          <p className="text-[11px] font-semibold text-[#3c3650]">Led product launch solo</p>
        </div>
        <div className="mb-4">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-[#a8a2bd]">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <span
                key={tag}
                className="rounded-full px-2.5 py-1 text-[9px] font-semibold"
                style={i === 0 ? { background: "linear-gradient(135deg,#a78bfa,#60a5fa)", color: "#fff" } : { background: "#f2effa", color: "#8b5cf6" }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-auto">
          <div className="inline-block rounded-full px-4 py-2 text-[11px] font-bold text-white" style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}>
            Create Memory
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

function ChatScreenMock() {
  return (
    <PhoneFrame width={200} glow="0 24px 60px rgba(0,0,0,0.35)">
      <div className="flex flex-col" style={{ height: 340, padding: "20px 16px" }}>
        <div className="flex-1">
        <div className="rounded-xl rounded-bl-sm bg-[#f2effa] p-3 text-[11px] leading-relaxed text-[#3c3650]">
          A time I showed leadership?
        </div>
        <div className="mt-2 rounded-xl rounded-br-sm p-3 text-[11px] leading-relaxed text-white" style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}>
          In March you led the launch solo.
        </div>
        <div className="mt-2 rounded-xl rounded-bl-sm bg-[#f2effa] p-3 text-[11px] leading-relaxed text-[#3c3650]">
          Any resume-ready bullet for that?
        </div>
        <div className="mt-2 rounded-xl rounded-br-sm p-3 text-[11px] leading-relaxed text-white" style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}>
          &quot;Led product launch solo after two teammates were out, shipping on time.&quot;
        </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-full border border-[#ece5f5] px-3 py-2.5">
          <span className="flex-1 text-[10px] text-[#a8a2bd]">Ask a follow-up…</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-white" style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}>➤</span>
        </div>
      </div>
    </PhoneFrame>
  );
}

// A single expand/collapse FAQ row. Animated with a CSS grid-rows trick
// (0fr -> 1fr) rather than framer-motion's height:auto, which needs to
// measure the element on every open/close -- the grid trick animates
// smoothly with plain CSS and no JS measuring at all.
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#1e1e26] py-5">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className={`text-[15px] font-semibold ${open ? "text-white" : "text-[#d0d0d8]"}`}>{q}</span>
        <Plus
          size={18}
          className={`shrink-0 text-[#8a8a99] transition-transform duration-300 ${open ? "rotate-45 text-brand-secondary" : ""}`}
        />
      </button>
      <div className={`grid transition-all duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <p className="pr-8 pt-3 text-sm leading-relaxed text-[#8a8a99]">{a}</p>
        </div>
      </div>
    </div>
  );
}

// The animated "left becomes right" connector between the two human-angle
// columns below -- traveling dots read as something actively flowing/
// happening rather than a static divider, which is the whole point of that
// section (in-the-moment reactions turning into things that build up over
// time). Two versions in one component rather than a `vertical` prop
// switched by JS, since the layout itself flips from side-by-side to
// stacked at the `sm` breakpoint via Tailwind, and each orientation needs
// its own dot-travel axis (left↔right vs. top↔bottom).
function FlowConnector() {
  const dots = [0, 0.7, 1.4];
  return (
    <>
      <div className="relative hidden h-full min-h-[140px] w-full items-center justify-center sm:flex">
        <div
          className="relative h-[2px] w-full overflow-hidden rounded-full"
          style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.5), rgba(96,165,250,0.5))" }}
        >
          {dots.map((delay, i) => (
            <motion.span
              key={i}
              className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
              style={{
                background: i % 2 === 0 ? "#c4b5fd" : "#93c5fd",
                boxShadow: `0 0 8px ${i % 2 === 0 ? "#8b5cf6" : "#60a5fa"}`,
              }}
              animate={{ left: ["0%", "100%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear", delay }}
            />
          ))}
        </div>
        <ArrowRight
          size={18}
          className="absolute text-[#60a5fa]"
          style={{ filter: "drop-shadow(0 0 6px rgba(96,165,250,0.6))" }}
        />
      </div>
      <div className="relative flex h-14 w-full items-center justify-center sm:hidden">
        <div
          className="relative h-full w-[2px] overflow-hidden rounded-full"
          style={{ background: "linear-gradient(180deg, rgba(139,92,246,0.5), rgba(96,165,250,0.5))" }}
        >
          {dots.map((delay, i) => (
            <motion.span
              key={i}
              className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
              style={{
                background: i % 2 === 0 ? "#c4b5fd" : "#93c5fd",
                boxShadow: `0 0 8px ${i % 2 === 0 ? "#8b5cf6" : "#60a5fa"}`,
              }}
              animate={{ top: ["0%", "100%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear", delay }}
            />
          ))}
        </div>
        <ArrowRight
          size={18}
          className="absolute rotate-90 text-[#60a5fa]"
          style={{ filter: "drop-shadow(0 0 6px rgba(96,165,250,0.6))" }}
        />
      </div>
    </>
  );
}

// --- Content, grounded in the real product -------------------------------

const VALUE_PROPS = [
  { n: "01", title: "Just speak", body: "No typing. Talk through a meeting, a win, or a tough moment right after it happens, and Strivo turns it into a saved memory automatically." },
  { n: "02", title: "It organizes everything", body: "Every memory is tagged — Work, Achievement, Leadership, Review — and instantly searchable, so nothing gets buried in old notes." },
  { n: "03", title: "It finds the right story", body: "Ask for a leadership example or a resume-ready win, and Strivo pulls from your real history instead of you staring at a blank page." },
  { n: "04", title: "Gentle nudges", body: "A quiet reminder to log a win before you forget it — so your memory bank keeps growing without extra effort." },
];

// Mirrors the real QUICK_ACTIONS in lib/config.ts (minus "Others").
const USE_CASES = [
  { title: "Prepare for an interview", body: "Find the right stories and examples" },
  { title: "Update my resume", body: "Create strong bullet points and impact" },
  { title: "Prepare for performance review", body: "Highlight your achievements and growth" },
  { title: "Find leadership examples", body: "Discover moments that show your leadership", highlight: true },
];

// The "human angle" features, mirrored from the real in-app Features page
// (see app/(app)/settings/features) -- split the same way that page splits
// them: what happens the instant you record something, vs. what builds up
// automatically the more you use Strivo, with zero extra effort.
const MOMENT_FEATURES = [
  { icon: Sparkles, title: "A real reaction, not just a save", body: "Notices genuine Leadership, Problem-Solving, or grit in your story — even the struggle, not just the clean win." },
  { icon: Copy, title: "A resume line, already written", body: "A polished bullet, numbers pulled straight from what you actually said." },
  { icon: MessageCircleQuestion, title: "One good question back", body: "Short, genuinely curious, optional — answer it and the memory gets richer." },
  { icon: Award, title: "Small, earned milestones", body: "First story in a new strength, first real number. No streaks to babysit." },
];

const OVER_TIME_FEATURES = [
  { icon: LayoutGrid, title: "Story Bank", when: "from day one", body: "Which strengths you've got real stories for — and which are still thin." },
  { icon: CalendarDays, title: "Your Week in Stories", when: "weekly", body: "Your best 2-3 moments from the week, recapped for you automatically." },
  { icon: TrendingUp, title: "How You've Grown", when: "~monthly", body: "Your earliest stories vs. your latest — a real pattern, reflected back." },
  { icon: Scale, title: "You vs. You", when: "every quarter", body: "An honest check-in against your own last quarter. No scoreboard, no games." },
];

// The direct differentiator section -- deliberately scoped to things that
// are concretely TRUE and BUILT, not marketing puffery ("smarter AI",
// "better memory"). Every line here maps to a real, shipped feature (see
// the automations in app/api/checkins, weekly-recap, growth-narrative,
// quarterly-benchmark, and the praise/resumeLine/reflectiveQuestion fields
// in generateMemoryMetadata, lib/ai.ts) so nothing here is a claim Strivo
// can't back up if someone actually tries it. Framed honestly rather than
// as "ChatGPT has no memory at all" (it does, to a degree) -- the real,
// defensible gap is that a general-purpose chatbot never acts on its own:
// it only ever responds inside a conversation someone started.
const COMPARISON_POINTS = [
  {
    title: "Follows up, unprompted",
    strivo: "Remembers something you mentioned was coming up and checks back in days later — no chat to keep open, nothing to set a reminder for.",
    others: "Only responds inside a conversation you start. Nothing happens once you close the tab.",
  },
  {
    title: "Organizes your stories by competency",
    strivo: "Every memory is auto-tagged (Leadership, Problem-Solving, and 20 more) and tracked in a Story Bank, so gaps are visible at a glance.",
    others: "General-purpose chat with no structured tracking of what you've told it over time.",
  },
  {
    title: "Reacts to what you just said",
    strivo: "Notices when a story shows real skill or persistence and tells you, unprompted, right after you record it.",
    others: "Waits to be asked. Won't flag anything as noteworthy on its own.",
  },
  {
    title: "Writes the resume line for you",
    strivo: "A polished, numbers-included bullet generated automatically from the story you told — ready to copy.",
    others: "Requires you to ask, then re-explain the context, every single time.",
  },
  {
    title: "Sends real check-ins automatically",
    strivo: "Weekly recaps, monthly growth reflections, quarterly benchmarks — pushed to your phone without you asking.",
    others: "Zero proactive outreach. Every insight has to be requested.",
  },
];

// Deliberately not fabricated testimonials attributed to made-up people --
// Strivo is early-stage and doesn't have verified user quotes to publish
// yet. An honest founder's-note section fills the same spot on the page
// without inventing social proof (see the "Why I built this" section
// below, which replaced a TESTIMONIALS array of fictional names/quotes).

export function MarketingHome({
  trialMonths,
  monthlyPriceLabel,
  annualPriceLabel,
  annualListPriceLabel,
}: {
  trialMonths: number;
  monthlyPriceLabel: string;
  annualPriceLabel: string;
  annualListPriceLabel: string;
}) {
  // Built inside the component (not as a module-level const) because
  // several answers reference the real, current pricing/trial props
  // instead of a hardcoded number that could drift out of sync with the
  // pricing section above.
  const FAQS = [
    {
      q: "What is Strivo?",
      a: "Strivo is an AI career-memory app. You speak your day-to-day work moments — a project you led, a hard problem you solved, feedback you got — into it, and it remembers so you don't have to reconstruct everything from scratch when an interview, resume, or performance review comes up.",
    },
    {
      q: "How does it actually work?",
      a: "You record a short voice note (or type one). Strivo transcribes it, tags it automatically — Work, Achievement, Leadership, Review, and more — and saves it as a memory. Later, you can chat with it and ask things like “give me a leadership example” or “write a resume bullet for this,” and it answers using your real history instead of generic advice.",
    },
    {
      q: "Is my data private?",
      a: "Yes. Your memories are yours — encrypted at rest and in transit, never sold, and never shared with anyone else. See the Privacy Policy for the full details.",
    },
    {
      q: "Does Strivo train AI models on my data?",
      a: "No. Your recordings and memories are used only to power your own answers inside Strivo, not to train any AI model, and not shared with third parties for marketing or advertising.",
    },
    {
      q: "What happens after the free trial?",
      a: `You'll be asked to choose a plan — ${monthlyPriceLabel}/month or ${annualPriceLabel}/year (50% off versus monthly). Nothing is charged automatically without you picking a plan first.`,
    },
    {
      q: "Can I cancel or delete my data?",
      a: "Yes, anytime. You can delete individual memories, or delete your entire account and all its data, right from Settings.",
    },
    {
      q: "Do I have to record something every day?",
      a: "No. Strivo works best with regular use, but there's no streak to maintain and no penalty for going quiet — everything you've already recorded stays exactly as you left it.",
    },
    {
      q: "Can I type instead of speaking?",
      a: "Yes. Voice is the fastest way to capture something in the moment, but every screen that accepts a recording also accepts typed text or an uploaded document (PDF, Word, PowerPoint, or Excel).",
    },
    {
      q: "Is there a limit on how long I can record?",
      a: "Each recording can run up to 2 minutes at a stretch — long enough for a full thought, short enough to stay easy to transcribe and search later. You can record as many times as you like.",
    },
    {
      q: "Is Strivo available on iPhone?",
      a: "Not yet — Strivo is currently a native Android app on the Google Play Store. iOS is on the roadmap.",
    },
    {
      q: "Is Strivo a therapist or crisis service?",
      a: "No. Strivo is a career-coaching tool, not a medical, mental-health, or crisis service. If you're in crisis, please reach out to a local crisis line or a mental-health professional — Strivo will point you to those resources rather than try to help directly.",
    },
    {
      q: "How is this different from a notes app?",
      a: "A notes app remembers what you write down. Strivo remembers what you say, organizes it automatically, and hands the right piece back to you exactly when you need it — for an interview, a resume, or a review — instead of leaving you to scroll through old notes.",
    },
  ];

  return (
    <div id="marketing-root" className="min-h-screen font-sans text-white" style={{ background: "#0a0a0f" }}>
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-[#1e1e26] px-8 py-5" style={{ background: "#0a0a0f" }}>
        <div className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[15px] font-extrabold tracking-tight">{APP_NAME.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/blog" className="text-xs font-medium text-[#888] hover:text-white">
            Blog
          </Link>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#888] hover:text-white">
            Get the app →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-8 pb-16 pt-16 text-center sm:pt-24" style={{ background: "#0a0a0f" }}>
        <div
          className="pointer-events-none absolute left-1/2 top-[-120px] -translate-x-1/2"
          style={{
            width: 640,
            height: 420,
            background: "radial-gradient(ellipse at center, rgba(124,58,237,0.35), rgba(79,110,247,0.15) 45%, transparent 75%)",
            filter: "blur(10px)",
          }}
        />
        <motion.div initial="hidden" animate="show" variants={stagger} className="relative">
          <motion.p variants={fadeUp} className="mb-5 text-xs font-semibold tracking-[0.2em] text-brand-primary">
            YOUR AI CAREER MEMORY
          </motion.p>
          <motion.h1 variants={fadeUp} className="mx-auto text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Never forget the story
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg,#6d8bff,#c266f2,#e879f9)" }}
            >
              that gets you the offer.
            </span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-md text-base leading-relaxed text-[#a0a0ac] sm:text-lg">
            Speak it once. Strivo captures it, organizes it, and hands it back exactly when an interview, resume, or review needs it.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8">
            <PillButton />
          </motion.div>
          <motion.p variants={fadeUp} className="mt-3 text-xs text-[#5a5a66]">
            Free for {trialMonths} months · no card needed
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 flex flex-col items-center"
        >
          <HomeScreenMock />
          <p className="mt-3 text-xs text-[#c9bdf0]">The actual Strivo home screen</p>
        </motion.div>
      </section>

      {/* Value props */}
      <section className="border-t border-[#1e1e26] px-8 py-16 text-center sm:px-12" style={{ background: "#0a0a0f" }}>
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="text-xs font-semibold tracking-[0.15em] text-brand-secondary">
          WHAT STRIVO OFFERS
        </motion.p>
        <motion.h2 initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="mx-auto mb-10 mt-2 max-w-lg text-2xl font-bold tracking-tight">
          Four things, working together every day
        </motion.h2>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }} variants={stagger} className="mx-auto grid max-w-4xl grid-cols-1 gap-x-10 gap-y-8 text-left sm:grid-cols-2">
          {VALUE_PROPS.map((v) => (
            <motion.div key={v.n} variants={fadeUp} className="flex items-start gap-4 rounded-2xl border border-[#1e1e26] p-5">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#2a2a35] bg-[#161620] text-[10px] text-brand-secondary">{v.n}</span>
              <div>
                <p className="text-lg font-bold text-white">{v.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[#8a8a99]">{v.body}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* How it works — three real screens */}
      <section className="relative overflow-hidden border-t border-[#1e1e26] px-8 py-20 sm:px-12" style={{ background: "linear-gradient(135deg,#160a26,#0a0a0f 60%)" }}>
        <div
          className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2"
          style={{ width: 700, height: 340, background: "radial-gradient(ellipse at center, rgba(124,58,237,0.22), transparent 70%)" }}
        />
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="relative text-center text-xs font-semibold tracking-[0.15em] text-brand-primary">
          HOW IT WORKS
        </motion.p>
        <motion.h2 initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="relative mb-12 mt-2 text-center text-2xl font-bold tracking-tight">
          Three steps, start to finish
        </motion.h2>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} variants={stagger} className="relative flex flex-wrap justify-center gap-9">
          <motion.div variants={fadeUp} className="flex flex-col items-center text-center" style={{ width: 200 }}>
            <RecordScreenMock />
            <p className="mt-4 text-sm font-bold">1. Record</p>
            <p className="mt-1 text-xs leading-relaxed text-[#8a8a99]">Tap the mic, speak freely for up to 5 minutes.</p>
          </motion.div>
          <motion.div variants={fadeUp} className="flex flex-col items-center text-center" style={{ width: 200 }}>
            <CreateMemoryScreenMock />
            <p className="mt-4 text-sm font-bold">2. Create memory</p>
            <p className="mt-1 text-xs leading-relaxed text-[#8a8a99]">Strivo transcribes and tags it automatically.</p>
          </motion.div>
          <motion.div variants={fadeUp} className="flex flex-col items-center text-center" style={{ width: 200 }}>
            <ChatScreenMock />
            <p className="mt-4 text-sm font-bold">3. Chat</p>
            <p className="mt-1 text-xs leading-relaxed text-[#8a8a99]">Ask for it back — anytime, in your own words.</p>
          </motion.div>
        </motion.div>
      </section>

      {/* Use cases */}
      <section className="border-t border-[#1e1e26] px-8 py-16 sm:px-12" style={{ background: "#0a0a0f" }}>
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="text-xs font-semibold tracking-[0.15em] text-brand-secondary">
          BUILT FOR MOMENTS LIKE THESE
        </motion.p>
        <motion.h2 initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="mb-8 mt-2 max-w-md text-2xl font-bold tracking-tight">
          The exact use cases Strivo is designed around
        </motion.h2>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }} variants={stagger} className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {USE_CASES.map((u) => (
            <motion.div key={u.title} variants={fadeUp}>
              <TiltCard
                className={`rounded-2xl p-5 ${u.highlight ? "bg-gradient-brand" : "border border-[#2a2a35]"}`}
                style={u.highlight ? { boxShadow: "0 16px 40px rgba(124,58,237,0.35)" } : undefined}
              >
                <p className="text-base font-bold text-white">{u.title}</p>
                <p className={`mt-1.5 text-sm leading-relaxed ${u.highlight ? "text-white/85" : "text-[#8a8a99]"}`}>{u.body}</p>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Human angle -- the real differentiator vs. a plain notes app or a
          generic chatbot: some of this reacts to you the instant you
          record, and some of it quietly builds up the more you use
          Strivo, with zero extra effort. The connecting FlowConnector
          (traveling dots) is what turns "here are two lists" into "here's
          a system that keeps working on your behalf." */}
      <section
        className="relative overflow-hidden border-t border-[#1e1e26] px-8 py-20 sm:px-12"
        style={{ background: "linear-gradient(180deg,#0a0a0f,#0d0d16 50%,#0a0a0f)" }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
          style={{ width: 800, height: 320, background: "radial-gradient(ellipse at center, rgba(124,58,237,0.18), transparent 70%)" }}
        />
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="relative text-center text-xs font-semibold tracking-[0.15em] text-brand-primary">
          THE HUMAN SIDE
        </motion.p>
        <motion.h2 initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="relative mx-auto mb-3 mt-2 max-w-xl text-center text-2xl font-bold tracking-tight sm:text-3xl">
          It doesn&apos;t just store what you say — it notices
        </motion.h2>
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="relative mx-auto mb-14 max-w-lg text-center text-sm leading-relaxed text-[#8a8a99]">
          Some of it happens the second you hit save. The rest builds up quietly, the more you use it — until it hands you back something no notes app or generic chatbot ever could.
        </motion.p>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          variants={stagger}
          className="relative mx-auto grid max-w-5xl grid-cols-1 items-stretch gap-0 sm:grid-cols-[1fr_90px_1fr]"
        >
          {/* Left: in the moment */}
          <motion.div
            variants={fadeUp}
            className="rounded-2xl border border-[#2a2a35] p-6 sm:p-7"
            style={{ background: "linear-gradient(160deg,#181022,#0d0d14)" }}
          >
            <div className="mb-5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: "#a78bfa", boxShadow: "0 0 8px #a78bfa" }} />
              <p className="text-xs font-bold uppercase tracking-wide text-[#c4b5fd]">Right when you record</p>
            </div>
            <div className="space-y-4">
              {MOMENT_FEATURES.map((f) => (
                <div key={f.title} className="flex items-start gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}
                  >
                    <f.icon size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{f.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#8a8a99]">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Connector */}
          <motion.div variants={fadeUp} className="flex items-center justify-center py-6 sm:py-0">
            <FlowConnector />
          </motion.div>

          {/* Right: over time */}
          <motion.div
            variants={fadeUp}
            className="rounded-2xl border border-[#2a2a35] p-6 sm:p-7"
            style={{ background: "linear-gradient(160deg,#0d1a16,#0d0d14)" }}
          >
            <div className="mb-5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: "#60a5fa", boxShadow: "0 0 8px #60a5fa" }} />
              <p className="text-xs font-bold uppercase tracking-wide text-[#93c5fd]">Builds automatically, over time</p>
            </div>
            <div className="space-y-4">
              {OVER_TIME_FEATURES.map((f) => (
                <div key={f.title} className="flex items-start gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: "rgba(96,165,250,0.15)", color: "#93c5fd" }}
                  >
                    <f.icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-bold text-white">{f.title}</p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                        style={{ background: "rgba(96,165,250,0.15)", color: "#93c5fd" }}
                      >
                        {f.when}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#8a8a99]">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>

      </section>

      {/* Dedicated differentiator section -- what Strivo actually does that
          a general-purpose AI chatbot doesn't, stated plainly rather than
          folded into the human-side grid above. This is the section built
          to carry the "no other AI app has this" message on its own (see
          COMPARISON_POINTS above for why each line is scoped to something
          concretely shipped, not a vague claim). Colors stay in the site's
          own violet/blue palette -- a Check in violet for what Strivo does,
          a muted gray X for the generic-chatbot side, no new accent color
          introduced just for this section. */}
      <section className="relative border-t border-[#1e1e26] bg-[#0a0a0f] px-8 py-20 sm:px-12">
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="text-center text-xs font-semibold tracking-[0.15em] text-brand-primary">
          STRIVO VS. GENERIC AI CHATBOTS
        </motion.p>
        <motion.h2 initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="mx-auto mb-3 mt-2 max-w-xl text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Things ChatGPT and Claude simply can&apos;t do
        </motion.h2>
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="mx-auto mb-12 max-w-lg text-center text-sm leading-relaxed text-[#8a8a99]">
          Not a bigger model, not a better prompt — a different job. A general-purpose chatbot only
          answers what you ask it, inside a conversation you started. Strivo is built to act on your
          behalf, in the background, without being asked.
        </motion.p>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          variants={stagger}
          className="mx-auto grid max-w-3xl gap-4"
        >
          {COMPARISON_POINTS.map((c, i) => (
            <motion.div
              key={c.title}
              variants={fadeUp}
              className="rounded-2xl border border-[#2a2a35] p-5 sm:p-6"
              style={{ background: i % 2 === 0 ? "linear-gradient(160deg,#181022,#0d0d14)" : "linear-gradient(160deg,#0d1a22,#0d0d14)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: i % 2 === 0 ? "rgba(139,92,246,0.18)" : "rgba(96,165,250,0.18)", color: i % 2 === 0 ? "#c4b5fd" : "#93c5fd" }}
                >
                  <Check size={14} strokeWidth={3} />
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
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Why I built this -- an honest founder's note in place of the
          fabricated-testimonials pattern many AI-built apps ship with
          (invented names/quotes attributed to people who don't exist is a
          real deceptive-advertising risk, not just a style choice). */}
      <section className="border-t border-[#1e1e26] px-8 py-16 text-center sm:px-12" style={{ background: "#0a0a0f" }}>
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="mb-8 text-xs font-semibold tracking-[0.15em] text-brand-primary">
          WHY I BUILT THIS
        </motion.p>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} className="mx-auto max-w-2xl">
          <p className="text-lg leading-relaxed text-white/90">
            Every time an interview or performance review came up, I&apos;d blank on my own achievements —
            not because I hadn&apos;t done the work, but because I&apos;d never written any of it down. Strivo
            is the tool I wished I had: somewhere to capture what I actually did, in the moment, so I never
            have to reconstruct it from memory under pressure again.
          </p>
          <p className="mt-4 text-sm text-[#8a8a99]">— Shikhar, founder</p>
        </motion.div>
      </section>

      {/* Pricing */}
      <section className="border-t border-[#1e1e26] px-8 py-16 sm:px-12" style={{ background: "#0a0a0f" }}>
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="text-xs font-semibold tracking-[0.15em] text-brand-secondary">
          SIMPLE PRICING
        </motion.p>
        <motion.h2 initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="mb-8 mt-2 text-2xl font-bold tracking-tight">
          Free for {trialMonths} months, then
        </motion.h2>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger} className="flex flex-wrap gap-4">
          <motion.div variants={fadeUp} className="min-w-[180px] flex-1">
            <TiltCard className="rounded-[18px] border border-[#2a2a35] p-6 text-left">
              <p className="text-xs text-[#8a8a99]">Monthly</p>
              <p className="mt-1.5 text-3xl font-extrabold">{monthlyPriceLabel}</p>
              <ul className="mt-3.5 space-y-1.5 text-xs text-[#8a8a99]">
                <li className="flex items-center gap-1.5"><Check size={13} />Unlimited memories</li>
                <li className="flex items-center gap-1.5"><Check size={13} />AI chat</li>
              </ul>
            </TiltCard>
          </motion.div>
          <motion.div variants={fadeUp} className="min-w-[180px] flex-1">
            <TiltCard className="rounded-[18px] bg-white p-6 text-left text-[#0a0a0f]" style={{ boxShadow: "0 16px 40px rgba(255,255,255,0.08)" }}>
              <p className="text-xs text-[#666]">Annual · save 50%</p>
              <p className="mt-1.5 text-3xl font-extrabold">
                {annualPriceLabel}
                <span className="ml-1.5 text-xs font-normal text-[#999] line-through">{annualListPriceLabel}</span>
              </p>
              <ul className="mt-3.5 space-y-1.5 text-xs text-[#555]">
                <li className="flex items-center gap-1.5"><Check size={13} />Unlimited memories</li>
                <li className="flex items-center gap-1.5"><Check size={13} />AI chat</li>
                <li className="flex items-center gap-1.5"><Check size={13} />Priority support</li>
              </ul>
            </TiltCard>
          </motion.div>
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="border-t border-[#1e1e26] px-8 py-16 sm:px-12" style={{ background: "#0a0a0f" }}>
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="text-xs font-semibold tracking-[0.15em] text-brand-primary">
          QUESTIONS
        </motion.p>
        <motion.h2 initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="mb-8 mt-2 text-2xl font-bold tracking-tight">
          Frequently asked questions
        </motion.h2>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.05 }} variants={stagger} className="mx-auto max-w-2xl">
          {FAQS.map((item) => (
            <motion.div key={item.q} variants={fadeUp}>
              <FaqItem q={item.q} a={item.a} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Closing CTA */}
      <section className="relative overflow-hidden border-t border-[#1e1e26] px-8 py-20 text-center" style={{ background: "#0a0a0f" }}>
        <div
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
          style={{ width: 500, height: 260, background: "radial-gradient(ellipse at center, rgba(79,110,247,0.2), transparent 70%)" }}
        />
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }} variants={stagger} className="relative">
          <motion.h2 variants={fadeUp} className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Ready to remember
            <br />
            everything that matters?
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-3 text-sm text-[#8a8a99]">
            Free for {trialMonths} months. No card needed to start.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8">
            <PillButton />
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#1e1e26] px-8 py-6 text-xs text-[#5a5a66] sm:flex-row" style={{ background: "#0a0a0f" }}>
        <span>© {new Date().getFullYear()} {APP_NAME}</span>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <a href="mailto:hello@strivo.ai" className="hover:text-white">Contact</a>
        </div>
      </footer>
    </div>
  );
}
