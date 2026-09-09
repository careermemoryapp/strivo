# Apple App Store submission checklist

Compiled 2026-09-09, updated 2026-09-09 against a second independent "top
rejection reasons" list. Read this before filling out the App Privacy
questionnaire in App Store Connect, before wiring up subscriptions, and
before submitting the build for review (iOS Phase 6/7). Google Play
approval does NOT predict Apple's decision — Apple's review is a human
reviewer actually using the app, not just an automated policy check.

## 0. Sign in with Apple (Guideline 4.8) — REAL GAP, needs code, not just a submission-day check

Strivo is Google-Sign-In-only (see the comment in `lib/auth.ts`: "Strivo
is Google-sign-in-only — there's no email/password login"). Apple's
Guideline 4.8 requires that if an app offers a third-party login option
(Google counts), it must ALSO offer "Sign in with Apple" as an equivalent,
privacy-friendly option. This is one of the most commonly cited real
rejection reasons and is NOT something that can be fixed at submission
time — it needs an actual implementation pass before iOS Phase 6/7:
- Add an Apple provider alongside the existing Google provider in
  `lib/auth.ts` (NextAuth supports this natively)
- Native side needs Sign in with Apple capability enabled in the Apple
  Developer portal + Xcode capability, plus a native-aware login flow
  mirroring the existing Google mobile-bridge/mobile-consume pattern
- This should happen during iOS Phase 3 (iOS-specific reconfig) or as its
  own phase before Phase 7 submission — do NOT skip it assuming it's a
  metadata/questionnaire fix, it isn't
- Android does not require this (4.8 is an Apple-only guideline) — no
  change needed there

## 7. Missing iOS permission usage descriptions — FIXED 2026-09-09

Checked `ios/App/App/Info.plist` directly: it had NO `NSMicrophoneUsageDescription`
(or any `*UsageDescription` key) at all. Strivo's Record feature captures
microphone audio (`src/lib/useSpeechRecognition.ts`, `getUserMedia` inside
the WebView) — on iOS, requesting mic access without this key present
doesn't just risk a review rejection, it **crashes the app immediately**
the moment the permission prompt would fire.

**Fixed:** added `NSMicrophoneUsageDescription` to `ios/App/App/Info.plist`
with the string "Strivo uses your microphone to record voice memories you
choose to save." — specific and honest per Apple's 5.1.1 guidance, not a
generic placeholder (2026-09 Adalo corroboration: generic permission text
is a named, independent rejection cause).

**Checked `@capawesome/capacitor-file-picker` directly (its own iOS
source, not just the README):** Strivo only ever calls `FilePicker.pickFiles()`
with document MIME types (PDF/docx/pptx/xlsx, in `first-record/page.tsx`,
`settings/resume/page.tsx`, `record/page.tsx`) — never `pickImages`,
`pickVideos`, or `pickMedia`. `pickFiles()` on iOS opens the sandboxed
Files-app document picker, which requires no Info.plist key at all (the
plugin's own `ios/Plugin/Info.plist` has nothing photo-related, and its
README only lists a photo-library requirement under the gallery-picking
methods Strivo doesn't use). So `NSPhotoLibraryUsageDescription` is
confirmed NOT needed — closing the "verify" item that was open here.

This closes task #390. No further action needed before iOS Phase 4/5
device testing on this specific item. `npx tsc --noEmit`/`eslint` don't
apply to `.plist` files; validated instead by parsing it as XML (caught
and fixed one real bug in the process: an XML comment containing `--`,
which is invalid XML and would have broken the Xcode build).

## 8. Xcode 26 / iOS 26 SDK requirement — CONFIRMED OK, no action needed

Two independent sources (Adalo, Greensighter) confirm Apple required
**all** App Store submissions to be built with Xcode 26 targeting the iOS
26 SDK as of April 28, 2026. That deadline has already passed as of
today. An older SDK target fails at the App Store Connect upload step,
before anything else about the app is even evaluated.

**Verified 2026-09-09** — checked `codemagic.yaml` directly (repo root):
`environment.xcode: latest`. This is not pinned to an old version; it
always resolves to whatever the newest Xcode Codemagic currently offers,
which as of today is already Xcode 26. So this requirement is already
satisfied with zero config change needed. Closes task #391.

One thing to keep in mind for later, not now: `xcode: latest` means a
future Codemagic-side Xcode bump could change build behavior on some
future push without anyone touching this repo. Not a rejection risk —
just a build-stability consideration. Worth pinning to an explicit
version (e.g. `xcode: 26.0`) once submissions are more routine, but not
worth doing pre-emptively.

## 1. Repackaged website (Guideline 4.2.3) — THE other real risk for Strivo

`capacitor.config.ts` has `server.url: 'https://strivo.ai/app'` — the iOS
app loads the live website in a WebView rather than bundling assets. This
is exactly the pattern Apple's reviewers are trained to flag. Strivo has
real mitigating factors already built in — lean on these, don't rebuild
the app:
- On-device microphone recording for memories (genuine hardware use, not
  just content browsing — this is the strongest signal Strivo has)
- Native push notifications (Firebase)
- Native file picker for resume uploads (@capawesome/capacitor-file-picker)
- Native Google Sign-In flow (mobile-bridge/mobile-consume) — will also
  cover Sign in with Apple once #0 above ships
- Android App Links / deep linking

Worth being precise about which guideline actually applies, since search
results and AI summaries often blur two different rules together: 4.2.3
("Minimum Functionality" / repackaged websites) is the one that applies
to Strivo — Apple explicitly permits rendering ordinary HTML/CSS/JS
content in a WebView (WKWebView), so loading `strivo.ai/app` is not,
by itself, a violation. Guideline 2.5.2 ("no downloading/executing code
not in the reviewed binary") is a stricter, different rule mainly aimed
at apps that let users generate and run new native-feeling
software/features at runtime (the "vibe coding app" crackdown covered
below is a 2.5.2-style concern, not a 4.2.3 one). Strivo doesn't do that
either. Don't let this distinction get lost — the actual risk is 4.2.3
("does this feel like a real app"), not 2.5.2, and conflating the two
overstates the risk and points at the wrong fix.

Before submitting:
- No browser-style UI chrome, no URL bar ever visible; proper safe-area
  handling so it doesn't read as "a website squeezed into a frame"
- Consider adding haptic feedback on key actions (saving a memory) and a
  native share sheet if a share feature ever ships — cheap, high signal
- Finish RevenueCat/native IAP before submitting if at all possible — a
  wrapped app with real native purchases reads very differently to a
  reviewer than one with no native purchase flow at all
- **Fill in the App Review Notes field in App Store Connect** — this is
  the single highest-leverage, currently-unused lever. Explicitly tell
  the reviewer: "this app uses on-device microphone recording, native
  push notifications, and native file picking," and provide a working
  demo login. Reviewers reject faster when confused about what they're
  looking at. Also explicitly state that Strivo does NOT let users
  generate, execute, or download new/arbitrary code or software inside
  the app — it's a fixed, reviewed set of screens (record, memories,
  chat, settings) that happen to render via a web view. This preempts
  any confusion with the "vibe coding app" category Apple has been
  cracking down on hard in 2026 (apps like Replit that let users create
  and run new software from inside the app) — see note under "Sources"
  below. Strivo isn't that, but a reviewer skimming fast could initially
  lump it in with "content served dynamically, not in the reviewed
  binary" concerns, so say so up front rather than leaving it ambiguous.
- Do TestFlight internal testing first (iOS Phase 5) — lighter review
  than full App Store submission, catches automated binary-check issues
  before a human reviewer sees it
- If rejected anyway: not final. Apple sends a specific reviewer note;
  respond via Resolution Center explaining the native capabilities, or
  make the specific fix requested. Most borderline 4.2.3 rejections
  resolve on the second pass without a rebuild.
- **Provide a working demo account in App Review Notes if login is ever
  required to see core functionality** — Strivo's Google/Apple sign-in
  means a reviewer can't get in without a real account, so a demo login
  (or clear instructions for how the reviewer creates one) is not
  optional. Confirmed as a real, repeated rejection cause across multiple
  independent sources, not just a nice-to-have.

**2026-09 update, confirmed by three independent sources (modall.ca,
Greensighter, and a real developer's Hacker News thread — see Notes
below):** the 2.5.2 crackdown specifically targets vibe-coding TOOLS —
apps like Replit, Bloom, Vibecode, Expo Go that let a user generate,
preview, or run NEW software from inside the host app. It does not
target ordinary apps that merely happen to have been built using AI
coding assistance. One developer's own words on the distinction: "Apple
is not necessarily blocking vibecoded apps, they are blocking vibecoding
tools... it doesn't prevent people from submitting vibecoded apps to the
App Store." Strivo was built with AI coding tools but doesn't let users
generate or run new apps/features at runtime — this strengthens
(doesn't change) the correction above: 4.2.3, not 2.5.2, is Strivo's
actual exposure.

## 2. Account deletion — already done, nothing to fix

Settings has a "Delete Account" row with a confirm dialog that calls
`/api/user/delete` and deletes the account, memories, and chat history
from inside the app (not a "contact us" / email-support flow). Satisfies
Guideline 5.1.1(v).

## 3. Undisclosed data collection — App Privacy questionnaire answers

The Privacy Policy page covers legal disclosure, but App Store Connect's
separate "App Privacy" nutrition-label questionnaire is filled out at
submission time and doesn't inherit from the Privacy Policy text. Getting
this wrong (declaring less than what's actually collected) is itself a
rejection reason, independent of whether the Privacy Policy is accurate.
Based on what's actually wired into the native app today:
- **Diagnostics** — crash/error data via Sentry: disclose
- **Identifiers** — device/push token via Firebase Cloud Messaging: disclose
- **Contact Info** — name/email via Google Sign-In (and Apple Sign-In once
  #0 ships): disclose
- **Google Analytics (GA4) runs ONLY on the marketing website** (strivo.ai),
  not inside the native app itself — do NOT include it in the app's
  nutrition label, only the web property's if Apple ever asks about that
  separately (it doesn't, App Privacy is app-binary-scoped)
- Before submitting, re-check this list against whatever's actually
  wired up at THAT time (e.g. if RevenueCat/Play Billing lands, it adds
  Purchase History as a data type) — the answers above are a snapshot,
  not a fixed final answer.

**AI data-processing disclosure (Guideline 5.1):** checked `src/app/privacy/page.tsx`
directly — it already discloses that memory/chat content is sent to
OpenAI for AI processing, including the purpose limitation and where it's
processed. That's solid textual disclosure. Note: Strivo doesn't need (and
shouldn't build) an "opt out of AI processing" toggle some generic
checklists ask for — AI processing IS the core, disclosed product
function here, not an unexpected add-on bolted onto unrelated content, so
there's nothing meaningful to opt out of while keeping the app
functional. What's worth double-checking is simpler: that the Privacy
Policy link is actually visible/reachable during signup (not just buried
in Settings after account creation), so consent is meaningfully informed
before someone's first memory gets sent to OpenAI, not just documented
after the fact.

**2026-09 update — worth strengthening, sourced from Greensighter's blog
(an agency, not Apple directly, so treat as a recommendation rather than
verified guideline text):** they cite Guideline 5.1.2(i) as requiring a
specific consent modal before any data is shared with a third-party AI
service — "not buried in a terms page." Strivo's current approach (link
in Settings + Privacy Policy disclosure) may not be enough if Apple reads
5.1.2(i) that strictly. Cheap insurance either way: add a one-time,
lightweight consent screen during onboarding (first-record or signup)
along the lines of "Strivo uses AI (via OpenAI) to help structure your
memories and power chat — by continuing you agree to this" with a link to
the full Privacy Policy. This also directly strengthens the "informed
before first use, not just documented after" point above. Not filed as
its own task yet since it's a small UI addition better bundled into
whatever onboarding work happens next, but flag it before iOS Phase 7.

**2026-09-09 — Shikhar's explicit call: skip this.** Since it's a
recommendation from a single agency's interpretation, not confirmed Apple
guideline text, and the existing signup-time Terms/Privacy links already
cover informed consent, he decided not to build a dedicated AI-consent
screen. Don't re-raise this as a pending gap in a future session — it was
considered and declined, not overlooked.

**Checked and NOT applicable — two Greensighter claims that don't apply
to Strivo:** (1) C2PA metadata for AI-generated visual content — Strivo
has no AI image-generation feature, nothing to add. (2) Content
moderation / report mechanism / block-abusive-users requirements — these
apply to apps with user-generated content visible to OTHER users (social
apps). Strivo is a private, single-user career-memory app with no
social/sharing surface, so this whole cluster doesn't apply. Worth
stating explicitly so a future session doesn't mistakenly try to build
moderation tooling that has no purpose here.

**Placeholder/dead-end UI audit (Guideline 2.2):** checked directly —
Strivo has exactly one "Coming soon" UI element (`Row` component in
`settings/page.tsx`, used for "Appearance"). It's implemented correctly:
the button is `disabled` when `comingSoon` is set, so tapping it does
nothing rather than navigating to a broken or empty screen. This is
already the safe pattern reviewers are checking for — nothing to fix.

## 4. App icon matching an in-app purchase icon — not applicable yet

No live in-app purchases yet (RevenueCat/Play Billing integration still
pending — iOS Phase 6). Nothing to check now. Once the paywall UI ships
with any IAP-specific icon/imagery, do a one-time visual diff against the
app icon before that submission.

## 5. Terms of Use / EULA link — mostly done, two things live outside the codebase

In-app: Settings already links to `/terms` and `/privacy` — this serves
as the custom EULA satisfying the in-app requirement.

Two things still needed, both App Store Connect metadata rather than code:
- **Specific field, confirmed by a real rejection/fix account (see Notes
  below):** App Store Connect → App Information → "License Agreement" —
  paste the EULA text there (Apple's standard EULA, or a custom one
  referencing `https://strivo.ai/terms`). This is a distinct field from
  the general app description and is the one Apple actually checks for
  this requirement. Do this in iOS Phase 7 alongside adding the terms
  link to the listing description/support fields too.
- **If subscriptions are live by submission (iOS Phase 6), the Terms of
  Use link must ALSO be shown at the point of purchase** — i.e. visible
  on or right before the actual subscription/paywall screen inside the
  app, not just buried in Settings. This is specifically checked whenever
  an app sells subscriptions (Guideline 3.1.2) and is a separate check
  from the store-listing link above. Build this into the paywall UI when
  #114 (paywall UI) is implemented, don't bolt it on later.

## 6. Export compliance / encryption declaration — new item, submission-time question

Every build submitted to App Store Connect requires answering an Export
Compliance questionnaire ("does your app use encryption?"). Strivo uses
standard HTTPS/TLS (all API calls, the WebView traffic to strivo.ai) plus
OAuth-based sign-in (Google, and Apple once #0/#389 ships) — no custom
encryption beyond that. This almost always qualifies for Apple's standard
exemption (apps that only use encryption for HTTPS/TLS or standard
authentication don't need a special export license), which just means
answering the questionnaire honestly in App Store Connect at submission
time — not a code change. Revisit this specific answer only if Strivo
ever adds custom client-side encryption of stored data (it doesn't
today). Flag as a "answer truthfully at submission" reminder for iOS
Phase 7, not a pre-work item.

## 9. In-app purchase compliance (Guideline 3.1.1) — currently safe, but watch this when Phase 6 ships

Checked `settings/subscription/page.tsx` directly. Today there is no live
purchase flow at all: the "Upgrade to Strivo Plus" button just shows
"Online payments aren't set up yet — check back soon." No Stripe,
BillDesk, or any external payment link is reachable from the iOS app, so
there's nothing here that violates 3.1.1 (digital subscriptions must go
through Apple's IAP, not external payment/Stripe/etc.) right now.

Two things to get right when iOS Phase 6 (task #383, RevenueCat/Apple IAP)
actually ships:
- The purchase itself must go through Apple IAP on iOS — RevenueCat
  already routes to the correct backend per-platform, so this should be
  automatic as long as the paywall calls RevenueCat rather than any direct
  Stripe/BillDesk endpoint on iOS specifically.
- **Copy bug to fix before then, not after:** the page currently
  hardcodes "Billed annually via Google Play. Cancel anytime... from
  Google Play → Subscriptions" regardless of platform. Harmless today
  (button is inert), but once real purchases go live this text needs to
  be platform-aware — "via the App Store" / "Settings → \[name\] →
  Subscriptions" on iOS, not Google Play copy shown to an iPhone user.
  Small fix, but a reviewer tapping through and seeing wrong-platform
  billing text reads as sloppy/untested at best.

Also worth a quick manual pass at Phase 7 (not code, just verification):
Apple reviewers compare submitted screenshots against the live app
side-by-side, and flag anything shown in a screenshot that isn't actually
in the shipped build. Make sure whatever screenshots go into App Store
Connect reflect the actual current UI at submission time, not an older or
aspirational version.

## Notes from secondary sources (news/YouTube transcripts, not official Apple docs)

Shikhar is periodically sharing transcripts of videos/reports about other
apps' App Store rejections for cross-checking. These are opinion/reporting,
not Apple's own guideline text — treated as directional signal, not as
authoritative as the guideline numbers cited elsewhere in this file. Each
entry below: what the source claimed, and whether/how it applies to Strivo.

**2026-09 — CNBC segment on Apple restricting "vibe coding" apps (Replit
and similar) from updating/staying on the App Store.** Apple's stated
reason: these apps let users generate and run new software from inside
the app that Apple's reviewers never see — a variant of Guideline 2.5.2
(no downloading/executing code not in the reviewed binary) applied to
AI-generated software specifically. The segment frames this skeptically
(compares it to WordPress, notes the generated content just opens in a
browser, suggests possible internal inconsistency at Apple given Xcode
also lets people build apps).

Relevance to Strivo: LOW as a direct risk — Strivo doesn't let users
generate or execute arbitrary new code/software inside the app; it's a
fixed set of screens (record, memories, chat, settings). This is a
meaningfully different category from Replit's "build me an app" flow.
BUT it's useful signal that Apple's 2026 posture has gotten stricter
specifically around "content/behavior served dynamically rather than
reviewed in the binary" — which is the same underlying family of concern
as Strivo's own 4.2.3 risk (item 1 above, `capacitor.config.ts` loading a
live URL). Net effect: doesn't change any specific action item, but
reinforces that item 1's mitigations (native touchpoints, App Review
Notes explicitly disclaiming code-generation/execution) matter more now
than they might have a year ago, not less. Already folded into item 1's
App Review Notes guidance above.

**2026-09 — Vibe-coding creator (DropCard app) first-hand rejection/fix
account.** Real (not hypothetical) rejection, not a news segment. Got
rejected on first submission for exactly two reasons, fixed both, got
approved on the second try within a day: (1) Google-only sign-in with no
Sign in with Apple option, (2) missing the specific Apple EULA in the
license agreement. Also confirms: Apple Developer Program is $99/year,
covers unlimited apps; TestFlight and full App Store submission both go
through App Store Connect → Distribution; subscriptions require creating
a named product with per-country pricing/availability; if building via
Xcode directly (rather than Codemagic, which is what Strivo Phase 4 uses)
the flow is Product → Archive → Validate App → Distribute App.

Relevance to Strivo: HIGH — this is direct, real-world confirmation that
items 0 (Sign in with Apple) and 5 (EULA) are the two most common actual
rejection reasons, not just theoretical guideline text. Nothing new to
add to the checklist itself (both were already tracked), but it raised
the specific EULA field name into item 5 above (App Information → License
Agreement, not just the general description) and confirms items 0 and 5
should be treated as the highest-priority pre-submission checks, on par
with or above the 4.2.3 wrapped-website risk.

**2026-09 — General "idea to published app" tutorial (React Native + Expo
+ Claude Code + EAS Build, monetized via AdMob).** Not about rejection
reasons specifically — a build-pipeline walkthrough for a different stack
than Strivo's. Most of it doesn't apply: Strivo already uses a CLAUDE.md
context file (same practice this video recommends), already uses GitHub
for version control, doesn't monetize via ads (subscription-based via
RevenueCat/Play Billing instead), and uses Capacitor + Codemagic rather
than Expo/EAS for building and submitting — so the Expo-specific tooling
(EAS Update, EAS Build, Expo Go preview) isn't directly transferable.

One point IS worth sitting with honestly: the video explicitly warns that
building a mobile app as a wrapped website (its example is Lovable) makes
the app "feel slow and laggy" and creates App Store publishing problems,
recommending React Native instead because it compiles to genuinely native
code. Strivo's iOS app IS architecturally a wrapped website (Capacitor
loading `strivo.ai/app` live — see item 1). This is real signal that the
wrapper approach carries both a review-risk cost (already tracked in item
1) and a genuine UX-quality cost, not just a paperwork problem.

Relevance to Strivo: LOW-MEDIUM, and deliberately NOT a recommendation to
rebuild. A full React Native rewrite at this stage isn't a proportionate
response to one tutorial's generic stack advice, given how much is
already built and working on the current stack. This is logged as
reinforcement of item 1's existing mitigations (lean on native
touchpoints, use App Review Notes), not a new action item. If app
performance/responsiveness ever becomes a real user complaint on iOS
specifically (not just an App Review risk), that would be the trigger to
revisit this tradeoff — not a hypothetical from a tutorial.

**2026-09 — Solo developer's real "vibe-coded to published" walkthrough,
native Swift UI utility app (color converter), no login/data
collection/subscriptions.** Real submission, not hypothetical — passed
review in about 1 hour of actual review time (2 days total queue wait).
Most of it doesn't transfer directly: this app has no accounts, no data
collection, no subscriptions, so the App Privacy questionnaire was a
straightforward "we collect nothing," which doesn't reflect Strivo's
actual answers (item 3 above). One genuinely new, previously-unflagged
item surfaced: the **Export Compliance / encryption declaration**, a
mandatory questionnaire on every App Store Connect submission, not
something the video's own subject matter (a no-login utility app) would
have made obvious was relevant to Strivo — added as new item 6 above.
Also corroborates, without adding detail: subscription/IAP-based apps
draw the most scrutiny in review (matches the existing 3.1.2 guidance in
item 5), and app icons need to be exactly 1024x1024px or Xcode itself
blocks the build before it ever reaches Apple's reviewers (a build-prep
detail, not a review risk — worth remembering when the real app icon
asset gets finalized for iOS, separate from item 4's icon/IAP concern).

Relevance to Strivo: MEDIUM — the export compliance item is real,
concrete, and wasn't covered before. The rest is low-relevance given how
different this app's use case is from Strivo's (no accounts, no data,
no payments).

**2026-09 — "Live vibe coding" video building an RSVP feature for a
wedding app (Olwa).** Product design/build workflow only — UX research,
moodboarding on Mobin/Pinterest, Figma, then implementing with Claude
Code and iterating on animations. No mention of App Store submission,
rejection reasons, App Review guidelines, privacy, EULA, or Sign in with
Apple anywhere in it.

Relevance to Strivo: NONE for this file's purpose. Logged only so the
review trail is complete — no checklist changes made from this one.

**2026-09 — "I built an app to rate guys I'm dating" demo, built with
Replit's mobile app builder.** A promotional/demo video for Replit's
mobile pipeline, not an App Store rejection account. Worth noting
explicitly: what she actually demonstrates is installing the app on her
own phone via TestFlight as the developer — that's internal testing,
which doesn't go through Apple's App Review at all. She never describes
the app going live to the public App Store or passing an actual review,
so this isn't evidence about surviving review, just about how fast a
Replit-built app can get onto a personal device. Nothing about rejection
reasons, guidelines, privacy, EULA, or Sign in with Apple is mentioned.
Confirms $99/year Apple Developer cost and ~24-48hr account verification
wait (both already known/already done for Strivo — task #378).

Relevance to Strivo: NONE for this file's purpose. Logged for
completeness only, same as the previous entry.

**2026-09 — Google AI Overview summarizing "how to get approval from
Apple Store for vibe coded apps."** Different kind of source than the
video transcripts — an AI-generated search summary aggregating multiple
SEO/blog sources (modall.ca, Appbot, Greensighter, an Instagram creator),
not a single first-hand account. Treated with a bit more caution than a
real rejection story, since AI Overviews can blend distinct guidelines
together imprecisely (see the 2.5.2/4.2.3 correction below). Four
sections, checked each against Strivo's actual code:

1. *Remove Dynamic Code Execution (2.5.2)* — this is where the AI Overview
   conflates two different rules. 2.5.2 (no downloading/executing code
   outside the reviewed binary) targets apps that generate and run new
   native-feeling software at runtime — the "vibe coding app" crackdown
   category, not ordinary WebView content. Apple explicitly permits
   rendering HTML/CSS/JS in a WebView. Strivo's actual applicable risk is
   4.2.3 (item 1), not 2.5.2 — corrected in item 1 above so this doesn't
   overstate the risk or point at the wrong fix.
2. *Eliminate Placeholders and Dead Ends (2.2)* — genuinely useful,
   checked directly against the codebase: found one "Coming soon" UI
   element (Settings > Appearance), confirmed it's already implemented
   safely (disabled button, no dead navigation) — folded into item 3.
3. *Compliance and Privacy (5.1)* — the hosted-privacy-policy-matches-labels
   point is already covered by item 3. The "AI consent screen with
   opt-out" and "justify permissions" points led to two real checks: the
   AI-processing disclosure is confirmed present in the Privacy Policy
   (folded into item 3, with a note that an opt-out toggle isn't
   applicable here since AI processing is the core product), and checking
   permission justification surfaced a genuine, unrelated gap — Info.plist
   has no usage-description strings at all (new item 7, task #390).
4. *Performance and Quality (2.4.2 & 4.3)* — generic QA advice (test on a
   real device, don't ship a bare template) already implied by existing
   guidance, nothing new to add.

Relevance to Strivo: MEDIUM-HIGH — not because the source itself is
authoritative (it's an AI summary of blog content), but because checking
its claims against the actual codebase surfaced one real, previously
unknown, code-blocking gap (item 7) and one real imprecision in earlier
entries worth correcting (2.5.2 vs 4.2.3 in item 1).

**2026-09 — Six-link research batch (Shikhar asked to review and extract
learnings), full articles/threads rather than a search summary.** Two of
the six were blocked by this environment's URL access policy and were
NOT fetched by any method: mashable.com and pcmag.com. Four were fetched
successfully:

- **modall.ca (blog, agency selling "vibe code cleanup" services — read
  with that bias in mind).** Reports Apple blocked Replit/Vibecode
  updates in March 2026 under Guideline 2.5.2, specifically because those
  platforms let users generate and run NEW applications inside the host
  app after review. Apple's own fix for those platforms: preview
  generated content in an external browser instead of an in-app WebView,
  or remove the ability to generate software for Apple devices entirely.
  Confirms Apple added OpenAI/Anthropic integrations to Xcode itself —
  the line is "AI helping a developer write code" (fine) vs. "an app that
  generates and runs new code at runtime without going through review"
  (not fine). This is the clearest statement yet of the distinction
  already noted in item 1 — folded in as corroboration.
- **Adalo (blog, a no-code app-builder company selling native-compile
  publishing — also read with that bias in mind).** A detailed, concrete
  submission walkthrough. Confirmed: 1024x1024px icon with no rounded
  corners; generic/placeholder permission-explanation text is a named
  rejection cause (corroborates item 7); provide a demo account when
  login is required for review (folded into item 1); Privacy Nutrition
  Labels must be completed at submission (matches item 3); **Apple
  requires all submissions be built with Xcode 26 / iOS 26 SDK as of
  April 28, 2026** — new, dated, and already-passed deadline, added as
  item 8 / task #391.
- **Greensighter (blog, a dev agency selling "ship it right" services —
  same bias caveat).** The most technically specific of the four. Named
  three sharpest guidelines: 2.5.2 (self-contained, matches modall.ca),
  4.3 (spam/low-effort/template — explicitly includes bare web wrappers
  under this heading, reinforcing item 1), 2.4.2 (performance/battery).
  Cited Guideline 5.1.2(i) as requiring an explicit consent MODAL (not
  just a Privacy Policy link) before sharing data with a third-party AI
  service — folded into item 3 as a recommendation, flagged as sourced
  from a single agency's interpretation rather than confirmed Apple text,
  since it's a stronger claim than the other sources make. Also
  confirmed Xcode 26/iOS 26 SDK deadline independently (strengthens
  confidence in item 8). Two claims checked and found not applicable to
  Strivo: C2PA metadata for AI-generated images (no image-gen feature),
  and content-moderation/reporting/blocking requirements (no
  social/multi-user content surface in Strivo at all).
- **Hacker News thread (news.ycombinator.com/item?id=47586483) — a real
  developer (David from Bloom, a YC-backed vibe-coding tool) posting
  first-hand about his own app getting blocked, plus community replies.**
  The single most credible source in this batch — a primary account, not
  marketing content. Directly confirms the 2.5.2 crackdown targets
  vibe-coding TOOLS (Bloom, Replit, Expo Go, a0) specifically, not
  ordinary apps built using AI assistance. His own words: "Apple is not
  necessarily blocking vibecoded apps, they are blocking vibecoding
  tools... it doesn't prevent people from submitting vibecoded apps to
  the App Store." This is the strongest available confirmation that
  Strivo — built with AI tools but not itself a tool that lets users
  generate new apps — isn't in the crosshairs of 2.5.2. Folded into item
  1 as the primary corroboration for the 2.5.2-vs-4.2.3 correction.

Relevance to Strivo: MEDIUM-HIGH overall. Three of the four fetched
sources are vendor blogs with a commercial angle (selling cleanup
services, publishing platforms, or dev services) — read for their
specific factual claims, not their framing or advice to hire them. The
Hacker News thread is the one genuinely independent, first-hand source
in the batch and carries the most weight. The Xcode 26/iOS 26 SDK
deadline (item 8) is the single most actionable new finding — it's dated,
already in effect, and would block the Codemagic pipeline outright if
misconfigured, regardless of anything else in this checklist.

**2026-09-09 — Short-form transcript: "5 vibe-coded app performance
mistakes" (large images, no loading states, no caching, single JS bundle,
missing DB indexes).** Not App Store-specific, general performance advice
— logged here anyway since it's the same "check the claim against actual
Strivo code" discipline as everything else in this file. Checked all
five directly:
1. Large image uploads — N/A, Strivo has no image/profile-picture upload
   path at all (only document upload: PDF/docx/pptx/xlsx via FilePicker,
   already capped/handled).
2. No loading states — already extensive: dedicated `loading.tsx` per
   route (home, chats, memories, record, settings, subscription, profile)
   plus `<Spinner />` in client-fetch flows. Not a gap.
3. Refetch/no caching — mostly N/A: most pages are Server Components
   reading SQLite directly per request (no network round trip to cache),
   a materially different situation than the hosted-API apps this advice
   targets. A few client components do fetch their own API route on
   mount (subscription page, admin panels) — acceptable today since that
   data needs to be live/correct (trial status, billing), not stale-safe.
4. Single massive JS bundle — N/A, Next.js App Router already does
   automatic per-route code splitting by default; nothing in
   `next.config.ts` disables it.
5. Missing DB indexes — **real, fixed 2026-09-09.** `messages` had an
   index on `chat_id` only. `listMessagesWithEmbeddings` in
   `repo/messages.ts` — the cross-chat recall candidate pool, called on
   *every single chat send* (task #307/308's hot path) — filters
   `WHERE user_id = ?` first, with no index backing it, against the
   single fastest-growing, unbounded table in the app. Added
   `idx_messages_user` and `idx_messages_user_created` in `db.ts`
   (applies automatically on next deploy, same as any other
   `CREATE INDEX IF NOT EXISTS` migration — no manual DB step needed).
   Also covers `listAllMessagesForUser` (the GDPR/CCPA export route).

Relevance to Strivo: LOW-MEDIUM overall (4 of 5 points were already
handled or don't apply), but point 5 was a genuine, unflagged, real
performance gap on a real hot path — worth the check.

**2026-09 — Short-form transcript: "what Apple's human reviewer actually
does in the 90-second review."** Describes the review as: tap every
button hunting for placeholder/broken content; if login is required,
reviewer needs working demo credentials or notes on how to get in; any
subscription/one-time payment must go through Apple IAP, not
Stripe/external checkout; every requested permission (camera/location/
microphone) needs a justification string or it's rejected; any
AI-generated content must be disclosed; screenshots submitted are
compared side-by-side against the live app and flagged if they show
features/polish not actually present; social login (Google etc.)
requires Sign in with Apple alongside it; if the app supports account
deletion, it must be doable directly in-app.

Relevance to Strivo: mostly confirms items already tracked (demo account
guidance in item 1, permission strings in item 7, AI disclosure in item
3, Sign in with Apple in item 0, in-app deletion in item 2) — nothing new
there. Checking the IAP/external-payment claim against the actual
subscription page surfaced one genuinely new item: no live purchase flow
exists yet so there's no current violation, but the page's billing copy
is hardcoded to "Google Play" regardless of platform — new item 9 above,
to fix before Phase 6 ships real Apple IAP. The screenshot-matches-live-app
point is new too — folded into item 9 as a Phase 7 verification step, not
a code change.
