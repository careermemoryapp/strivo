"use client";
import Script from "next/script";
import { CONSENT_STORAGE_KEY } from "./CookieConsent";

const GA_MEASUREMENT_ID = "G-D9XNPG16TH";

// Loads gtag.js behind Google's Consent Mode. Everything here runs as one
// plain-JS inline script (not React state) so there's no server/client
// hydration mismatch to worry about -- it reads localStorage directly at
// execution time. Default is always "denied"; if a returning visitor
// already accepted on a previous visit, it starts "granted" immediately.
// A fresh "granted" decision (first-time Accept click) is sent afterward
// by CookieConsent.tsx via `gtag('consent', 'update', ...)`.
export default function GoogleAnalytics() {
  return (
    <Script
      id="ga4-init"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
var stored = localStorage.getItem('${CONSENT_STORAGE_KEY}');
var state = stored === 'granted' ? 'granted' : 'denied';
gtag('consent', 'default', {
  ad_storage: state,
  ad_user_data: state,
  ad_personalization: state,
  analytics_storage: state
});
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });
var s = document.createElement('script');
s.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';
s.async = true;
document.head.appendChild(s);
`,
      }}
    />
  );
}
