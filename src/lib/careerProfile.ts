// Career Profile -- the fun, quiz-answer-based "front door" experience on
// Home (see the Home redesign spec, section 1). This is a DELIBERATELY
// SEPARATE system from Career Wrapped (lib/careerWrapped.ts):
//
//   CAREER PROFILE  -- "What do my answers suggest about how I tend to work?"
//                       Based on quiz answers. Works with zero memories.
//                       Fun, identity-based, shareable, acquisition-oriented.
//
//   CAREER WRAPPED   -- "What does my actual career evidence show?"
//                       Based on real memories. Gets richer over time.
//                       Evidence-based, retention-oriented.
//
// Never blend the two: a Career Profile result must never be presented as
// though it were derived from the user's actual memories, and nothing here
// reads from or writes to memories/career_wrapped_* tables. See
// career_profile_results / career_profile_shares in lib/db.ts for the
// storage side of this same separation.
//
// ENGINE, NOT FIVE FEATURES: this file defines one generic quiz shape
// (CareerProfileQuizDefinition) and one generic deterministic scoring
// function (scoreCareerProfileQuiz) that any quiz conforming to that shape
// can use. CAREER_PROFILE_QUIZ_ORDER is the fixed 5-quiz roster; only
// CAREER_SUPERPOWER_QUIZ has real question/scoring content as of
// phase-3-stage-1 (see CAREER_PROFILE_QUIZZES[id].implemented) -- the
// remaining four quizzes are represented in the roster (so Home can render
// them as locked "coming soon" chips with correct "x of 5" progress math)
// but their content ships in a later stage, per the founder's staged
// rollout decision.

export type CareerProfileQuizId =
  | "career_superpower"
  | "corporate_character"
  | "corporate_red_flag"
  | "ai_era_advantage"
  | "career_mode";

// Fixed display/progress order -- "x / 5" and the chip row on Home both
// iterate this, never Object.keys() (which doesn't guarantee order).
export const CAREER_PROFILE_QUIZ_ORDER: CareerProfileQuizId[] = [
  "career_superpower",
  "corporate_character",
  "corporate_red_flag",
  "ai_era_advantage",
  "career_mode",
];

export type CareerProfileQuizMeta = {
  id: CareerProfileQuizId;
  version: number;
  title: string;
  subtitle: string;
  icon: string; // one emoji, used as the chip glyph and result-card icon
  resultLabel: string; // e.g. "CAREER SUPERPOWER" -- the eyebrow on the result reveal / card row
  implemented: boolean; // false = roster placeholder, not yet playable (see file comment)
};

export const CAREER_PROFILE_QUIZZES: Record<CareerProfileQuizId, CareerProfileQuizMeta> = {
  career_superpower: {
    id: "career_superpower",
    version: 1,
    title: "What's Your Career Superpower?",
    subtitle: "7 quick scenarios. About a minute.",
    icon: "⚡",
    resultLabel: "CAREER SUPERPOWER",
    implemented: true,
  },
  corporate_character: {
    id: "corporate_character",
    version: 1,
    title: "What Corporate Character Are You?",
    subtitle: "Coming soon",
    icon: "👀",
    resultLabel: "CORPORATE CHARACTER",
    implemented: false,
  },
  corporate_red_flag: {
    id: "corporate_red_flag",
    version: 1,
    title: "What's Your Corporate Red Flag?",
    subtitle: "Coming soon",
    icon: "🚩",
    resultLabel: "CORPORATE RED FLAG",
    implemented: false,
  },
  ai_era_advantage: {
    id: "ai_era_advantage",
    version: 1,
    title: "What's Your AI-Era Career Advantage?",
    subtitle: "Coming soon",
    icon: "🤖",
    resultLabel: "AI-ERA ADVANTAGE",
    implemented: false,
  },
  career_mode: {
    id: "career_mode",
    version: 1,
    title: "What's Your Career Mode?",
    subtitle: "Coming soon",
    icon: "🧠",
    resultLabel: "CAREER MODE",
    implemented: false,
  },
};

export type CareerProfileQuestionOption = {
  id: string; // stable within the question, e.g. "a" | "b" | "c" | "d"
  label: string;
  // The single dimension this option contributes +1 to. Deliberately
  // single-dimension-per-option for v1 -- simple, testable, explainable,
  // matches "deterministic scoring" requirement without needing a weight
  // matrix. Can grow into per-option weight maps later without changing
  // the stored-data shape (answers are stored as raw option ids either way).
  dimension: string;
};

export type CareerProfileQuestion = {
  id: string;
  prompt: string;
  options: CareerProfileQuestionOption[];
};

export type CareerProfileArchetype = {
  key: string; // matches the `dimension` value it corresponds to
  title: string;
  emoji: string;
  description: string; // the "why" line shown on the result reveal
};

