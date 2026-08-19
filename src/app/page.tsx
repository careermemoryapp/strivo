import { MarketingHome } from "@/components/marketing/MarketingHome";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { MONTHLY_PRICE_LABEL, ANNUAL_PRICE_LABEL, ANNUAL_LIST_PRICE_LABEL, TRIAL_MONTHS } from "@/lib/repo/users";

// strivo.ai's public root — a marketing-only page for browser visitors.
// The real app (record/chat/memories) now lives at /app, and the native
// Capacitor shell points straight there (see capacitor.config.ts), so
// people using the actual app never see this page. Pricing labels are
// imported from the same source of truth the app itself uses, so this
// page can't drift out of sync if pricing changes later.
export const metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description: APP_TAGLINE,
};

export default function RootPage() {
  return (
    <MarketingHome
      trialMonths={TRIAL_MONTHS}
      monthlyPriceLabel={MONTHLY_PRICE_LABEL}
      annualPriceLabel={ANNUAL_PRICE_LABEL}
      annualListPriceLabel={ANNUAL_LIST_PRICE_LABEL}
    />
  );
}
