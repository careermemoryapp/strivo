import { MarketingHome } from "@/components/marketing/MarketingHome";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { MONTHLY_PRICE_LABEL, ANNUAL_PRICE_LABEL, ANNUAL_LIST_PRICE_LABEL, TRIAL_MONTHS } from "@/lib/repo/users";

// strivo.ai's public root — a marketing-only page for browser visitors.
// The real app (record/chat/memories) now lives at /app, and the native
// Capacitor shell points straight there (see capacitor.config.ts), so
// people using the actual app never see this page. Pricing labels are
// imported from the same source of truth the app itself uses, so this
// page can't drift out of sync if pricing changes later.
const HOME_TITLE = `${APP_NAME} — Your AI Career Memory`;
const HOME_DESCRIPTION =
  "Speak it once and Strivo remembers. Turn meetings, wins, and reviews into a searchable memory bank, then get the right interview story, resume bullet, or leadership example, instantly. Free for 2 months.";

export const metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: { canonical: "https://strivo.ai" },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "https://strivo.ai",
  },
  twitter: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
};

// Force this route to render fresh on every request instead of Next's
// static Full Route Cache. That cache was observed serving
// `Cache-Control: s-maxage=31536000` + `x-nextjs-cache: HIT` on this route,
// which is a plausible source of stale content surviving redeploys — this
// removes that layer entirely so there's nothing to invalidate on deploy.
export const dynamic = "force-dynamic";

// Structured data so Google can render Strivo as a rich result (app name,
// category, rating-free price info) instead of a bare blue link. Kept to
// facts we can actually back up — no fabricated review counts/ratings.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: APP_NAME,
  description: APP_TAGLINE,
  url: "https://strivo.ai",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Android",
  offers: [
    {
      "@type": "Offer",
      name: "Monthly",
      price: MONTHLY_PRICE_LABEL.replace(/[^0-9.]/g, ""),
      priceCurrency: "USD",
    },
    {
      "@type": "Offer",
      name: "Annual",
      price: ANNUAL_PRICE_LABEL.replace(/[^0-9.]/g, ""),
      priceCurrency: "USD",
    },
  ],
};

export default function RootPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <MarketingHome
        trialMonths={TRIAL_MONTHS}
        monthlyPriceLabel={MONTHLY_PRICE_LABEL}
        annualPriceLabel={ANNUAL_PRICE_LABEL}
        annualListPriceLabel={ANNUAL_LIST_PRICE_LABEL}
      />
    </>
  );
}