export type CareerProfileQuizDefinition = {
  meta: CareerProfileQuizMeta;
  questions: CareerProfileQuestion[];
  archetypes: CareerProfileArchetype[];
  // First-listed key wins a tie in total dimension score. Fixed and
  // documented here (not derived at runtime) so scoring stays deterministic
  // and reproducible from the same answers every time.
  tieBreakOrder: string[];
};

// ---------------------------------------------------------------------------
// CAREER SUPERPOWER -- the one fully-implemented quiz for phase-3-stage-1.
// 7 scenario-based questions x 4 options, each option mapped to exactly one
// of 8 archetype dimensions. Coverage across the 7 questions is close to
// even (each dimension appears as an option 3-4 times) -- see the scoring
// test in tests/lib/careerProfile.test.ts for the exact tally.
// ---------------------------------------------------------------------------

const SUPERPOWER_ARCHETYPES: CareerProfileArchetype[] = [
  {
    key: "strategic_problem_solver",
    title: "The Strategic Problem Solver",
    emoji: "🧠",
    description: "You naturally bring structure to messy and ambiguous problems.",
  },
  {
    key: "builder",
    title: "The Builder",
    emoji: "🚀",
    description: "You'd rather build the thing than talk about building the thing.",
  },
  {
    key: "leader",
    title: "The Leader",
    emoji: "🧭",
    description: "People look to you for direction when things get uncertain.",
  },
  {
    key: "influencer",
    title: "The Influencer",
    emoji: "🤝",
    description: "You move rooms by bringing people along, not by outranking them.",
  },
  {
    key: "operator",
    title: "The Operator",
    emoji: "🔥",
    description: "You're the one who makes sure it actually happens, on time, every time.",
  },
  {
    key: "innovator",
    title: "The Innovator",
    emoji: "💡",
    description: "You default to trying something new before defaulting to how it's always been done.",
  },
  {
    key: "commercial_thinker",
    title: "The Commercial Thinker",
    emoji: "🎯",
    description: "You instinctively translate work into what it means for the business.",
  },
  {
    key: "people_builder",
    title: "The People Builder",
    emoji: "🌱",
    description: "You measure your own success partly by how much better the people around you get.",
  },
];

const SUPERPOWER_QUESTIONS: CareerProfileQuestion[] = [
  {
    id: "q1",
    prompt: "A project is going badly. What are you most likely to do first?",
    options: [
      { id: "a", label: "Find the root cause", dimension: "strategic_problem_solver" },
      { id: "b", label: "Get everyone aligned on what's actually happening", dimension: "influencer" },
      { id: "c", label: "Create a step-by-step recovery plan and start executing", dimension: "operator" },
      { id: "d", label: "Propose a completely different approach", dimension: "innovator" },
    ],
  },
  {
    id: "q2",
    prompt: "Your team just hit a wall on a big initiative. What's your instinct?",
    options: [
      { id: "a", label: "Rally the team and keep morale up", dimension: "leader" },
      { id: "b", label: "Just start building a fix yourself", dimension: "builder" },
      { id: "c", label: "Check what this means for the numbers and the deadline", dimension: "commercial_thinker" },
      { id: "d", label: "Pull the person struggling aside and help them personally", dimension: "people_builder" },
    ],
  },
  {
    id: "q3",
    prompt: "You're handed a vague, open-ended assignment with no clear owner. What do you do?",
    options: [
      { id: "a", label: "Break it into a clear, structured plan", dimension: "strategic_problem_solver" },
      { id: "b", label: "Just start making something tangible to react to", dimension: "builder" },
      { id: "c", label: "Go talk to stakeholders to understand what they actually want", dimension: "influencer" },
      { id: "d", label: "Take ownership and set the direction yourself", dimension: "leader" },
    ],
  },
  {
    id: "q4",
    prompt: "A colleague comes to you frustrated about a process that isn't working. Your first move?",
    options: [
      { id: "a", label: "Coach them through how to handle it", dimension: "people_builder" },
      { id: "b", label: "Suggest a smarter, newer way to do it", dimension: "innovator" },
      { id: "c", label: "Just quietly fix the process yourself", dimension: "operator" },
      { id: "d", label: "Ask what it's actually costing the business", dimension: "commercial_thinker" },
    ],
  },
  {
    id: "q5",
    prompt: "You get to pick your next project. What pulls you in most?",
    options: [
      { id: "a", label: "A messy, ambiguous problem nobody has solved yet", dimension: "strategic_problem_solver" },
      { id: "b", label: "Something you get to build from scratch", dimension: "builder" },
      { id: "c", label: "A high-stakes project where you'll influence senior stakeholders", dimension: "influencer" },
      { id: "d", label: "A new market or revenue opportunity", dimension: "commercial_thinker" },
    ],
  },
  {
    id: "q6",
    prompt: "A meeting is going in circles. What do you usually do?",
    options: [
      { id: "a", label: "Step in and set a clear direction", dimension: "leader" },
      { id: "b", label: "Propose a totally different way to think about it", dimension: "innovator" },
      { id: "c", label: "Bring it back to execution — what are we doing next", dimension: "operator" },
      { id: "d", label: "Make sure the quieter voices in the room get heard", dimension: "people_builder" },
    ],
  },
  {
    id: "q7",
    prompt: "What's most satisfying to you at the end of a project?",
    options: [
      { id: "a", label: "The problem is actually, provably solved", dimension: "strategic_problem_solver" },
      { id: "b", label: "Something real exists that didn't before", dimension: "builder" },
      { id: "c", label: "The team grew and leveled up through it", dimension: "people_builder" },
      { id: "d", label: "It moved the business forward in a measurable way", dimension: "commercial_thinker" },
    ],
  },
];

