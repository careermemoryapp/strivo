"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PLAY_STORE_URL } from "@/lib/config";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// Every "Get the app" / Play Store link on the marketing site and blog goes
// through this component instead of a raw <a href={PLAY_STORE_URL}>. It
// fires a `google_play_click` GA4 event on click, tagged with WHICH link was
// clicked (location) and the page it was clicked from.
//
// Added 2026-09-26: this is the missing instrumentation flagged in the
// traffic-vs-downloads diagnosis that day -- GA4 was showing real visits
// (thousands of sessions) but 0 key events, so there was no way to tell
// whether visitors were even clicking through toward the Play Store, let
// alone installing once they got there (GA4 can't see the install itself --
// that only shows up in Play Console's own acquisition/referrer reports).
// Without this event, "people visit but don't download" was a guess, not a
// measured fact.
//
// One-time manual step after this is deployed and has received at least one
// real click: GA4 Admin -> Data display -> Events -> find `google_play_click`
// in the list (can take a few hours to first appear) -> toggle "Mark as key
// event". That flip can only be done in the GA4 UI, not from code.
//
// iOS/iPadOS handling -- added 2026-09-28, direct founder call: this link
// used to go straight to the Play Store for EVERY visitor, so an iPhone/iPad
// visitor who clicked it landed on a listing they can't install from --
// wasted click, no way to follow up with them once iOS ships. Now detected
// client-side (isIOSDevice below) and swapped for an "iOS coming soon" email
// capture instead (see api/ios-waitlist and repo/iosWaitlist.ts). Detection
// is gated behind useIsClient (below) so server-rendered HTML always matches
// the client's first paint -- the Play Store link is what server-rendered
// HTML and non-iOS visitors always see; only iOS/iPadOS visitors flip to the
// waitlist prompt, right after hydration.
function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ identifies itself as "Macintosh" (desktop-Safari UA
  // spoofing) -- touch capability is the only reliable way left to tell an
  // iPad apart from an actual Mac.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

// Client/hydration-safe flag: true only once React has hydrated in the
// browser, false during SSR and the first client render (so server and
// client markup match, then flips right after). useSyncExternalStore's
// getServerSnapshot/getSnapshot split is the sanctioned way to do this --
// a plain `useEffect(() => setState(true), [])` works too but triggers an
// extra cascading render this codebase's lint rules flag.
function subscribeNoop() {
  return () => {};
}
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

export function PlayStoreLink({
  location,
  href,
  className,
  style,
  children,
}: {
  // Short, stable label for which specific link this is (e.g. "hero",
  // "nav", "blog_cta") -- lets GA4 tell the hero button apart from the nav
  // link apart from the blog CTA, instead of lumping every click together.
  location: string;
  // Optional override for the destination -- defaults to the plain Play
  // Store URL. Pass a Singular tracking link (see SINGULAR_TRACKING_LINK in
  // lib/config.ts) for placements where install attribution matters; the
  // GA4 click event still fires the same way either way. Ignored on
  // iOS/iPadOS, which never reaches the Play Store link at all.
  href?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const isClient = useIsClient();
  const isIOS = isClient && isIOSDevice();

  if (!isIOS) {
    return (
      <a
        href={href ?? PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={style}
        onClick={() => {
          window.gtag?.("event", "google_play_click", {
            link_location: location,
            page_path: window.location.pathname,
          });
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        onClick={() => {
          window.gtag?.("event", "ios_waitlist_prompt_shown", {
            link_location: location,
            page_path: window.location.pathname,
          });
          setModalOpen(true);
        }}
      >
        iOS coming soon
      </button>
      {/* Portaled to document.body -- several placements this renders from
          (the hero's Magnetic wrapper, the sticky bar's slide-in transition)
          sit inside an ancestor with a CSS transform, which would otherwise
          hijack `position: fixed` and trap the modal in the wrong spot. */}
      {isClient && modalOpen && createPortal(<IOSWaitlistModal location={location} onClose={() => setModalOpen(false)} />, document.body)}
    </>
  );
}

function IOSWaitlistModal({ location, onClose }: { location: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/ios-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, location, pagePath: window.location.pathname }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      window.gtag?.("event", "ios_waitlist_signup", {
        link_location: location,
        page_path: window.location.pathname,
      });
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[#2a2a35] bg-[#0f0d16] p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-[#8a8592] transition-colors hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>

        {status === "success" ? (
          <>
            <p className="text-lg font-bold text-white">You&apos;re on the list</p>
            <p className="mt-2 text-sm leading-relaxed text-[#a8a2b3]">
              We&apos;ll email you the moment Strivo is ready on iOS.
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-white">iOS coming soon</p>
            <p className="mt-2 text-sm leading-relaxed text-[#a8a2b3]">
              Strivo is Android-only right now. Leave your email and we&apos;ll let you know the moment iOS is ready.
            </p>
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2.5">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-full border border-[#2a2a35] bg-[#17141f] px-4 py-3 text-center text-sm text-white placeholder:text-[#6a6475] focus:border-[#6d8bff] focus:outline-none"
              />
              {status === "error" && <p className="text-xs font-medium text-[#ff6b6b]">{errorMsg}</p>}
              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full rounded-full bg-white px-5 py-3 text-sm font-bold text-[#0a0a0f] transition-transform hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60"
              >
                {status === "submitting" ? "Joining…" : "Join the waitlist"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
