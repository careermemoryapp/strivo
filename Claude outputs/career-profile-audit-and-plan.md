# Strivo.ai Home Redesign — Phase 1 Audit + Phase 2 UX Plan

**Status: audit and plan only. No product code has been changed.** Per your process (Phase 1 → Phase 2 → explicit go-ahead → Phase 3), this document is the deliverable for the first two phases. Three real decisions need your call before I start Phase 3 — they're called out at the end.

---

## PHASE 1 — AUDIT

### 1. Current Home architecture

- `src/app/(app)/home/page.tsx` (Server Component, ~130 lines) fetches everything synchronously before first paint: user, streak (computed but **not currently rendered anywhere**), memory count (also fetched but unused), last 3 chats, trial-days-left, recap/growth/benchmark teasers (time-windowed: visible 8/21/30 days respectively), an active proactive check-in, and the Career Wrapped snapshot (entirely `null` if the `career_wrapped` flag is off).
- `src/app/(app)/home/HomeClient.tsx` (~460 lines) renders it all client-side, in this order: dark header (greeting + hero "Ask anything" input) → **Career Wrapped preview card** (deliberately placed right after the header, ahead of every digest teaser) → error banner → trial-ending banner → check-in teaser → recap teaser → growth teaser → benchmark teaser → "Record a memory" CTA card → Quick Actions list (Interview / Resume / Performance Review / Leadership / Others, each just a pre-seeded chat) → "Continue" recent chats.
- There is no dedicated "Ask Strivo.ai" page — the hero input is a chat starter that guesses a category from keywords and creates a chat via `POST /api/chats`.
- `GET /api/home` exists only as a manual retry endpoint for the error banner, not used on initial load.

**Reusable as-is:** the whole recap/growth/benchmark/check-in teaser pattern (time-windowed dismissible cards), the Quick Actions → pre-seeded-chat mechanism, the trial-banner pattern, and — most directly — `CareerWrappedHomePreview.tsx`'s **empty-tier branch**, which already does almost exactly what the spec wants demoted: a modest "Your Career Wrapped is taking shape" card with a Record CTA, shown only when `tier === "empty"`. This is the card the new Career Profile hero needs to outrank in visual priority for zero-data users, not replace outright.

### 2. Reusable Home components

`Button`, `Card` (light-theme token components), `DarkHeader` (the *canonical* dark header — Home itself doesn't use it, it reimplements an inline copy; Career Wrapped and Settings both use it). `ACTION_ICON_DEFS`/category icon lookups in `src/lib/categoryIcons.tsx`. `Avatar`. `NotificationBell`. None of these need to change for this feature — the new Career Profile surfaces should sit alongside them using the same visual primitives (glass panels, rounded-pill buttons, gradient accents) already established by Career Wrapped, not a new design language.

### 3. Current memory states

No general "meaningful memory" tier exists outside Career Wrapped's own gate: `CAREER_WRAPPED_THRESHOLDS = { minForAnyStats: 1, minForPatterns: 3, minForFullAnalysis: 5 }` → `getCareerWrappedDataTier()` → `"empty" | "basic" | "patterns" | "full"`. Your spec's State A–D thresholds (0 / 1–2 / 3–4 / 5+) map almost exactly onto this existing scale. I'll introduce a parallel, explicitly-named `HOME_STATE_THRESHOLDS` for the Home redesign (so it's independently configurable per your requirement) but seed it with the same numbers by default — no reason to invent different cutoffs than the ones already proven for Career Wrapped.

### 4. Existing Career Wrapped implementation

