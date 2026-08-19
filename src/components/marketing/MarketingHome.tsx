"use client";

import { motion, type Variants } from "framer-motion";
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
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2.5 rounded-2xl bg-gradient-brand text-white font-semibold shadow-[0_8px_30px_rgba(124,58,237,0.35)] transition-transform hover:-translate-y-0.5 active:scale-[0.98] ${
        big ? "px-8 py-4 text-base" : "px-6 py-3.5 text-sm"
      } ${className}`}
    >
      <Smartphone size={big ? 20 : 18} />
      Get {APP_NAME} on Google Play
      <ArrowRight size={big ? 18 : 16} className="transition-transform group-hover:translate-x-1" />
    </a>
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
        className="relative overflow-hidden px-6 pb-24 pt-20 text-center text-white"
        style={{ background: "linear-gradient(155deg, #120a2e 0%, #1c0f45 30%, #241068 55%, #171246 78%, #0a0f2e 100%)" }}
      >
        <span className="pointer-events-none absolute -left-24 top-[10%] h-72 w-72 rounded-full bg-brand-secondary/40 blur-3xl animate-float-blob" />
        <span
          className="pointer-events-none absolute -right-20 top-[45%] h-80 w-80 rounded-full bg-brand-primary/45 blur-3xl animate-float-blob"
          style={{ animationDelay: "-3s" }}
        />
        <span
          className="pointer-events-none absolute left-[15%] bottom-[-10%] h-64 w-64 rounded-full bg-fuchsia-500/30 blur-3xl animate-float-blob"
          style={{ animationDelay: "-6s" }}
        />

        <motion.div initial="hidden" animate="show" variants={stagger} className="relative mx-auto max-w-xl">
          <motion.div
            variants={fadeUp}
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80"
          >
            Now on Google Play
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Speak it once.{" "}
            <span className="bg-gradient-to-r from-[#8ea6ff] via-[#c4b5fd] to-[#f0abfc] bg-clip-text text-transparent">
              {APP_NAME} never forgets.
            </span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-md text-base text-white/70">
            {APP_TAGLINE}
          </motion.p>
          <motion.div variants={fadeUp} className="mt-9 flex justify-center">
            <DownloadButton big />
          </motion.div>
        </motion.div>

        {/* Floating phone card */}
        <motion.div
          initial={{ opacity: 0, y: 40, rotateX: 8, rotateY: -10 }}
          animate={{ opacity: 1, y: 0, rotateX: 8, rotateY: -10 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto mt-16 w-56 rounded-3xl border border-white/15 bg-white/[0.06] p-5 text-left backdrop-blur-md animate-float-blob"
          style={{ transformStyle: "preserve-3d", perspective: "800px" }}
        >
          <div className="mb-3 h-2 w-14 rounded-full bg-gradient-brand" />
          <div className="mb-2 h-1.5 w-4/5 rounded-full bg-white/15" />
          <div className="mb-2 h-1.5 w-3/5 rounded-full bg-white/15" />
          <div className="h-1.5 w-2/5 rounded-full bg-white/15" />
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
            <motion.div
              key={v.title}
              variants={fadeUp}
              whileHover={{ y: -6, rotateX: 4, rotateY: -4 }}
              style={{ transformStyle: "preserve-3d" }}
              className="rounded-2xl border border-border bg-surface p-5 shadow-card transition-shadow hover:shadow-lg"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary-soft">
                <v.icon size={19} className="text-brand-primary" />
              </div>
              <p className="text-sm font-semibold">{v.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{v.body}</p>
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
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -4 }}
            className="w-full max-w-[200px] rounded-2xl border border-border bg-surface p-6 text-left shadow-card"
          >
            <p className="text-xs text-ink-soft">Monthly</p>
            <p className="mt-1 text-2xl font-extrabold">{monthlyPriceLabel}</p>
            <ul className="mt-4 space-y-1.5 text-xs text-ink-soft">
              <li className="flex items-center gap-1.5"><Check size={13} className="text-success" />Unlimited memories</li>
              <li className="flex items-center gap-1.5"><Check size={13} className="text-success" />AI chat</li>
            </ul>
          </motion.div>
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -6 }}
            className="w-full max-w-[200px] rounded-2xl border-2 border-brand-primary bg-gradient-brand p-6 text-left text-white shadow-[0_12px_30px_rgba(124,58,237,0.3)]"
          >
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
          </motion.div>
        </motion.div>
      </section>

      {/* Closing CTA */}
      <section
        className="relative overflow-hidden px-6 py-20 text-center text-white"
        style={{ background: "linear-gradient(155deg, #171246 0%, #241068 50%, #120a2e 100%)" }}
      >
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
