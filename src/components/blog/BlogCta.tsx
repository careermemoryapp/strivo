import Link from "next/link";
import { PlayStoreLink } from "@/components/PlayStoreLink";
import { APP_NAME, SINGULAR_TRACKING_LINK } from "@/lib/config";

// The banner every blog post ends with — the whole point of the blog is
// to rank for career-search keywords and funnel that traffic into the
// actual product, so this is deliberately the same dark/purple-blue brand
// treatment as the marketing homepage's CTA, not a muted "by the way" box.
export function BlogCta() {
  return (
    <div
      className="mt-14 rounded-2xl border border-[#2a2a35] p-8 text-center"
      style={{ background: "linear-gradient(135deg,#160a26,#0a0a0f)" }}
    >
      <p className="text-xs font-semibold tracking-[0.15em] text-brand-primary">YOUR AI CAREER MEMORY</p>
      <h3 className="mx-auto mt-3 max-w-md text-2xl font-bold tracking-tight text-white">
        {APP_NAME} turns what you say into the story you need, exactly when you need it.
      </h3>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#a0a0ac]">
        Speak it once. Get the right interview story, resume bullet, or leadership example back, instantly. Free for
        2 months, no card needed.
      </p>
      <PlayStoreLink location="blog_cta" href={SINGULAR_TRACKING_LINK} size="md" className="mt-6" />
      {/* Added 2026-10-01: a lower-commitment first step for anyone not
          ready to install an app from a blog post -- the no-login quiz at
          /quiz was previously only linked from the homepage. */}
      <Link
        href="/quiz"
        className="mt-4 block text-xs text-[#6a6a75] underline-offset-2 hover:text-white hover:underline"
      >
        Not ready to install? Take the free 2-minute career quiz instead &rarr;
      </Link>
    </div>
  );
}
