// Single source of truth for branding. Change APP_NAME (and optionally the
// tagline/gradient below) to re-skin the whole product without touching
// any screen code.
export const APP_NAME = "Strivo";
export const APP_TAGLINE = "Your personal AI, built from your own experiences.";

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
    category: "Interview Prep",
    icon: "target",
    prompt: "I want to prepare for an upcoming interview.",
  },
  {
    id: "resume",
    title: "Update my resume",
    description: "Create strong bullet points and impact",
    chatTitle: "Resume Builder",
    category: "Career Advice",
    icon: "file-text",
    prompt: "I want to update my resume.",
  },
  {
    id: "promotion",
    title: "Prepare for promotion",
    description: "Showcase your growth and achievements",
    chatTitle: "Promotion Coach",
    category: "Career Advice",
    icon: "trending-up",
    prompt: "I want to prepare a case for my promotion.",
  },
  {
    id: "leadership",
    title: "Find leadership examples",
    description: "Discover moments that highlight your leadership",
    chatTitle: "Leadership Coach",
    category: "Career Advice",
    icon: "users",
    prompt: "I want to find examples from my experience that show my leadership.",
  },
  {
    id: "performance",
    title: "Prepare for performance review",
    description: "Highlight your achievements and growth",
    chatTitle: "Performance Review",
    category: "Career Advice",
    icon: "award",
    prompt: "I want to prepare for my performance review.",
  },
  {
    id: "advice",
    title: "Get career advice",
    description: "Grounded in your real experiences",
    chatTitle: "Career Advice",
    category: "Career Advice",
    icon: "sparkles",
    prompt: "I'd like some career advice.",
  },
] as const;

export const CHAT_CATEGORIES = ["All", "Interview Prep", "Career Advice", "Personal", "Other"] as const;

export const NEW_CHAT_TEMPLATES = [
  { category: "Interview Prep", title: "Interview Preparation", prompt: "I want to prepare for an interview." },
  { category: "Career Advice", title: "Resume Builder", prompt: "I want to update my resume." },
  { category: "Career Advice", title: "Promotion Coach", prompt: "I want to prepare a case for my promotion." },
  { category: "Career Advice", title: "Leadership Coach", prompt: "I want to find examples that show my leadership." },
  { category: "Career Advice", title: "Career Advice", prompt: "I'd like some career advice." },
  { category: "Career Advice", title: "Performance Review", prompt: "I want to prepare for my performance review." },
  { category: "Personal", title: "Reflection", prompt: "I'd like to reflect on something." },
  { category: "Other", title: "General Chat", prompt: "" },
] as const;
