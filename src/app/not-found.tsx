import Link from "next/link";
import { LogoMark } from "@/components/Logo";

// Next.js renders this for any route that doesn't match a page (including
// a mistyped/removed URL, or an old bookmarked/shared link) instead of its
// own bare, unbranded default. Deliberately links to /app rather than "/"
// -- /app is the smart entry point (see src/app/app/page.tsx) that sends a
// signed-in person to /home and everyone else to the marketing /welcome
// page, so this works the same whether the visitor is logged in or not.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <LogoMark size={40} />
      <h1 className="mt-5 text-[22px] font-bold text-ink">Page not found</h1>
      <p className="mt-1.5 max-w-xs text-[13px] text-ink-soft">
        That page doesn&apos;t exist, or the link may be out of date.
      </p>
      <Link
        href="/app"
        className="mt-6 rounded-pill px-5 py-3 text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
      >
        Back to Strivo
      </Link>
    </div>
  );
}
