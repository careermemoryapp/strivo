import Link from "next/link";
import { Instagram, Linkedin } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { PlayStoreLink } from "@/components/PlayStoreLink";
import { APP_NAME, SINGULAR_TRACKING_LINK } from "@/lib/config";

// Extracted 2026-10-11 from MarketingHome.tsx -- direct founder feedback on
// the blog pages: "the blog top bar should be same as the top bar of the
// marketing page." Both blog pages (the index and individual posts) had
// their own simplified header (plain "Blog" text instead of a link, no
// social icons) that had drifted from the real homepage nav. Now all three
// pages render this exact same component, so there's one header to keep in
// sync instead of three.

// Strivo's official social accounts -- shown as icon links in the header
// and footer. Kept as one list so both spots can't drift out of sync.
export const SOCIAL_LINKS = [
  { name: "X", href: "https://x.com/Strivo_ai" },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/strivo-ai/" },
  { name: "Instagram", href: "https://www.instagram.com/strivo.ai" },
] as const;

// lucide-react's "Twitter" icon is the retired bird logo -- this is the
// current X wordmark glyph instead, drawn inline so it stays accurate.
export function XLogoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function SocialLinks({ className = "" }: { className?: string }) {
  const icons = { X: XLogoIcon, LinkedIn: Linkedin, Instagram: Instagram } as const;
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {SOCIAL_LINKS.map((s) => {
        const Icon = icons[s.name];
        return (
          <a
            key={s.name}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${APP_NAME} on ${s.name}`}
            className="text-[#888] transition-colors hover:text-white"
          >
            <Icon size={16} />
          </a>
        );
      })}
    </div>
  );
}

// Sticky -- see the original comment on this in MarketingHome.tsx (2026-09-26,
// the funnel diagnosis that day): keeps "Get the app" on screen the whole
// time someone's on the page, not just before they start scrolling. One real
// button (solid white pill) rather than a low-contrast gray text link. This
// is the one CTA present on literally every page -- home, blog list, every
// blog post -- the highest-leverage place to fix visibility.
//
// `navLocation` lets each page keep its own PlayStoreLink analytics tag
// ("nav" on the homepage, "blog_nav" on the blog index, "blog_post_nav" on a
// post) while sharing the exact same markup and styling everywhere.
export function MarketingHeader({ navLocation = "nav" }: { navLocation?: string }) {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between border-b border-[#1e1e26] px-5 py-5 sm:px-8"
      style={{ background: "#0a0a0f" }}
    >
      <Link href="/" className="flex shrink-0 items-center gap-2.5">
        <LogoMark size={28} />
        <span className="hidden text-[15px] font-extrabold tracking-tight sm:inline">{APP_NAME.toUpperCase()}</span>
      </Link>
      <div className="flex items-center gap-3 sm:gap-5">
        <Link href="/blog" className="text-xs font-medium text-[#888] hover:text-white">
          Blog
        </Link>
        <SocialLinks className="hidden sm:flex" />
        <PlayStoreLink location={navLocation} href={SINGULAR_TRACKING_LINK} size="sm" />
      </div>
    </header>
  );
}
