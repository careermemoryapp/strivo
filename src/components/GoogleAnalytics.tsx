"use client";
import Script from "next/script";
import { CONSENT_STORAGE_KEY } from "./CookieConsent";

// Corrected 2026-09-06: this was "G-D9XNPG16TH", which doesn't match the
// actual live web data stream's Google tag shown in GA4 admin (Admin > Data
// streams > this stream > Google tag) -- that's the authoritative source
// for the ID, not the one echoed on the Home "no data received" screen. The
// wrong ID here is why zero data ever reached GA4 regardless of the consent
// fix above: every hit was being sent to a stream Google wasn't listening
// on for this property.
const GA_MEASUREMENT_ID = "G-7XJBK501FH";

// Loads gtag.js behind Google's Consent Mode. Everything here runs as one
// plain-JS inline script (not React state) so there's no server/client
// hydration mismatch to worry about -- it reads localStorage directly at
// execution time.
//
// analytics_storage defaults to "granted" unconditionally -- this used to
// default to "denied" until a visitor clicked Accept on the banner, which
// meant literally ZERO pageviews (not even anonymized/aggregate ones)
// reached GA4 for anyone who didn't click through it. That's what caused
// GA4 to show 0 users despite real, confirmed launch traffic (email +
// LinkedIn + WhatsApp, 2026-09-06) -- the all-or-nothing gate, not a broken
// pipe. Basic anonymized measurement (anonymize_ip: true, no ads/
// remarketing) doesn't need opt-in consent for Strivo's audience (mostly
// India, under the DPDP Act rather than EU GDPR), so gating it behind a
// banner click was pure lost visibility for no real compliance benefit.
// ad_storage/ad_user_data/ad_personalization still default to "denied" and
// stay gated behind CookieConsent.tsx's Accept/Decline, since those genuinely
// are consent-relevant (ad personalization/remarketing) even though nothing
// uses them yet -- see decide() there for why it only ever touches those
// three, never analytics_storage.
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
var adState = stored === 'granted' ? 'granted' : 'denied';
gtag('consent', 'default', {
  ad_storage: adState,
  ad_user_data: adState,
  ad_personalization: adState,
  analytics_storage: 'granted'
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
