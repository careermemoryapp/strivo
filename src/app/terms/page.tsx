import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export const metadata = {
  title: `Terms & Conditions — ${APP_NAME}`,
};

const LAST_UPDATED = "August 27, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/" className="text-sm font-medium text-brand-primary hover:underline">
          &larr; Back to {APP_NAME}
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-ink">Terms &amp; Conditions</h1>
        <p className="mt-1 text-sm text-ink-soft">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-ink-soft">
          <section>
            <p>
              These terms govern your use of {APP_NAME}, a personal memory and AI coaching app.
              By creating an account or using {APP_NAME}, you agree to these terms. If you
              don&apos;t agree, please don&apos;t use the app. See also our{" "}
              <Link href="/privacy" className="text-brand-primary hover:underline">
                Privacy Policy
              </Link>
              , which explains how we handle your data in more detail.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Your account</h2>
            <p className="mt-3">
              You need an account to use {APP_NAME}. You&apos;re responsible for keeping your
              login credentials secure and for all activity that happens under your account. You
              must be at least 16 years old to use {APP_NAME}.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Free trial, subscriptions &amp; billing</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>New accounts get a free trial period, currently 2 months, starting from the
                day you sign up.</li>
              <li>After your trial ends, continued access requires a paid subscription, currently
                offered at $6.99/month or $41.99/year (billed annually, a 50% saving versus the
                monthly rate).</li>
              <li>On Android, subscriptions are sold and billed exclusively through Google Play
                Billing. We don&apos;t process or store your payment card details ourselves —
                Google handles billing, renewals, and refund requests according to its own terms.</li>
              <li>Subscriptions renew automatically at the end of each billing period unless
                cancelled. You can cancel anytime through Google Play; access continues until the
                end of the period you&apos;ve already paid for.</li>
              <li>We may change pricing or the length of the free trial for new signups going
                forward. We&apos;ll update this page when we do.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Data usage for product analytics</h2>
            <p className="mt-3">
              Separately from the AI features described in our Privacy Policy, we may analyze
              overall usage of {APP_NAME} — such as how many memories are created, which features
              are used, session activity, and subscription/trial conversion — to understand how
              the app is used and to improve it. This analysis relies on aggregated or
              de-identified usage patterns, not the content of your individual memories or
              conversations.
            </p>
            <p className="mt-3">
              We do not sell this data, and we do not use the content of your personal memories
              or chat conversations to train AI models. If we ever introduce features that draw
              on aggregated, de-identified data across users (for example, general career-path
              insights built from patterns across many accounts), we&apos;ll update this section
              and our Privacy Policy first, and such features will not expose your individual
              memories to other users.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Acceptable use</h2>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Use {APP_NAME} for anything unlawful, or to store or share content you don&apos;t
                have the right to.</li>
              <li>Try to disrupt, reverse-engineer, or gain unauthorized access to the app or its
                underlying systems.</li>
              <li>Use automated tools to scrape or extract data from {APP_NAME} outside of your
                own account.</li>
              <li>Impersonate someone else or misrepresent your affiliation with any person or
                organization.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Your content</h2>
            <p className="mt-3">
              You own the memories, recordings, documents, and other content you add to{" "}
              {APP_NAME}. You grant us a limited license to store and process that content solely
              to provide the app&apos;s features to you (as described in our Privacy Policy). You
              can delete individual memories, conversations, or your entire account at any time.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">AI-generated content</h2>
            <p className="mt-3">
              {APP_NAME} uses AI to generate responses, summaries, and suggestions based on your
              memories. AI output can be inaccurate or incomplete. You&apos;re responsible for
              reviewing and verifying anything you use — such as resume text or interview
              answers — before relying on it.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Not a crisis or medical service</h2>
            <p className="mt-3">
              {APP_NAME} is a career-coaching tool. It is not a medical, mental-health, or crisis
              service, and its AI is not equipped to help with a safety emergency. If you or
              someone else is in danger or experiencing a crisis, please contact your local
              emergency services or a crisis helpline directly (for example, in the US/Canada,
              call or text 988; in the UK, call 116 123; in India, call 112 or iCall at
              91-9152987821) rather than relying on {APP_NAME}.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Disclaimers &amp; limitation of liability</h2>
            <p className="mt-3">
              {APP_NAME} is provided &quot;as is&quot; and &quot;as available,&quot; without
              warranties of any kind, express or implied, including any implied warranty of
              merchantability, fitness for a particular purpose, or non-infringement. We
              don&apos;t guarantee the app will be uninterrupted, secure, or error-free, or that AI
              responses will always be accurate or complete. To the fullest extent permitted by
              law, {APP_NAME} and its founder won&apos;t be liable for any indirect, incidental,
              special, consequential, or punitive damages, or any loss of data, profits, or
              goodwill, arising from your use of (or inability to use) the app. To the fullest
              extent permitted by law, our total liability for any claim arising from these terms
              or the app is limited to the amount you paid us, if any, in the 12 months before the
              claim arose.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Indemnification</h2>
            <p className="mt-3">
              You agree to defend, indemnify, and hold harmless {APP_NAME} and its founder from any
              claims, damages, losses, or expenses (including reasonable legal fees) arising from
              your misuse of the app, your violation of these terms, or content you upload or
              submit that infringes someone else&apos;s rights or violates the law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Termination</h2>
            <p className="mt-3">
              You can stop using {APP_NAME} and delete your account at any time. We may suspend or
              terminate accounts that violate these terms, including for abuse, fraud, or attempts
              to circumvent the app&apos;s security or rate limits. Sections of these terms that by
              their nature should survive termination (such as limitation of liability,
              indemnification, and governing law) continue to apply after your account is
              terminated or deleted.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Governing law &amp; disputes</h2>
            <p className="mt-3">
              These terms are governed by the laws of India, without regard to conflict-of-law
              principles. Any dispute arising from these terms or your use of {APP_NAME} will be
              subject to the exclusive jurisdiction of the courts located in India. If you&apos;re
              a consumer resident in the EU, UK, or another jurisdiction that grants you the
              benefit of mandatory local consumer-protection law regardless of this clause, this
              section doesn&apos;t take away those protections.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">General</h2>
            <p className="mt-3">
              If any part of these terms is found unenforceable, the rest remains in full effect.
              Our failure to enforce a provision isn&apos;t a waiver of it. These terms, together
              with our Privacy Policy, are the entire agreement between you and {APP_NAME}
              regarding your use of the app.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Changes to these terms</h2>
            <p className="mt-3">
              We may update these terms from time to time. We&apos;ll update the &quot;last
              updated&quot; date above when we do, and material changes will be communicated in
              the app.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Contact us</h2>
            <p className="mt-3">
              Questions about these terms? Reach out through the Help &amp; Support form in the
              app, or contact us at{" "}
              <a href="mailto:shikhar333@gmail.com" className="text-brand-primary hover:underline">
                shikhar333@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
