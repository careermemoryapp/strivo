// Single source of truth for branding. Change APP_NAME (and optionally the
// tagline/gradient below) to re-skin the whole product without touching
// any screen code.
export const APP_NAME = "Strivo";
export const APP_TAGLINE = "Your personal AI, built from your own experiences.";

export const HOME_SUBTITLE = "Capture today. Remember forever. Achieve more.";

export const QUICK_ACTIONS = [
  {
    id: "interview",
    title: "Prepare for an interview",
    description: "Find the right stories and examples",
    chatTitle: "Interview Preparation",
    category: "Interview Prep",
    icon: "target",
    prompt:
      "Help me prepare for an upcoming interview. Ask me what role I'm interviewing for, then use my real experiences to suggest strong stories and examples I can share.",
  },
  {
    id: "resume",
    title: "Update my resume",
    description: "Create strong bullet points and impact",
    chatTitle: "Resume Builder",
    category: "Career Advice",
    icon: "file-text",
    prompt:
      "Help me update my resume. Use my real experiences to draft strong, impact-driven bullet points.",
  },
  {
    id: "promotion",
    title: "Prepare for promotion",
    description: "Showcase your growth and achievements",
    chatTitle: "Promotion Coach",
    category: "Career Advice",
    icon: "trending-up",
    prompt:
      "Help me prepare a case for promotion. Use my real experiences to showcase my growth and achievements.",
  },
  {
    id: "leadership",
    title: "Find leadership examples",
    description: "Discover moments that highlight your leadership",
    chatTitle: "Leadership Coach",
    category: "Career Advice",
    icon: "users",
    prompt:
      "Help me find examples from my real experiences that demonstrate leadership.",
  },
  {
    id: "capture",
    title: "Capture today's work",
    description: "Save your wins and progress",
    chatTitle: "",
    category: "Other",
    icon: "briefcase",
    prompt: "__CAPTURE__",
  },
  {
    id: "reflect",
    title: "Reflect",
    description: "Journal your thoughts and learnings",
    chatTitle: "Reflection",
    category: "Personal",
    icon: "sparkles",
    prompt:
      "I'd like to reflect on something. Ask me a thoughtful question to help me journal about my recent thoughts and learnings.",
  },
] as const;

export const CHAT_CATEGORIES = ["All", "Interview Prep", "Career Advice", "Personal", "Other"] as const;

export const NEW_CHAT_TEMPLATES = [
  { category: "Interview Prep", title: "Interview Preparation", prompt: "Help me prepare for an interview using my real experiences." },
  { category: "Career Advice", title: "Resume Builder", prompt: "Help me write strong resume bullet points using my real experiences." },
  { category: "Career Advice", title: "Promotion Coach", prompt: "Help me build a case for promotion using my real experiences." },
  { category: "Career Advice", title: "Leadership Coach", prompt: "Help me identify and articulate my leadership experiences." },
  { category: "Career Advice", title: "Career Advice", prompt: "I'd like career advice grounded in my real experiences." },
  { category: "Career Advice", title: "Performance Review", prompt: "Help me prepare for my performance review using my real experiences." },
  { category: "Personal", title: "Reflection", prompt: "I'd like to reflect on something using my real experiences." },
  { category: "Other", title: "General Chat", prompt: "" },
] as const;
