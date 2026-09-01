// Single source of truth for branding. Change APP_NAME (and optionally the
// tagline/gradient below) to re-skin the whole product without touching
// any screen code.
export const APP_NAME = "Strivo";
export const APP_TAGLINE = "Your personal AI, built from your own experiences.";

// Shared between the marketing homepage and the blog (every CTA/download
// link points here) so there's one place to update if the Play Store
// listing URL ever changes.
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=ai.strivo.app";

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

export const NEW_CHAT_TEMPLATES = [
  { category: "Interview", title: "Interview Preparation", prompt: "I want to prepare for an interview." },
  { category: "Resume", title: "Resume Builder", prompt: "I want to update my resume." },
  { category: "Performance Review", title: "Performance Review", prompt: "I want to prepare for my performance review." },
  { category: "Leadership", title: "Leadership Coach", prompt: "I want to find examples that show my leadership." },
  { category: "Others", title: "General Chat", prompt: "" },
] as const;
