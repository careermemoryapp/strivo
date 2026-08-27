import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export const metadata = {
  title: `Privacy Policy — ${APP_NAME}`,
};

const LAST_UPDATED = "August 27, 2026";

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
              API data-use terms and does not use API content to train its models. We also use
              Amazon Web Services (AWS) to host the app and database, and Google Analytics (GA4)
              on our public marketing site only — never inside the app itself — to understand
              traffic to strivo.ai.
            </p>
            <p className="mt-3">
              We do not use your memories, chat conversations, or documents for advertising, and
              we do not sell, rent, or trade your personal information to anyone, for any
              purpose.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Legal basis for processing (EU/UK users)</h2>
            <p className="mt-3">
              If you&apos;re in the European Economic Area or the UK, we process your information
              under these legal bases: performance of a contract (creating your account,
              providing the core app features you&apos;ve signed up for), your consent (marketing
              emails, which you can withdraw at any time — see &quot;Your choices&quot; below), and
              our legitimate interest in keeping the service secure, reliable, and functioning
              correctly (fraud prevention, rate limiting, error monitoring). Where we rely on
              consent, withdrawing it doesn&apos;t affect the lawfulness of anything we did before
              you withdrew it.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">How long we keep your data</h2>
            <p className="mt-3">
              We keep your account, memories, and chat conversations for as long as your account
              is active — there&apos;s no automatic expiry, since the whole point of {APP_NAME} is
              being able to look back at something you recorded months or years ago. When you
              delete an individual memory or conversation, or delete your account entirely, that
              data is removed from our production database immediately (account deletion cascades
              to every memory, chat, and message tied to it — nothing is left behind under a
              deleted account). Encrypted backup snapshots taken before a deletion age out and are
              overwritten on our routine backup rotation, rather than being individually purged the
              moment you delete something — so a deleted item can persist in backups for a limited
              window before it&apos;s gone everywhere. Support messages and basic security/audit
              logs are kept for a reasonable period to prevent abuse and resolve disputes, then
              deleted.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">International data transfers</h2>
            <p className="mt-3">
              {APP_NAME} is operated from India and our servers are hosted with AWS in the ap-south-1
              (Mumbai) region. If you&apos;re using {APP_NAME} from outside India, your information
              is transferred to and processed in India. Content sent to OpenAI for AI processing
              (such as a transcript being summarized, or a chat message being answered) may be
              processed on OpenAI&apos;s infrastructure, which can be located in the United States
              or other countries where OpenAI operates. Where we transfer personal data
              internationally, we rely on the receiving party&apos;s own contractual and security
              commitments (such as OpenAI&apos;s API data-processing terms) as the safeguard for
              that transfer. If you&apos;re in the EEA or UK and have questions about a specific
              transfer mechanism, contact us using the details below.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Data storage and security</h2>
            <p className="mt-3">
              Your data is stored on servers we control in an encrypted database volume (AES-256
              disk-level encryption) and is associated only with your account. All traffic between
              your device and {APP_NAME} — web or app — is encrypted in transit via HTTPS/TLS; we
              don&apos;t accept unencrypted connections. Administrative access to the server
              requires its own authentication separate from the app itself, and we run automated,
              encrypted daily backups so a server failure doesn&apos;t mean data loss. That said,
              no method of storage or transmission is 100% secure, and we can&apos;t guarantee
              absolute security. If we ever become aware of a data breach affecting your personal
              information, we&apos;ll notify affected users and relevant authorities as required by
              applicable law, without undue delay.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">AI-generated content and automated decisions</h2>
            <p className="mt-3">
              {APP_NAME}&apos;s AI generates summaries, categorizations, and chat responses based on
              your own memories, but it does not make any automated decision about you that has a
              legal or similarly significant effect — it doesn&apos;t decide whether you get a job,
              a loan, or any other outcome. Every AI output is a suggestion for you to review,
              edit, or discard; nothing is submitted or acted on automatically on your behalf.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Your choices</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>You can edit or delete individual memories at any time.</li>
              <li>You can delete conversations from your chat list at any time.</li>
              <li>
                You can delete your account and associated data from Settings, or by contacting
                us — this permanently and immediately removes your memories, chats, messages, and
                account information from our production systems (see &quot;How long we keep your
                data&quot; above for backup retention).
              </li>
              <li>
                You can opt out of marketing emails at any time using the unsubscribe link in any
                marketing email we send, or by contacting us. This doesn&apos;t affect essential
                account emails (like security notices).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Your rights under GDPR / UK GDPR</h2>
            <p className="mt-3">
              If you&apos;re located in the EEA or UK, you have the right to: access the personal
              data we hold about you; correct inaccurate data; request erasure of your data;
              restrict or object to certain processing; receive your data in a portable format;
              and withdraw consent at any time where we rely on consent. To exercise any of these
              rights, contact us using the details below — we&apos;ll respond within the timeframe
              required by law. You also have the right to lodge a complaint with your local data
              protection supervisory authority if you believe we haven&apos;t handled your data
              properly.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Your rights under India&apos;s DPDP Act</h2>
            <p className="mt-3">
              If you&apos;re located in India, under the Digital Personal Data Protection Act, 2023
              you have the right to: access a summary of the personal data we process about you and
              the processing activities; request correction, completion, updating, or erasure of
              your personal data; withdraw consent at any time, as easily as you gave it; nominate
              another individual to exercise your rights in the event of your death or incapacity;
              and file a grievance with us, or subsequently with the Data Protection Board of
              India if unresolved. Our Grievance Officer for DPDP purposes is listed under
              &quot;Contact us&quot; below.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Your rights under US state privacy laws</h2>
            <p className="mt-3">
              If you&apos;re a resident of California or another US state with its own privacy
              law, you have the right to know what personal information we collect and how it&apos;s
              used, to request deletion of your personal information, and to not be discriminated
              against for exercising these rights. As stated above, we do not sell or share your
              personal information for cross-context behavioral advertising, so there is no
              &quot;opt out of sale&quot; action needed — we simply don&apos;t do it.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Cookies</h2>
            <p className="mt-3">
              Our public marketing website (strivo.ai) uses Google Analytics cookies to understand
              site traffic, shown behind a cookie consent banner where you can accept or decline
              non-essential cookies. The {APP_NAME} app itself (native or web) does not use
              advertising or analytics cookies.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Children&apos;s privacy</h2>
            <p className="mt-3">
              {APP_NAME} is not directed at children and is not intended for use by anyone under
              16 years old. We do not knowingly collect information from children. If you believe
              a child has provided us with personal information, contact us and we&apos;ll delete
              it.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Changes to this policy</h2>
            <p className="mt-3">
              We may update this policy from time to time. We&apos;ll update the &quot;last
              updated&quot; date above when we do, and for material changes we&apos;ll take
              reasonable steps to let you know (such as an in-app or email notice).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Contact us / Grievance Officer</h2>
            <p className="mt-3">
              Questions about this policy, your data, or a request to exercise any of the rights
              above? Reach out through the Help &amp; Support form in the app, or contact us
              directly at{" "}
              <a href="mailto:shikhar333@gmail.com" className="text-brand-primary hover:underline">
                shikhar333@gmail.com
              </a>
              . For India DPDP Act purposes, Shikhar (reachable at the same email address) is our
              designated Grievance Officer. See also our{" "}
              <Link href="/terms" className="text-brand-primary hover:underline">
                Terms &amp; Conditions
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