(I built the current version of this earlier in this session, so I know it in detail.) `src/lib/careerWrapped.ts` computes deterministic signals from real memory evidence: wins/leadership/problems-solved/senior-stakeholder counts, and a 12-muscle evidence map (`CAREER_MUSCLES_LIST`) derived from the memory competency taxonomy via a fixed `COMPETENCY_TO_MUSCLE` lookup — never a second AI pass. It produces `strongestMuscle`/`growingMuscle`/`underrepresentedMuscle`, a persona headline, an "archetype" title (`buildCareerArchetype`), and 2–3 forward-looking "achievement potential" lines — all string lookups keyed on real computed muscles, no fabrication. `src/lib/careerCardImage.tsx` renders a shareable 1080×1350 PNG via `next/og`/Satori (dark purple/blue gradient, glass panels, glow orbs — no blur filters, no Tailwind classes, everything inline `display:"flex"`). Sharing goes through `career_wrapped_shares` (public unguessable-slug rows, frozen `card_data` JSON, revocable) and a public `/cw/[shareId]` page, with native (`@capacitor/share`) → `navigator.share` → manual LinkedIn/X/WhatsApp intent links as a three-tier fallback.

**This is the single most reusable precedent in the codebase for Career Profile** — the share-model, the card-rendering approach, and the deterministic-scoring philosophy all transfer directly.

### 5. Existing resume functionality

`GET/POST/DELETE /api/profile/resume` stores raw resume text on the `users` row (`resume_text`/`resume_filename`/`resume_uploaded_at`). It feeds only the chat system prompt as background context — it is never classified, never embedded, never touches competency/muscle scoring. Not relevant to Career Profile quiz scoring today; could become a future input if you ever want "compare your quiz answers to your resume," but that's out of scope here.

### 6. Existing share/image-generation functionality

Fully covered in §4 — `next/og`/Satori PNG rendering plus the `*_shares` table + public share-page + three-tier share button pattern is the template the Career Profile Card will reuse almost verbatim (new table, new render file, new share routes, new public page — same shapes).

### 7. Existing analytics

`trackEvent(eventName, properties)` fire-and-forget POSTs to `/api/analytics/event`, which validates `event_name` server-side against a **closed zod enum** built from `CAREER_WRAPPED_EVENTS` in `src/lib/config.ts` — a misleadingly-named but currently Career-Wrapped-only allow-list. There's no general-purpose event system yet. Events land in `analytics_events` (nullable `user_id`, so logged-out visitors on `/cw/[shareId]` can already be tracked — the same table works for a logged-out quiz visitor). GA4 is deliberately excluded from the logged-in app entirely, so this is the only in-product analytics pipe.

**Proposal:** add a sibling `CAREER_PROFILE_EVENTS` const array (mirroring your requested event list in section 30) and widen `trackEvent`'s type signature and the server zod enum to accept the union of both arrays. Small, low-risk change — doesn't touch existing event names or the `analytics_events` schema.

### 8. Existing auth architecture

NextAuth, Google + Apple OAuth only (no email/password despite a vestigial `password_hash` column). Stateless 14-day JWT sessions. `requireUserId()` is the universal per-route guard. **No anonymous/guest session concept exists anywhere in the codebase.** The closest precedent to "public, pre-auth data" is `career_wrapped_shares` — but that's a read-only public view of an already-authenticated user's frozen result, not a writable anonymous session. Supporting a logged-out visitor *taking* a quiz and later claiming the result would require genuinely new plumbing: a signed guest-session cookie, a new guest-scoped table, and a claim step wired into the NextAuth `signIn` callback. This is flagged as a real decision below — it is not a small addition.

### 9. Existing design system

Two visual languages coexist today: light Tailwind tokens (`--color-brand-primary: #7c3aed`, etc.) used by most of the app, and a hardcoded dark palette used only by Home/DarkHeader/Career Wrapped/Settings-header (`#26213c` background, gradient pairs like `#2a2140→#3a2145` for cards, `#fbbf24→#f472b6` amber-pink for reward-loop CTAs, `#a78bfa→#60a5fa` purple-blue for primary actions, `#7c3aed→#4f6ef7` — the one that actually matches the real brand tokens — for share buttons). Career Profile should live entirely in the second (dark, glassy, gradient) visual language — it's already established, already feels premium, and is what your spec's mockups implicitly describe.

### 10. Existing DB structures relevant to this feature

