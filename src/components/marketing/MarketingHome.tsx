"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import {
  Mic,
  Brain,
  MessageCircle,
  Bell,
  Lightbulb,
  BookOpen,
  Briefcase,
  HeartHandshake,
  Check,
  Smartphone,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

// Subtle film-grain texture (SVG turbulence), used at very low opacity over
// dark sections so they don't read as flat digital gradients. Purely
// decorative — aria-hidden, no layout impact.
function Grain({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity }} aria-hidden>
      <filter id="grain-filter">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-filter)" />
    </svg>
  );
}

// "Aurora" background — several oversized, heavily-blurred color blobs that
// slowly drift and shift hue, blended together so they read as one living
// sheet of light rather than separate circles. This is the technique
// behind most premium dark-mode AI product heroes (Aurora/Spotlight-style
// components popularized by the Aceternity/Magic UI component ecosystem on
// 21st.dev) — built here directly in CSS so it stays a single dependency
// (Framer Motion) rather than pulling in a whole external UI kit.
function Aurora() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="animate-aurora-drift absolute -inset-[40%] opacity-95 mix-blend-screen" style={{
        backgroundImage:
          "radial-gradient(ellipse 40% 30% at 20% 30%, rgba(79,110,247,0.9), transparent 60%)," +
          "radial-gradient(ellipse 35% 25% at 75% 20%, rgba(124,58,237,0.95), transparent 60%)," +
          "radial-gradient(ellipse 45% 35% at 60% 70%, rgba(217,70,239,0.7), transparent 60%)," +
          "radial-gradient(ellipse 30% 25% at 15% 75%, rgba(79,110,247,0.75), transparent 60%)",
        filter: "blur(50px)",
      }} />
    </div>
  );
}

// A soft radial highlight that follows the cursor across a dark section —
// makes the surface feel responsive/alive rather than static. Position is
// tracked via CSS custom properties so the browser can composite it purely
// on the GPU (no React re-renders per mouse move).
function Spotlight({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  function handleMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }
  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      className={`absolute inset-0 opacity-60 transition-opacity duration-500 hover:opacity-100 ${className}`}
      style={{
        background: "radial-gradient(600px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(255,255,255,0.08), transparent 70%)",
      }}
    />
  );
}

// A button/card that visually "leans toward" the cursor as it approaches —
// a small magnetic-pull effect. Spring-damped so it feels physical rather
// than snapping. Resets to center on mouse leave.
function Magnetic({ children, strength = 0.3 }: { children: React.ReactNode; strength?: number }) {
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
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ x: springX, y: springY }}
      className="inline-block"
    >
      {children}
    </motion.div>
  );
}