// Tie-break order: first-listed wins. Arbitrary but fixed and documented --
// see the file comment on CareerProfileQuizDefinition.tieBreakOrder.
const SUPERPOWER_TIE_BREAK_ORDER = [
  "strategic_problem_solver",
  "builder",
  "leader",
  "influencer",
  "operator",
  "innovator",
  "commercial_thinker",
  "people_builder",
];

export const CAREER_SUPERPOWER_QUIZ: CareerProfileQuizDefinition = {
  meta: CAREER_PROFILE_QUIZZES.career_superpower,
  questions: SUPERPOWER_QUESTIONS,
  archetypes: SUPERPOWER_ARCHETYPES,
  tieBreakOrder: SUPERPOWER_TIE_BREAK_ORDER,
};

// Every implemented quiz gets registered here -- getCareerProfileQuizDefinition
// is the only way callers (API routes, the quiz-runner UI) reach quiz
// content, so adding a quiz's content is a one-line registration once its
// questions/archetypes are written, without touching any call site.
const QUIZ_DEFINITIONS: Partial<Record<CareerProfileQuizId, CareerProfileQuizDefinition>> = {
  career_superpower: CAREER_SUPERPOWER_QUIZ,
};

export function getCareerProfileQuizDefinition(quizId: CareerProfileQuizId): CareerProfileQuizDefinition | null {
  return QUIZ_DEFINITIONS[quizId] ?? null;
}

// Dev-time completeness check -- every question's options must cover only
// dimensions that have a matching archetype, and every archetype should be
// reachable by at least one option, for every *implemented* quiz. Mirrors
// the MUSCLE_ARCHETYPE/MUSCLE_POTENTIAL completeness assertions in
// lib/careerWrapped.ts.
if (process.env.NODE_ENV !== "production") {
  for (const quiz of Object.values(QUIZ_DEFINITIONS)) {
    if (!quiz) continue;
    const archetypeKeys = new Set(quiz.archetypes.map((a) => a.key));
    const reachable = new Set<string>();
    for (const q of quiz.questions) {
      for (const opt of q.options) {
        reachable.add(opt.dimension);
        if (!archetypeKeys.has(opt.dimension)) {
          console.error(
            `Career Profile quiz "${quiz.meta.id}": question "${q.id}" option "${opt.id}" references unknown dimension "${opt.dimension}"`
          );
        }
      }
    }
    const unreachable = [...archetypeKeys].filter((k) => !reachable.has(k));
    if (unreachable.length > 0) {
      console.error(`Career Profile quiz "${quiz.meta.id}": archetype(s) never reachable by any option: ${unreachable.join(", ")}`);
    }
    if (!quiz.tieBreakOrder.every((k) => archetypeKeys.has(k)) || quiz.tieBreakOrder.length !== archetypeKeys.size) {
      console.error(`Career Profile quiz "${quiz.meta.id}": tieBreakOrder does not exactly match its archetype keys`);
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic scoring -- the one scoring function every quiz uses.
// ---------------------------------------------------------------------------

export type CareerProfileScoreResult = {
  dimensionScores: Record<string, number>;
  resultKey: string;
};

// `answers` is one option id per question, in the SAME order as
// quiz.questions (not keyed by question id) -- the API route validates
// length/option-id membership before calling this; this function assumes
// valid input and stays pure/synchronous so it's trivially unit-testable.
export function scoreCareerProfileQuiz(quiz: CareerProfileQuizDefinition, answers: string[]): CareerProfileScoreResult {
  const dimensionScores: Record<string, number> = {};
  for (const archetype of quiz.archetypes) {
    dimensionScores[archetype.key] = 0;
  }

  quiz.questions.forEach((question, index) => {
    const chosenOptionId = answers[index];
    const option = question.options.find((o) => o.id === chosenOptionId);
    if (!option) return; // invalid/missing answer for this question -- contributes nothing
    dimensionScores[option.dimension] = (dimensionScores[option.dimension] ?? 0) + 1;
  });

  let resultKey = quiz.tieBreakOrder[0];
  let bestScore = -Infinity;
  for (const key of quiz.tieBreakOrder) {
    const score = dimensionScores[key] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      resultKey = key;
    }
  }

  return { dimensionScores, resultKey };
}

export function getArchetypeByKey(quiz: CareerProfileQuizDefinition, key: string): CareerProfileArchetype | null {
  return quiz.archetypes.find((a) => a.key === key) ?? null;
}