SQLite (`node:sqlite`), one big idempotent `CREATE TABLE IF NOT EXISTS` migration block plus manual `ALTER TABLE` column-existence checks for incremental additions — no formal migration framework, the schema file itself is the source of truth. Every table uses `TEXT PRIMARY KEY` via `newId(prefix)`, except `career_wrapped_shares.id`, which is deliberately the public shareable slug — the pattern to copy for a `career_profile_shares.id`. `feature_flags` + `isFeatureEnabled()` is a 3-step, closed-list pattern (add to `FEATURE_FLAGS` array, seed in `db.ts`, gate call sites) that automatically surfaces in the admin panel — I'll add a `career_profile` flag the same way.

### 11. Existing Capacitor/native sharing support

`@capacitor/share` → `navigator.share` → manual platform-intent-link fallback, exactly as built for the Career Wrapped card (`CareerWrappedCardClient.tsx`). `markExpectedResume()` must be called before invoking native share so the app doesn't mistake the share-sheet hand-off for a background-resume that needs a reload. This transfers directly to the Career Profile Card's share flow.

### 12. Proposed Career Quiz Engine architecture

Content (quizzes/questions/answers/dimension-weights/archetype definitions) as **versioned TypeScript config**, not DB rows — this matches how `QUICK_ACTIONS`, `MEMORY_COMPETENCIES_LIST`, and `CAREER_MUSCLES_LIST` already work in this codebase (content-as-code, not a CMS), and there's no stated requirement for an admin UI to edit quiz copy. Each quiz gets a `quizId` + `version` (e.g. `career_superpower@v1`) so a future content change doesn't retroactively reinterpret old results — this is the same versioning discipline `career_wrapped_snapshots.analysis_version` already uses. A single generic `CareerQuizDefinition` TypeScript type drives all five quizzes; a single generic quiz-runner component and a single generic scoring function operate on any quiz that conforms to it. Only *progress, answers, and results* are persisted to the database (see §13) — never quiz definitions themselves.

### 13. Proposed Career Profile data model

New tables, following the `career_wrapped_shares` precedent closely:

- **`career_profile_results`** — `id` PK, `user_id` FK, `quiz_id`, `quiz_version`, `answers` (JSON, the raw answer-index array), `dimension_scores` (JSON), `result_key` (the archetype/result slug), `completed_at`. One row per completed quiz per user (retake overwrites in place unless you want history — see open question below on retake behavior).
- **`career_profile_cards`** — `id` PK = public shareable slug (mirrors `career_wrapped_shares.id`), `user_id` FK, `card_data` (frozen JSON — all 5 results at reveal time), `view_count`, `revoked`, `created_at`.
- Progress ("2/5 discovered") is derived, not separately stored — `SELECT quiz_id FROM career_profile_results WHERE user_id = ?` against the fixed 5-quiz list is enough; no separate progress table needed.

Kept structurally separate from `memories`/`career_wrapped_snapshots` at every layer — no shared table, no shared repo function — so quiz-derived data can never leak into memory-evidence-derived aggregates by accident.

### 14. Proposed scoring approach

Deterministic dimension-weight scoring, exactly as your spec describes: each answer option carries `{dimension: weight}` deltas (e.g. Answer A → `{strategic_thinking: +2, problem_solving: +1}`), summed across all answered questions, then mapped to the archetype whose dimension signature is the closest/highest match. Tie-breaks resolved by a **fixed archetype priority order** declared per quiz (first-listed archetype wins ties) — simple, deterministic, testable, and documented directly in the config file next to the archetype list, the same way `CAREER_MUSCLES_LIST`'s dev-time completeness assertions work today. No LLM call anywhere in the scoring path — same "cheap and instant" posture as Career Wrapped's own muscle computation.

### 15. Proposed Home state architecture

A single server-computed `homeState: "A" | "B" | "C" | "D"` (or your preferred letters/names) derived once in `page.tsx` from meaningful-memory count against `HOME_STATE_THRESHOLDS`, passed down alongside the existing `careerWrapped` and a new `careerProfile` (progress + results) prop. `HomeClient.tsx` branches its render order on `homeState`, not on scattered ad-hoc conditionals — this keeps the existing recap/growth/benchmark/check-in teasers, trial banner, and quick actions completely untouched; only the *position and prominence* of the Career Profile hero and the Career Wrapped preview shift per state, per your section 19–20 hierarchy.

