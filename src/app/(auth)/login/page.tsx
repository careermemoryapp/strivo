"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Browser } from "@capacitor/browser";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { APP_NAME } from "@/lib/config";

// Minimal shape of the global Capacitor injects into every page loaded
// inside the native app's WebView (including this remote strivo.ai page —
// the bridge is attached to the WebView itself, not to locally-bundled
// assets). Absent entirely on a normal desktop/mobile browser.
type CapacitorGlobal = { isNativePlatform?: () => boolean };
declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

function isNativeApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.92c1.71-1.57 2.68-3.88 2.68-6.64z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  // /api/auth/mobile-bridge sets this when it sends the system browser back
  // here so the *app's* handleGoogle (below) doesn't run — this instance of
  // the page is being viewed inside a real Chrome tab, not the app WebView,
  // so isNativeApp() is false here and the normal in-page NextAuth flow
  // (already proven to work in a real browser) just runs as-is.
  const callbackUrl = searchParams.get("callbackUrl") || "/home";

  async function handleGoogle() {
    setLoading(true);
    setError(null);

    // Google refuses to show its sign-in screen inside an embedded WebView
    // (which is what the Android app's Capacitor WebView is) — the
    // "Continue" button just renders disabled. So instead of navigating
    // this WebView to accounts.google.com, we hand the whole flow off to
    // the phone's system browser (a real Chrome, which Google allows), and
    // point its callbackUrl at /api/auth/mobile-bridge. That route hands a
    // one-time token back to this app via a deep link, and the app trades
    // it for a real session cookie inside its own WebView. See
    // MainActivity.java + /api/auth/mobile-bridge + /api/auth/mobile-consume.
    if (isNativeApp()) {
      const bridgeUrl = `${window.location.origin}/login?callbackUrl=${encodeURIComponent(
        "/api/auth/mobile-bridge"
      )}`;
      await Browser.open({ url: bridgeUrl });
      setLoading(false);
      return;
    }

    const res = await signIn("google", { callbackUrl });
    if (res?.error) {
      setError("Couldn't sign in with Google. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand text-white">
          <Sparkles size={22} />
        </div>
        <h1 className="text-2xl font-semibold text-ink">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-soft">Log in to {APP_NAME}</p>
      </div>

      {error && <ErrorBanner message={error} />}

      <Button
        type="button"
        variant="ghost"
        className="w-full flex items-center justify-center gap-2"
        loading={loading}
        onClick={handleGoogle}
      >
        <GoogleIcon />
        Continue with Google
      </Button>

      <p className="mt-6 text-center text-xs text-ink-faint">
        New here? Signing in with Google creates your {APP_NAME} account automatically —
        no separate sign up needed.
      </p>

      <p className="mt-3 text-center text-xs text-ink-faint">
        By continuing, you agree to our{" "}
        <Link href="/terms" className="text-brand-primary hover:underline" target="_blank">
          Terms &amp; Conditions
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-brand-primary hover:underline" target="_blank">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
