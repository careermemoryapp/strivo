"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring, type Variants } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { APP_NAME } from "@/lib/config";

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
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=ai.strivo.app";

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
        className="flex flex-col items-center justify-center gap-4 text-center"
        style={{ background: "linear-gradient(160deg,#1c1435,#150c2e)", height: 340 }}
      >
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
    </PhoneFrame>
  );
}

function CreateMemoryScreenMock() {
  return (
    <PhoneFrame width={200} glow="0 24px 60px rgba(0,0,0,0.35)">
      <div className="px-4 py-5 text-left" style={{ height: 340 }}>
        <p className="mb-2 text-[9px] font-bold uppercase tracking-wide text-[#a8a2bd]">Transcript</p>
        <p className="mb-4 text-[11px] leading-relaxed text-[#3c3650]">
          &quot;...led the launch when two teammates were out, shipped on time...&quot;
        </p>
        <div className="inline-block rounded-full px-4 py-2 text-[11px] font-bold text-white" style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}>
          Create Memory
        </div>
      </div>
    </PhoneFrame>
  );
}

function ChatScreenMock() {
  return (
    <PhoneFrame width={200} glow="0 24px 60px rgba(0,0,0,0.35)">
      <div className="px-4 py-5" style={{ height: 340 }}>
        <div className="rounded-xl rounded-bl-sm bg-[#f2effa] p-3 text-[11px] leading-relaxed text-[#3c3650]">
          A time I showed leadership?
        </div>
        <div className="mt-2 rounded-xl rounded-br-sm p-3 text-[11px] leading-relaxed text-white" style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}>
          In March you led the launch solo.
        </div>
      </div>
    </PhoneFrame>
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

const TESTIMONIALS = [
  { name: "Riya S.", quote: "I talk to Strivo like a journal, and it actually recalls things I told it weeks ago." },
  { name: "Arjun K.", quote: "Faster than writing anything down. It just gets what I mean." },
  { name: "Meera P.", quote: "Used it to prep for an interview by recalling my own past answers. Wild." },
  { name: "Dev G.", quote: "My dad uses it daily now. Simplest app on his phone by far." },
];

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
  return (
    <div id="marketing-root" className="min-h-screen font-sans text-white" style={{ background: "#0a0a0f" }}>
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-[#1e1e26] px-8 py-5" style={{ background: "#0a0a0f" }}>
        <div className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[15px] font-extrabold tracking-tight">{APP_NAME.toUpperCase()}</span>
        </div>
        <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#888] hover:text-white">
          Get the app →
        </a>
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
          <p className="mt-3 text-xs text-[#5a5a66]">The actual Strivo home screen</p>
        </motion.div>
      </section>

      {/* Value props */}
      <section className="border-t border-[#1e1e26] px-8 py-16 sm:px-12" style={{ background: "#0a0a0f" }}>
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="text-xs font-semibold tracking-[0.15em] text-brand-secondary">
          WHAT STRIVO OFFERS
        </motion.p>
        <motion.h2 initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="mb-2 mt-2 max-w-md text-2xl font-bold tracking-tight">
          Four things, working together every day
        </motion.h2>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }} variants={stagger} className="mt-8">
          {VALUE_PROPS.map((v, i) => (
            <motion.div key={v.n} variants={fadeUp} className={`flex items-start gap-4 border-t border-[#1e1e26] py-6 ${i === VALUE_PROPS.length - 1 ? "border-b" : ""}`}>
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#2a2a35] bg-[#161620] text-[10px] text-brand-secondary">{v.n}</span>
              <div>
                <p className="text-lg font-bold text-white">{v.title}</p>
                <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-[#8a8a99]">{v.body}</p>
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

      {/* Testimonials */}
      <section className="border-t border-[#1e1e26] px-8 py-16 sm:px-12" style={{ background: "#0a0a0f" }}>
        <motion.p initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp} className="mb-8 text-xs font-semibold tracking-[0.15em] text-brand-primary">
          LOVED BY EARLY USERS
        </motion.p>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }} variants={stagger} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TESTIMONIALS.map((t) => (
            <motion.div key={t.name} variants={fadeUp} className="rounded-2xl border border-[#2a2a35] p-5">
              <p className="mb-1 text-2xl leading-none text-[#5a4a99]">&ldquo;</p>
              <p className="text-sm leading-relaxed text-white">{t.quote}</p>
              <p className="mt-3 text-xs text-[#8a8a99]">— {t.name}</p>
            </motion.div>
          ))}
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
