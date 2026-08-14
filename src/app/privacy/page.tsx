import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export const metadata = {
  title: `Privacy Policy — ${APP_NAME}`,
};

const LAST_UPDATED = "August 14, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/" className="text-sm font-medium text-brand-primary hover:underline">
          &larr; Back to {APP_NAME}
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-ink">Privacy Policy</h1>
        <p className="mt-1 text-sm text-ink-soft">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-ink-soft">
          <section>
            <p>
              {APP_NAME} (&quot;we&quot;, &quot;us&quot;) provides a personal memory and AI
              coaching app that helps you capture moments from your work and career, and chat
              with an AI grounded in those memories. This policy explains what information we
              collect, how we use it, and the choices you have.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Information we collect</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <span className="font-medium text-ink">Account information:</span> your name and
                email address when you create an account.
              </li>
              <li>
                <span className="font-medium text-ink">Memories you create:</span> voice
                recordings and their transcripts, typed notes, and documents you upload (such as
                PDF, Word, PowerPoint, Excel, or CSV files) along with the text extracted from
                them.
              </li>
              <li>
                <span className="font-medium text-ink">Chat conversations:</span> the questions
                you ask and the AI&apos;s responses, so you can revisit past conversations.
              </li>
              <li>
                <span className="font-medium text-ink">Support messages:</span> anything you send
                us through the Help &amp; Support form.
              </li>
              <li>
                <span className="font-medium text-ink">Basic usage information:</span> such as
                when you log in, to keep your account secure and the app working reliably.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">How we use your information</h2>
            <p className="mt-3">We use your information to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                Generate AI responses grounded in your own memories (interview prep, resume
                feedback, leadership guidance, performance review help, and similar career
                coaching).
              </li>
              <li>Transcribe voice recordings and extract text from uploaded documents.</li>
              <li>Automatically summarize and categorize memories so they&apos;re easy to find.</li>
              <li>Maintain your account, chat history, and subscription status.</li>
              <li>Respond to support requests.</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information, and we do not use your memories or
              conversations to train AI models for anyone other than to directly power your own
              use of {APP_NAME}.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Third-party processing</h2>
            <p className="mt-3">
              To power transcription, summarization, and chat, we send relevant content (such as
              transcripts or extracted document text) to OpenAI, our AI service provider, strictly
              to generate the response you requested. OpenAI processes this data under its own
              API data-use terms and does not use API content to train its models.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Data storage and security</h2>
            <p className="mt-3">
              Your data is stored on servers we control and is associated only with your account.
              We take reasonable technical measures to protect it, but no method of storage or
              transmission is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Your choices</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>You can edit or delete individual memories at any time.</li>
              <li>You can delete conversations from your chat list at any time.</li>
              <li>
                You can delete your account and associated data from Settings, or by contacting
                us.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Children&apos;s privacy</h2>
            <p className="mt-3">
              {APP_NAME} is not directed at children and is not intended for use by anyone under
              16 years old. We do not knowingly collect information from children.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Changes to this policy</h2>
            <p className="mt-3">
              We may update this policy from time to time. We&apos;ll update the &quot;last
              updated&quot; date above when we do.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Contact us</h2>
            <p className="mt-3">
              Questions about this policy or your data? Reach out through the Help &amp; Support
              form in the app, or contact us at{" "}
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
