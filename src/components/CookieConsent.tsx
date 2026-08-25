"use client";
import { useEffect, useState } from "react";

export const CONSENT_STORAGE_KEY = "strivo-cookie-consent";

// Small helper other components (GoogleAnalytics) can read without needing
// React state -- just a plain localStorage lookup, safe to call during SSR
// (returns null when there's no window).
export function getStoredConsent(): "granted" | "denied" | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return v === "granted" || v === "denied" ? v : null;
}

// Accept/decline banner for the marketing site's GA4 tag. Shown once, on
// first visit, until a decision is stored. GoogleAnalytics.tsx already
// starts gtag in "denied" mode by default (Google Consent Mode), so nothing
// is tracked before someone actually clicks Accept here.
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getStoredConsent() === null);
  }, []);

  function decide(status: "granted" | "denied") {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, status);
    const w = window as typeof window & { gtag?: (...args: unknown[]) => void };
    w.gtag?.("consent", "update", {
      ad_storage: status,
      ad_user_data: status,
      ad_personalization: status,
      analytics_storage: status,
    });
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: "fixed",
        bottom: "16px",
        left: "16px",
        right: "16px",
        zIndex: 9999,
        maxWidth: "460px",
        margin: "0 auto",
        background: "#1f1b2e",
        color: "#fff",
        borderRadius: "14px",
        padding: "16px 18px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        fontSize: "14px",
        lineHeight: 1.5,
      }}
    >
      <p style={{ margin: 0 }}>
        We use cookies to understand how visitors use strivo.ai and improve the site. Nothing
        is tracked until you accept. See our{" "}
        <a href="/privacy" style={{ color: "#c4b5fd", textDecoration: "underline" }}>
          Privacy Policy
        </a>
        .
      </p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
        <button
          onClick={() => decide("denied")}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.3)",
            color: "#fff",
            borderRadius: "8px",
            padding: "8px 14px",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          Decline
        </button>
        <button
          onClick={() => decide("granted")}
          style={{
            background: "#7c3aed",
            border: "none",
            color: "#fff",
            borderRadius: "8px",
            padding: "8px 14px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
