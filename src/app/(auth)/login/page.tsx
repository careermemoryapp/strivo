"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { APP_NAME } from "@/lib/config";

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

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const res = await signIn("google", { callbackUrl: "/home" });
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
    </div>
  );
}
