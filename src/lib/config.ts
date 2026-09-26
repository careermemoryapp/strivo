// Single source of truth for branding. Change APP_NAME (and optionally the
// tagline/gradient below) to re-skin the whole product without touching
// any screen code.
export const APP_NAME = "Strivo";
export const APP_TAGLINE = "Your personal AI, built from your own experiences.";

// Shared between the marketing homepage and the blog (every CTA/download
// link points here) so there's one place to update if the Play Store
// listing URL ever changes.
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=ai.strivo.app";

// Singular (MMP) tracking link for the blog's "Get the app" buttons only
// (created 2026-09-26, Custom Source "blog", link name "Blog CTA Buttons").
// It logs the click in Singular, redirects to the exact same Play Store
// listing as PLAY_STORE_URL above, and then matches a later install back to
// this click via Android's Play Install Referrer -- something GA4 can never
// do on its own (see PlayStoreLink.tsx's comment). Scoped to the blog
// specifically because that's the traffic this was built to measure; the
// homepage hero/nav links intentionally keep using the plain PLAY_STORE_URL
// for now.
export const SINGULAR_BLOG_LINK = "https://strivo.sng.link/Ddemo/rpqi7";

export const HOME_SUBTITLE = "Capture today. Remember forever. Achieve more.";

// Each quick action starts a new chat with `prompt` as the opening user
// message. Prompts are phrased as plain first-person statements (not
// instructions to the AI) — the system prompt in lib/ai.ts is responsible
// for making the assistant ask a clarifying question before it searches
// memories, so that logic lives in one place instead of being repeated here.
export const QUICK_ACTIONS = [
  {
    id: "interview",
    title: "Prepare for an interview",
    description: "Find the right stories and examples",
    chatTitle: "Interview Preparation",
    category: "Interview",
    icon: "target",
    prompt: "I want to prepare for an upcoming interview.",
  },
  {
    id: "resume",
    title: "Update my resume",
    description: "Create strong bullet points and impact",
    chatTitle: "Resume Builder",
    category: "Resume",
    icon: "file-text",
    prompt: "I want to update my resume.",
  },
  {
    id: "performance",
    title: "Prepare for performance review",
    description: "Highlight your achievements and growth",
    chatTitle: "Performance Review",
    category: "Performance Review",
    icon: "award",
    prompt: "I want to prepare for my performance review.",
  },
  {
    id: "leadership",
    title: "Find leadership examples",
    description: "Discover moments that highlight your leadership",
    chatTitle: "Leadership Coach",
    category: "Leadership",
    icon: "users",
    prompt: "I want to find examples from my experience that show my leadership.",
  },
  {
    id: "others",
    title: "Others",
    description: "Anything else — general chat or career advice",
    chatTitle: "New Chat",
    category: "Others",
    icon: "more",
    prompt: "",
  },
] as const;

export const CHAT_CATEGORIES = ["All", "Interview", "Resume", "Leadership", "Performance Review", "Others"] as const;

// Memory category taxonomy -- single source of truth for both the
// server-only AI prompt (lib/ai.ts's CATEGORY_OPTIONS is built from this)
// and any client component that needs the list without pulling in ai.ts,
// which is server-only (see its file-top comment) and would break a "use
// client" build if imported directly. See MEMORY_CATEGORIES in
// lib/categoryIcons.tsx for the matching icon/color per category -- add a
// new category to both places to extend the taxonomy.
export const MEMORY_CATEGORIES_LIST = [
  "Work", "Meeting", "Career", "Idea", "Review", "Learning", "Achievement", "Personal", "General",
] as const;

// Behavioral-interview + modern-work competency taxonomy -- see the full
// reasoning in generateMemoryMetadata's comment in lib/ai.ts, which builds
// its exported COMPETENCY_OPTIONS from this. Kept here (not ai.ts) for the
// same client-safety reason as MEMORY_CATEGORIES_LIST above -- e.g. the
// Memories list competency filter (MemoriesListClient.tsx) needs this list
// without importing a server-only file.
export const MEMORY_COMPETENCIES_LIST = [
  "Leadership",
  "Ownership & Initiative",
  "Problem-Solving",
  "Collaboration & Teamwork",
  "Communication",
  "Conflict Resolution",
  "Mentorship & Coaching",
  "Innovation & Creativity",
  "Adaptability & Resilience",
  "Strategic Thinking",
  "Stakeholder Focus",
  "Results & Impact",
  "Technical & Hard Skills",
  "AI & Tools Fluency",
  "Data-Driven Decision Making",
  "Product & Business Thinking",
  "Negotiation & Influence",
  "Time & Priority Management",
  "Crisis Management",
  "Learning Agility",
  "Customer & User Empathy",
  "Risk & Quality Management",
] as const;

