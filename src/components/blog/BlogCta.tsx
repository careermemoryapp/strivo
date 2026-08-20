import { PLAY_STORE_URL, APP_NAME } from "@/lib/config";

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
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-block rounded-full bg-white px-8 py-3.5 text-sm font-bold text-[#0a0a0f] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
        style={{ boxShadow: "0 8px 24px rgba(255,255,255,0.15)" }}
      >
        Get {APP_NAME} free →
      </a>
    </div>
  );
}
