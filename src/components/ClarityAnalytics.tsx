"use client";
import Script from "next/script";

// Microsoft Clarity -- heatmaps + session recordings for the marketing
// site, added 2026-09-27 to answer "5,000 visitors, only 4-5 downloads --
// where in the homepage is everyone dropping off?" (GA4 can say HOW MANY
// clicked "Get the app"; it can't show WHY the rest didn't). Project:
// "Strivo Homepage" in the founder's Clarity account.
//
// Loaded the same way as GA4 (see GoogleAnalytics.tsx) -- unconditional,
// no consent-gate -- for the same reason: this is anonymized behavioral
// analytics (where people click/scroll/rage-click), not ad tracking, and
// Clarity additionally masks all sensitive page content by default. Kept
// as its own component (rather than folded into GoogleAnalytics.tsx) so
// either tag can be swapped or removed independently later.
const CLARITY_PROJECT_ID = "yoow5s3zuo";

export default function ClarityAnalytics() {
  return (
    <Script
      id="clarity-init"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
`,
      }}
    />
  );
}