// "Career Muscles" -- the manageable, user-facing taxonomy Career Wrapped
// scores (see lib/careerWrapped.ts). Deliberately a SEPARATE, coarser list
// from MEMORY_COMPETENCIES_LIST above rather than reusing it directly: the
// spec asks for "approximately 12" categories a person can actually hold in
// their head, not the 22-item behavioral-interview taxonomy that already
// exists for a different purpose (surfacing specific competencies on a
// single memory). Every competency maps to exactly one muscle (see
// COMPETENCY_TO_MUSCLE in lib/careerWrapped.ts) so evidence counted here is
// 100% derived from the same AI-classified `memories.competencies` data
// already being generated today -- no new AI classification call, no new
// per-memory column, nothing invented. Kept in config.ts (not
// careerWrapped.ts) for the same client-safety reason as the two lists
// above: client components that just need the label list (e.g. a filter
// chip row) shouldn't have to import server-only code to get it.
export const CAREER_MUSCLES_LIST = [
  "Strategic Thinking",
  "Problem Solving",
  "Leadership",
  "Execution",
  "Stakeholder Management",
  "Communication",
  "Collaboration",
  "Innovation",
  "Ownership",
  "Commercial Impact",
  "Customer Focus",
  "People Development",
] as const;

// Fixed industry taxonomy for the Opportunities tab's matching engine (see
// lib/opportunities.ts). This is deliberately a CLOSED list rather than
// open text, and it's shared by two places that need to describe industry
// the exact same way to be comparable at all: generateSuggestedRoles'
// per-role `industry` field (what industry a PERSON'S evidence points at)
// and classifyJobPostings' `industry` field (what industry a JOB POSTING
// belongs to) -- both in lib/ai.ts. Before this existed, both sides wrote
// independent freeform text ("Automotive", "Automotive Manufacturing",
// "Auto sector"...) that looked similar but never matched exactly, so
// nothing could actually check "is this job the same industry as this
// person" -- it could only be judged loosely, at ranking time, by an LLM
// re-reading raw text every single time. A closed, shared vocabulary turns
// that into a plain equality check the matcher can run cheaply and
// consistently over the whole pool. Picked as a broad-but-manageable set
// covering the sectors Strivo's own users' memories/resumes actually name
// most (a direct founder call, discussing the "13, 14, 15... call it 16
// industries" scope) -- grow this list rather than letting either side
// invent an ad hoc entry outside it, or the two sides drift apart again.
export const OPPORTUNITY_INDUSTRIES_LIST = [
  "Automotive",
  "Manufacturing / Industrial",
  "Technology / SaaS",
  "IT Services / Consulting",
  "BFSI (Banking, Financial Services & Insurance)",
  "Retail / E-commerce",
  "FMCG / Consumer Goods",
  "Healthcare / Pharma",
  "Real Estate / Construction",
  "Energy / Renewable Energy",
  "Telecom",
  "Media / Entertainment",
  "Education / EdTech",
  "Logistics / Supply Chain",
  "Hospitality / Travel",
  "Agriculture / Agritech",
] as const;

// Fixed seniority bands -- same "closed list so both sides are directly
// comparable" reasoning as OPPORTUNITY_INDUSTRIES_LIST above. One band
// describes a PERSON overall (generateSuggestedRoles' top-level `seniority`
// field, distinct from the per-role industry above), the other describes a
// JOB POSTING (classifyJobPostings' `seniority` field) -- both in
// lib/ai.ts. Four bands, not a raw years-of-experience number: coarse
// enough that the model can commit to one confidently from a title +
// description alone, which a specific number never would be.
export const OPPORTUNITY_SENIORITY_LIST = ["Entry-level", "Mid-level", "Senior", "Leadership"] as const;