### 16. Risks / migration concerns

- **Biggest risk is scope, not technical difficulty.** This spec describes a genuinely large feature (quiz engine + 5 quiz configs + scoring + progress persistence + card rendering + share flow + Home state machine + analytics + optional public funnel). Building all of it in one pass risks a long, hard-to-review, hard-to-test change. I'd rather stage it (see Phase 3 priority order below, which mirrors the order you already specified) and get your sign-off after the engine + first quiz is working end-to-end before building the remaining four.
- **Anonymous/guest quiz architecture (spec section 12) is real new plumbing**, not a config change — flagged as a decision, not assumed.
- **`HomeClient.tsx` is already a 460-line file with several time-windowed teaser cards.** Adding Career Profile without restructuring it into smaller subcomponents will make it unwieldy; I'll split it into subcomponents as part of this work rather than growing the single file further, which is a refactor of stable code — low risk (presentational only, no logic changes to existing cards) but worth flagging since your instructions say not to rewrite stable systems unnecessarily. I'll scope this narrowly: extract existing sections into their own files without changing their behavior, so it's mechanically safe.
- **Trial/paywall gating has no shared "requireActiveSubscription" helper** — every gate is copy-pasted per route, and the hard block is a `redirect` in `(app)/layout.tsx`. For Career Profile to work for an expired-trial user (recommended, since it's free/deterministic and a good re-engagement lever), its page route needs to live outside the `(app)` group (same idiom as `/trial-ended`, `/welcome-trial`) or need an explicit exemption added to the layout — either is safe, but it's a deliberate carve-out I want to confirm with you rather than assume.
- **No job queue exists in this codebase** — anything "background" is external cron hitting secret-gated routes. Quiz scoring is deterministic and instant, so this isn't a blocker, but if you ever want an LLM-generated narrative on top of the archetype result, it would need to follow the same synchronous-in-request pattern memory creation already uses (no infrastructure exists for anything else).

---

## PHASE 2 — UX PLAN

Visual language throughout: dark gradient background (`#1a1330 → #241a42 → #1a2247`, matching the Career Card), glass panels, rounded-pill buttons, amber/gold accents for "unlock/reward" moments (matching the existing reward-loop gradient), violet/blue for primary actions. Mobile-first, one primary action visible per screen.

### A. Brand-new zero-data user (first Home load after signup)

Header greeting as today. Immediately below it — replacing Career Wrapped's current top-of-Home slot — the **Career Profile hero**, now the dominant element:

```
Good afternoon, Shikhar 👋
Discover what makes you, you at work.
Take 5 quick career discoveries and unlock
your complete Career Profile.

CAREER PROFILE            0 / 5

○ ⚡ Career Superpower
○ 👀 Corporate Character
○ 🚩 Corporate Red Flag
○ 🤖 AI-Era Career Advantage
○ 🧠 Career Mode

🔒 Complete all 5 to unlock your Career Profile Card

[ Start discovering ]
```

Below that, in this order: a compact "Ask Strivo.ai" input (same hero input, just visually smaller/secondary now), a compact "+ Add a career memory 🎙" line CTA (not the big card), Quick Actions (unchanged), and — smallest, last, quietest — the existing empty-tier Career Wrapped teaser reworded slightly softer per your section 16 ("Your real Career Wrapped will grow as Strivo.ai learns about your work"). No giant recording card, no empty stat grid.

### B. 0/5 Career Profile completion (returning to Home without starting)

Same as State A's hero. If they've been away a few sessions, greeting copy can vary but the hero block itself stays identical — no change in mechanics, only in surrounding Home content as recap/growth teasers may start appearing once *any* memory exists (independent of quiz progress).

### C. 1/5

Hero collapses from the "start" framing to a progress framing:

```
Great start, Shikhar.
You've discovered your Career Superpower ⚡
Strategic Problem Solver

CAREER PROFILE            1 / 5
████░░░░░░░░░░░░░░░░

[⚡ Superpower ✓] [👀 Character] [🚩 Red Flag] [🤖 AI Era] [🧠 Career Mode]

NEXT DISCOVERY
👀 What corporate character are you?
[ Discover mine → ]
```

Same position on Home (still dominant), same visual weight.

### D. 3/5

```
YOU'RE MORE THAN HALFWAY THERE 🔥
3 of 5 discovered

[✓ Superpower] [✓ Character] [✓ Red Flag] [🤖 AI Era] [🧠 Career Mode]

🔒 2 more to unlock your Career Card

NEXT DISCOVERY
🤖 What's your AI-era career advantage?
[ Discover mine → ]
```

If the user now also has 1+ real memories by this point, a *second*, smaller "Your career is taking shape" strip can appear below the Career Profile hero (State B/C memory content from your section 20) — the two systems run in parallel on Home, never merged into one card.

### E. 4/5

```
ONE MORE TO GO 👀
Your Career Profile is almost ready.

[✓✓✓✓ ] [🧠 Career Mode]

[ Discover my Career Mode → ]
```

Slightly more urgency in copy/animation (a subtle pulse on the last locked pill) but same structure.

### F. Career Profile reveal (5/5)

Hero becomes a single reward moment:

```
✨ YOUR CAREER PROFILE IS READY

[ Reveal My Career Card ]
```

Tapping it navigates to a dedicated reveal screen (mirrors `career-wrapped/card`'s preview→generate flow) that shows the rendered card full-screen with a brief entrance animation, then the share tray slides up.

### G. Share flow

Same three-tier pattern as Career Wrapped: native share sheet (`@capacitor/share`) when on Android/iOS, `navigator.share` on web where supported, otherwise explicit LinkedIn / X / WhatsApp / Copy link / Download buttons — all always visible as a fallback tier exactly as `CareerWrappedCardClient.tsx` already does it. Suggested share copy pre-filled but editable wherever the platform allows editing before send (native share sheets typically don't allow Claude to intercept post-send edits, but the *text* handed to `Share.share()`/`navigator.share()` is exactly what you specified and the manual LinkedIn/X intents open with it pre-filled, editable in-platform as normal for those share intents).

Immediately below the share tray, the conversion nudge from your section 18:

```
Your Career Profile is based on your answers.
Now let Strivo.ai learn from your actual career.

"Tell me about something you're proud of
 from the last 30 days."

[ 🎙 Tell Strivo.ai ]   [ ⌨ Type it ]
```

### H. User with 1–2 real memories (State B)

Career Profile, if incomplete, keeps its dominant hero slot (acquisition still matters). If Career Profile is *already* complete, it shrinks to a compact "Your Career Profile ✓ [View/Share]" strip, and Home's new focus becomes:

```
YOUR CAREER IS TAKING SHAPE ✨
Early evidence: Problem Solving · Ownership

+ Add a career memory 🎙
```

No stat grid with zeros anywhere. Quick Actions unchanged, lower on the page.

### I. User with 3–4 real memories (State C)

```
STRIVO.AI NOTICED SOMETHING
"Problem Solving is emerging as one of
 your strongest career signals."

Career stories: 3 Wins · 2 Problem-Solving
 Examples · 1 Leadership Example
```

Career Profile (if complete) is now a small, secondary card — "Revisit your Career Profile" — no longer competing for the top slot. Career Wrapped preview (real, non-empty tier) can now appear using its existing `CareerWrappedHomePreview` non-empty branch, unchanged.

### J. Developed user, 5+ memories (State D)

Hierarchy matches your section 20 exactly: greeting + Ask Strivo.ai → Career Wrapped (full, existing component, unchanged) → a new "Personalized Career Insight" strip (evidence-gap prompt, e.g. "We haven't captured much People Development evidence yet — have you coached someone recently?") → a resurfaced-memory card ("Remember this? … [Turn into resume bullet] [Build STAR story]") → compact Add Memory → Career Profile/Card now fully demoted to a small "Your Career Profile" entry inside Quick Actions or just below it → Quick Actions.

*(Resurfaced memories and evidence-gap prompts are new logic on top of existing data — not in today's codebase. They're listed in your spec as part of this redesign, so they're scoped into Phase 3's later steps, not assumed already built.)*

### K. Public visitor from a shared Career Profile Card

Lands on `/cp/[shareId]` (mirrors `/cw/[shareId]` exactly): sees the shared person's card image, a one-line summary, "Discover yours →" CTA. Two sub-paths depending on your decision below:
- **If we ship signup-gated only (recommended for v1):** "Discover yours" routes straight to normal Google/Apple sign-in, then immediately into the quiz flow post-signup (skips Home entirely on first login, goes straight to Question 1 of the first quiz) — no quiz progress is lost because none was made pre-signup.
- **If we ship the full anonymous funnel (bigger build):** "Discover yours" starts the quiz immediately, no account required; a guest-session cookie tracks progress through all 5 quizzes; only at the reveal step does it prompt sign-in, then claims the guest results onto the new/matched account.

---

## Proposed Career Profile Card (visual)

Same 1080×1350 dark-gradient/glass-panel canvas as the Career Wrapped card, structurally simpler — five short result rows instead of paragraphs, so it reads instantly on a phone-sized social feed:

```
┌─────────────────────────────────┐
│  CAREER PROFILE          (eyebrow, gold pill)
│  Shikhar's Career Profile        (title)
│                                   │
│  ⚡ CAREER SUPERPOWER             │
│  Strategic Problem Solver         │
│  ─────────────────────────       │
│  👀 CORPORATE CHARACTER           │
│  The Fixer                        │
│  ─────────────────────────       │
│  🚩 CORPORATE RED FLAG            │
│  The Perfectionist                │
│  ─────────────────────────       │
│  🤖 AI-ERA ADVANTAGE              │
│  Human Judgment                   │
│  ─────────────────────────       │
│  🧠 CAREER MODE                   │
│  Owner Mode                       │
│                                   │
│  Generated by Strivo.ai           │
│  Discover yours → strivo.ai       │
└─────────────────────────────────┘
```

Five equal-weight glass rows (icon + eyebrow + bold result title, no body paragraph — keeps it scannable at feed size), divider lines between them, same footer/logo treatment as the existing Career Wrapped card so the two feel like siblings from the same brand system without being visually identical.

---

## Three decisions I need before Phase 3

**1. Anonymous/guest quiz funnel — build now, or defer?**
Building it requires new architecture (signed guest-session cookie, a guest-scoped table, a claim step in the NextAuth sign-in callback) that doesn't exist anywhere in this codebase today. My recommendation: ship v1 as **signup-gated** (quiz lives behind normal Google/Apple sign-in, which is already low-friction), validate the core loop and share rate first, then build the anonymous funnel as a fast-follow once we know people actually want to start before signing up. But this is explicitly your call per your spec's own section 12.

**2. Retake behavior** — if a completed quiz is retaken, should the new result overwrite the old one (simplest, matches "don't make users repeat quizzes unless they choose to"), or should we keep history (adds a small amount of schema/UI complexity for a "past results" view)? I'd default to overwrite-in-place unless you want history.

**3. Scope/staging for Phase 3** — build and ship all 5 quizzes + full Home redesign in one pass, or build the engine + 1 quiz (Career Superpower) end-to-end first, confirm it feels right in practice, then add the remaining 4 quizzes and the Home state redesign? I'd recommend the staged approach given the size of this feature, but you may prefer to see it all at once.

Once you confirm these three, I'll start Phase 3 in the priority order you specified (engine → quizzes → scoring → progress persistence → reveals → Home hero → card → sharing → zero-data Home → conversion → returning-user states → Career Wrapped integration → personalized prompts → analytics), testing and syncing to your `strivo` folder at each stage rather than as one giant drop.