// 3D card tilt that tracks the cursor position (not just a fixed hover
// angle) — the card leans away from wherever the pointer actually is,
// spring-damped back to flat on leave. This is what gives the value-prop
// and pricing cards their "premium, physical" feel.
function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
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
    rotateY.set(px * 14);
    rotateX.set(py * -14);
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
      style={{ rotateX: springRX, rotateY: springRY, transformStyle: "preserve-3d" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// The public marketing homepage at strivo.ai — the ONLY thing a browser
// visitor ever sees. The real app (voice recording, chat, memories) lives
// behind the native Android app now; this page's only job is to sell that
// download. See src/app/app/page.tsx for where the app itself now lives,
// and capacitor.config.ts for how the native shell skips this page
// entirely and opens straight to /app.
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=ai.strivo.app";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

function DownloadButton({ className = "", big = false }: { className?: string; big?: boolean }) {
  return (
    <Magnetic strength={0.25}>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`group relative inline-flex items-center gap-2.5 rounded-2xl bg-gradient-brand text-white font-semibold shadow-[0_8px_30px_rgba(124,58,237,0.35)] transition-shadow hover:shadow-[0_12px_40px_rgba(124,58,237,0.5)] active:scale-[0.98] ${
          big ? "px-8 py-4 text-base" : "px-6 py-3.5 text-sm"
        } ${className}`}
      >
        <span className="absolute inset-0 rounded-2xl animate-pulse-ring" aria-hidden />
        <Smartphone size={big ? 20 : 18} />
        Get {APP_NAME} on Google Play
        <ArrowRight size={big ? 18 : 16} className="transition-transform group-hover:translate-x-1" />
      </a>
    </Magnetic>
  );
}

// A tiny looping "product demo" inside the hero — waveform bars pulse as
// if listening, then a chat bubble fades in with the AI's reply. This
// replaces a static mockup with something that actually shows what the
// app does in five seconds, which sells the product far better than an
// abstract phone silhouette.
function VoiceDemo() {
  const bars = [10, 22, 14, 28, 18, 24, 12, 20];
  return (
    <div className="relative mx-auto mt-16 w-72 rounded-3xl border border-white/15 bg-white/[0.06] p-5 text-left backdrop-blur-md">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand-secondary animate-pulse" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-white/50">Listening</span>
      </div>
      <div className="flex h-14 items-end gap-1.5">
        {bars.map((h, i) => (
          <span
            key={i}
            className="w-2 rounded-full bg-gradient-brand"
            style={{
              height: `${h}px`,
              animation: `bar-pulse 0.9s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.09}s`,
            }}
          />
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.5, repeat: Infinity, repeatDelay: 3.5, repeatType: "reverse" }}
        className="mt-4 rounded-2xl rounded-bl-sm bg-white/10 px-3.5 py-2.5 text-xs text-white/90"
      >
        Got it — saved. I&apos;ll remember that for you.
      </motion.div>
    </div>
  );
}

const VALUE_PROPS = [
  { icon: Mic, title: "Just speak", body: "No typing. Capture a thought, a memory, or an idea in seconds." },
  { icon: Brain, title: "It remembers", body: "Every memory organized, tagged, and instantly searchable." },
  { icon: MessageCircle, title: "Ask anything", body: "Chat with an AI that actually knows your history." },
  { icon: Bell, title: "Gentle nudges", body: "Quiet reminders to check in with yourself, on your schedule." },
];

const USE_CASES = [
  { icon: Lightbulb, title: "Capture ideas on the go" },
  { icon: BookOpen, title: "Journal your day by voice" },
  { icon: Briefcase, title: "Prep for interviews" },
  { icon: HeartHandshake, title: "Remember what people tell you" },
];

const STEPS = [
  { n: 1, title: "Open Strivo" },
  { n: 2, title: "Tap record, speak" },
  { n: 3, title: "Strivo organizes it" },
  { n: 4, title: "Ask, anytime" },
];

const TESTIMONIALS = [
  { initials: "RS", name: "Riya S.", quote: "I talk to Strivo like a journal, and it actually recalls things I told it weeks ago." },
  { initials: "AK", name: "Arjun K.", quote: "Faster than writing anything down. It just gets what I mean." },
  { initials: "MP", name: "Meera P.", quote: "Used it to prep for an interview by recalling my own past answers. Wild." },
  { initials: "DG", name: "Dev G.", quote: "My dad uses it daily now. Simplest app on his phone by far." },
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
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const orb1Y = useTransform(heroProgress, [0, 1], [0, -60]);
  const orb2Y = useTransform(heroProgress, [0, 1], [0, 80]);
  const phoneY = useTransform(heroProgress, [0, 1], [0, 120]);
  const heroFade = useTransform(heroProgress, [0, 0.8], [1, 0]);

  return (
    <div className="min-h-screen bg-bg text-ink overflow-x-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-extrabold tracking-tight">{APP_NAME}</span>
          </div>
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Get the app
          </a>
        </div>
      </header>

      {/* Hero */}
      <section
        ref={heroRef}
        className="relative overflow-hidden px-6 pb-24 pt-20 text-center text-white"
        style={{ background: "linear-gradient(155deg, #120a2e 0%, #1c0f45 30%, #241068 55%, #171246 78%, #0a0f2e 100%)" }}
      >
        <Spotlight />
        <Aurora />
        <Grain opacity={0.04} />
        <motion.span
          style={{ y: orb1Y }}
          className="pointer-events-none absolute -left-24 top-[10%] h-72 w-72 rounded-full bg-brand-secondary/30 blur-3xl animate-float-blob"
        />
        <motion.span
          style={{ y: orb2Y }}
          className="pointer-events-none absolute -right-20 top-[45%] h-80 w-80 rounded-full bg-brand-primary/35 blur-3xl animate-float-blob"
        />

        <motion.div style={{ opacity: heroFade }} initial="hidden" animate="show" variants={stagger} className="relative mx-auto max-w-xl">
          <motion.div
            variants={fadeUp}
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80"
          >
            Now on Google Play
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Speak it once.{" "}
            <span
              className="animate-shimmer-text bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(110deg, #8ea6ff 20%, #f0abfc 40%, #c4b5fd 60%, #8ea6ff 80%)",
                backgroundSize: "200% auto",
              }}
            >
              {APP_NAME} never forgets.
            </span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-md text-lg text-white/70">
            {APP_TAGLINE}
          </motion.p>
          <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center gap-3">
            <DownloadButton big />
            <span className="text-xs text-white/50">Free for 2 months · no card needed · cancel anytime</span>
          </motion.div>
        </motion.div>

        {/* Live product demo */}
        <motion.div style={{ y: phoneY }} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }} className="relative">
          <VoiceDemo />
        </motion.div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} className="mx-auto mb-14 max-w-lg text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-primary">What {APP_NAME} offers</p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">One app, every memory, one conversation away</h2>
        </motion.div>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {VALUE_PROPS.map((v) => (
            <motion.div key={v.title} variants={fadeUp}>
              <TiltCard className="rounded-2xl border border-border bg-surface p-5 shadow-card transition-shadow hover:shadow-lg">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary-soft">
                  <v.icon size={19} className="text-brand-primary" />
                </div>
                <p className="text-sm font-semibold">{v.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{v.body}</p>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Use cases */}
      <section className="px-6 py-20" style={{ background: "linear-gradient(180deg, transparent, var(--color-brand-primary-soft) 40%, transparent)" }}>
        <div className="mx-auto max-w-5xl">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} className="mx-auto mb-14 max-w-lg text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-secondary">Top use cases</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Built around how you already think</h2>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
            className="grid grid-cols-2 gap-4 sm:grid-cols-4"
          >
            {USE_CASES.map((u) => (
              <motion.div
                key={u.title}
                variants={fadeUp}
                whileHover={{ y: -4 }}
                className="rounded-2xl bg-surface p-5 shadow-card"
              >
                <u.icon size={20} className="text-brand-primary" />
                <p className="mt-3 text-sm font-semibold leading-snug">{u.title}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How it works — flowchart */}
      <section className="mx-auto max-w-3xl px-6 py-24">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} className="mx-auto mb-16 max-w-lg text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-primary">How it works</p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Four steps, no learning curve</h2>
        </motion.div>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={stagger}
          className="relative flex items-start justify-between"
        >
          <div
            className="absolute left-[12%] right-[12%] top-[19px] h-0.5"
            style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--color-brand-primary-soft) 0 8px, transparent 8px 16px)" }}
          />
          {STEPS.map((s) => (
            <motion.div key={s.n} variants={fadeUp} className="relative flex-1 px-1 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand text-sm font-bold text-white ring-8 ring-bg">
                {s.n}
              </div>
              <p className="text-xs font-semibold sm:text-sm">{s.title}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Testimonials */}
      <section className="px-6 py-20" style={{ background: "linear-gradient(180deg, transparent, var(--color-brand-secondary-soft) 40%, transparent)" }}>
        <div className="mx-auto max-w-5xl">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} className="mx-auto mb-14 max-w-lg text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-secondary">What people say</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Loved by early users</h2>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
            variants={stagger}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            {TESTIMONIALS.map((t) => (
              <motion.div key={t.name} variants={fadeUp} className="rounded-2xl bg-surface p-5 shadow-card">
                <p className="text-sm leading-relaxed text-ink">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-4 flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-brand text-[11px] font-semibold text-white">
                    {t.initials}
                  </div>
                  <span className="text-xs font-medium text-ink-soft">{t.name}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} className="mx-auto mb-14 max-w-lg">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-primary">Simple pricing</p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Free for {trialMonths} months, then</h2>
        </motion.div>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <motion.div variants={fadeUp} className="w-full max-w-[200px]">
            <TiltCard className="rounded-2xl border border-border bg-surface p-6 text-left shadow-card">
              <p className="text-xs text-ink-soft">Monthly</p>
              <p className="mt-1 text-2xl font-extrabold">{monthlyPriceLabel}</p>
              <ul className="mt-4 space-y-1.5 text-xs text-ink-soft">
                <li className="flex items-center gap-1.5"><Check size={13} className="text-success" />Unlimited memories</li>
                <li className="flex items-center gap-1.5"><Check size={13} className="text-success" />AI chat</li>
              </ul>
            </TiltCard>
          </motion.div>
          <motion.div variants={fadeUp} className="w-full max-w-[200px]">
            <TiltCard className="rounded-2xl border-2 border-brand-primary bg-gradient-brand p-6 text-left text-white shadow-[0_12px_30px_rgba(124,58,237,0.3)]">
              <p className="text-xs text-white/80">Annual · save 50%</p>
              <p className="mt-1 text-2xl font-extrabold">
                {annualPriceLabel}
                <span className="ml-1.5 text-xs font-normal text-white/60 line-through">{annualListPriceLabel}</span>
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-white/85">
                <li className="flex items-center gap-1.5"><Check size={13} />Unlimited memories</li>
                <li className="flex items-center gap-1.5"><Check size={13} />AI chat</li>
                <li className="flex items-center gap-1.5"><Check size={13} />Priority support</li>
              </ul>
            </TiltCard>
          </motion.div>
        </motion.div>
      </section>

      {/* Closing CTA */}
      <section
        className="relative overflow-hidden px-6 py-20 text-center text-white"
        style={{ background: "linear-gradient(155deg, #171246 0%, #241068 50%, #120a2e 100%)" }}
      >
        <Spotlight />
        <Grain opacity={0.04} />
        <span className="pointer-events-none absolute left-1/2 top-[-20%] h-64 w-96 -translate-x-1/2 rounded-full bg-brand-primary/40 blur-3xl animate-float-blob" />
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }} variants={stagger} className="relative mx-auto max-w-md">
          <motion.h2 variants={fadeUp} className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to remember everything?
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-3 text-sm text-white/70">
            Free for {trialMonths} months. No card needed to start.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex justify-center">
            <DownloadButton big />
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-xs text-ink-faint sm:flex-row">
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-ink-soft">Privacy</Link>
            <Link href="/terms" className="hover:text-ink-soft">Terms</Link>
            <a href="mailto:hello@strivo.ai" className="hover:text-ink-soft">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