// Job marketplaces / aggregators to exclude -- matched by hostname suffix,
// so "www.linkedin.com" and "in.linkedin.com" both match "linkedin.com".
// Deliberately NOT exhaustive of every job site that exists; this is the
// practical list of what actually turns up in Adzuna's India results.
// Extend it here if a refresh keeps letting another aggregator through.
//
// Lives here (not lib/applyLinkResolver.ts, which is server-only -- see
// that file's own top comment) specifically so it's usable from a "use
// client" component: OpportunitiesClient.tsx also needs this list, to
// decide whether a job's sourceUrl is a real employer/ATS domain worth
// trying a company-logo lookup against, or Adzuna's own click-tracking
// redirect / a portal landing page that a logo lookup would show the wrong
// (or no) icon for. applyLinkResolver.ts imports this same list rather
// than keeping its own copy, so there's exactly one list to extend.
export const AGGREGATOR_DOMAINS = [
  "adzuna.com",
  "adzuna.in",
  "linkedin.com",
  "indeed.com",
  "in.indeed.com",
  "naukri.com",
  "naukrigulf.com",
  "monsterindia.com",
  "monster.com",
  "foundit.in",
  "shine.com",
  "timesjobs.com",
  "glassdoor.com",
  "glassdoor.co.in",
  "ziprecruiter.com",
  "simplyhired.com",
  "simplyhired.co.in",
  "careerbuilder.com",
  "careerjet.com",
  "careerjet.co.in",
  "jooble.org",
  "jora.com",
  "talent.com",
  "jobrapido.com",
  "jobsora.com",
  "instahyre.com",
  "hirist.com",
  "iimjobs.com",
  "cutshort.io",
  "wellfound.com",
  "angel.co",
  "apna.co",
  "freshersworld.com",
  "quikrjobs.com",
  "ncs.gov.in",
  "receptix.com",
  "google.com", // Google for Jobs aggregation pages, not a real employer flow
];

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Exact match or subdomain match ("in.indeed.com" -> matches "indeed.com").
export function isAggregatorDomain(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return true; // unparseable URL -- treat as untrusted, exclude
  return AGGREGATOR_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

// Fixed allow-list of Career Wrapped analytics events (see the spec's
// analytics section) -- the single source of truth for both the client
// trackEvent() helper (lib/trackEvent.ts) and the API route that persists
// them (app/api/analytics/event/route.ts), so a typo in an event name fails
// loudly in dev instead of silently creating a slightly-differently-spelled
// event that quietly fragments the data. Kept in config.ts (not
// trackEvent.ts or the analytics repo file) for the same client-safety
// reason as the lists above -- client components need this list without
// importing anything server-only.
export const CAREER_WRAPPED_EVENTS = [
  "career_wrapped_home_impression",
  "career_wrapped_opened",
  "career_wrapped_completed",
  "career_card_generated",
  "career_card_share_clicked",
  "career_card_shared_linkedin",
  "career_card_shared_x",
  "career_card_shared_whatsapp",
  "career_card_downloaded",
  "career_wrapped_add_memory_clicked",
  // Fired from ResumeStatsUploadCta in CareerWrappedHomePreview.tsx -- the
  // "your resume also shows X -- upload it as a story" nudge shown to newer
  // accounts, which links to Record's Upload tab rather than converting the
  // resume automatically (see that component's own comment for why).
  "resume_stats_upload_clicked",
  // Fired from ResumeUploadStarterCta in CareerWrappedHomePreview.tsx --
  // ResumeStatsUploadCta's generic sibling, shown on the empty "taking
  // shape" state to accounts that haven't uploaded a resume yet at all (see
  // that component's own comment).
  "resume_upload_starter_clicked",
] as const;

// Career Profile (the quiz-based Home experience, kept deliberately separate
// from Career Wrapped -- see lib/careerProfile.ts's file comment) analytics
// events. Same closed-allow-list convention as CAREER_WRAPPED_EVENTS just
// above: lib/trackEvent.ts's type and the server zod enum in
// app/api/analytics/event/route.ts both derive from the UNION of this array
// and CAREER_WRAPPED_EVENTS, not from this one alone -- see trackEvent.ts.
// The card_* events mirror CAREER_WRAPPED_EVENTS' own card-generation/share
// events one-for-one (career_profile_card_generated <-> career_card_generated,
// etc.) but under distinct names so a Career Profile share can never be
// confused with a Career Wrapped share in analytics.
export const CAREER_PROFILE_EVENTS = [
  "career_profile_viewed",
  "career_profile_started",
  "career_profile_progress",
  "career_quiz_started",
  "career_quiz_question_answered",
  "career_quiz_completed",
  "career_profile_completed",
  "career_profile_card_revealed",
  "career_profile_card_generated",
  "career_profile_card_share_clicked",
  "career_profile_card_shared_linkedin",
  "career_profile_card_shared_x",
  "career_profile_card_shared_whatsapp",
  "career_profile_card_downloaded",
  "career_profile_add_memory_clicked",
] as const;

export const NEW_CHAT_TEMPLATES = [
  { category: "Interview", title: "Interview Preparation", prompt: "I want to prepare for an interview." },
  { category: "Resume", title: "Resume Builder", prompt: "I want to update my resume." },
  { category: "Performance Review", title: "Performance Review", prompt: "I want to prepare for my performance review." },
  { category: "Leadership", title: "Leadership Coach", prompt: "I want to find examples that show my leadership." },
  { category: "Others", title: "General Chat", prompt: "" },
] as const;
