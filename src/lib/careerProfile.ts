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
    subtitle: "7 quick scenarios. About a minute.",
    icon: "👀",
    resultLabel: "CORPORATE CHARACTER",
    implemented: true,
  },
  corporate_red_flag: {
    id: "corporate_red_flag",
    version: 1,
    title: "What's Your Corporate Red Flag?",
    subtitle: "7 quick scenarios. About a minute.",
    icon: "🚩",
    resultLabel: "CORPORATE RED FLAG",
    implemented: true,
  },
  ai_era_advantage: {
    id: "ai_era_advantage",
    version: 1,
    title: "What's Your AI-Era Career Advantage?",
    subtitle: "7 quick scenarios. About a minute.",
    icon: "🤖",
    resultLabel: "AI-ERA ADVANTAGE",
    implemented: true,
  },
  career_mode: {
    id: "career_mode",
    version: 1,
    title: "What's Your Career Mode?",
    subtitle: "7 quick scenarios. About a minute.",
    icon: "🧠",
    resultLabel: "CAREER MODE",
    implemented: true,
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
    description:
      "You naturally bring structure to messy, ambiguous problems — mapping root causes before anyone else has even framed the question. Teams hand you the confusing stuff because you make it tractable, not because you already have the answer, but because you know how to find it.",
  },
  {
    key: "builder",
    title: "The Builder",
    emoji: "🚀",
    description:
      "You'd rather build the thing than talk about building the thing. Given a vague brief, your first move is always to make something real and tangible, then improve it — momentum matters more to you than a perfect plan on paper.",
  },
  {
    key: "leader",
    title: "The Leader",
    emoji: "🧭",
    description:
      "People look to you for direction when things get uncertain, even when you don't have the title for it. You're comfortable making the call when nobody else will, and that steadiness is exactly what teams remember under pressure.",
  },
  {
    key: "influencer",
    title: "The Influencer",
    emoji: "🤝",
    description:
      "You move rooms by bringing people along, not by outranking them. Your instinct is always to understand what everyone actually needs before you push for an outcome — which is why the outcomes you push for tend to stick.",
  },
  {
    key: "operator",
    title: "The Operator",
    emoji: "🔥",
    description:
      "You're the one who makes sure it actually happens, on time, every time. While others debate the plan, you're already tracking the dependencies and closing the gaps — reliability, to you, is a competitive advantage, not just a trait.",
  },
  {
    key: "innovator",
    title: "The Innovator",
    emoji: "💡",
    description:
      "You default to trying something new before defaulting to how it's always been done. You're genuinely energized by the unproven approach, and you've learned that being first to a better way is usually worth the risk of being wrong once in a while.",
  },
  {
    key: "commercial_thinker",
    title: "The Commercial Thinker",
    emoji: "🎯",
    description:
      "You instinctively translate work into what it means for the business — the revenue, the cost, the deadline that actually matters. Where others see a task, you see the number it's supposed to move, and that's what makes your instincts hard to argue with.",
  },
  {
    key: "people_builder",
    title: "The People Builder",
    emoji: "🌱",
    description:
      "You measure your own success partly by how much better the people around you get. Coaching someone through a hard moment isn't a distraction from your real job — to you, it is the real job, and it's why people remember working with you.",
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

// ---------------------------------------------------------------------------
// CORPORATE CHARACTER -- "which coworker are you" framing. All 8 results are
// deliberately flattering (positive-framing rule) -- there is no "bad"
// character to land on, only a different flavor of valuable.
// ---------------------------------------------------------------------------

const CHARACTER_ARCHETYPES: CareerProfileArchetype[] = [
  {
    key: "fixer",
    title: "The Fixer",
    emoji: "🧯",
    description:
      "You solve the fire before most people even smell the smoke. You've built a quiet radar for what's about to go wrong, and you'd rather fix it than get credit for noticing it first.",
  },
  {
    key: "diplomat",
    title: "The Diplomat",
    emoji: "🤝",
    description:
      "You keep the room together when everyone else is picking sides. You read what each side actually needs before you say a word, which is why people trust you to carry the hard conversations.",
  },
  {
    key: "strategist",
    title: "The Strategist",
    emoji: "♟️",
    description:
      "You're already three moves ahead of the conversation happening right now. While the room is reacting to today's fire, you're quietly working out what this means for next quarter — and you're usually right.",
  },
  {
    key: "hype_machine",
    title: "The Hype Machine",
    emoji: "⚡",
    description:
      "Your energy is contagious, and teams move faster around you. You've figured out that momentum is often more valuable than perfect execution, so you spend yours making sure nobody in the room runs out of it.",
  },
  {
    key: "workhorse",
    title: "The Workhorse",
    emoji: "💪",
    description:
      "You quietly get more done than anyone realizes, without needing the credit for it. You'd rather the work speak for itself, and over time, it always does — people notice who's actually reliable.",
  },
  {
    key: "wildcard",
    title: "The Wildcard",
    emoji: "🃏",
    description:
      "You bring the angle nobody saw coming, and it usually works. You're comfortable being the person who says the unconventional thing out loud, because you've learned the obvious answer is rarely the interesting one.",
  },
  {
    key: "mentor",
    title: "The Mentor",
    emoji: "🌱",
    description:
      "People remember you as the one who actually took the time to explain it. You get real satisfaction from someone else's breakthrough, even when it costs you time you didn't really have to spare.",
  },
  {
    key: "closer",
    title: "The Closer",
    emoji: "🎯",
    description:
      "When it absolutely has to land, you're the one people bring in. You're calm exactly when the stakes are highest, and that composure is what actually gets deals — and decisions — across the line.",
  },
];

const CHARACTER_QUESTIONS: CareerProfileQuestion[] = [
  {
    id: "q1",
    prompt: "At the holiday party, you're most likely to be…",
    options: [
      { id: "a", label: "Deep in a conversation solving someone's low-key work drama", dimension: "fixer" },
      { id: "b", label: "The one who somehow gets along with every department", dimension: "diplomat" },
      { id: "c", label: "Chatting with leadership about what's coming next year", dimension: "strategist" },
      { id: "d", label: "Getting the whole room laughing", dimension: "hype_machine" },
    ],
  },
  {
    id: "q2",
    prompt: "A new tool or process rolls out at work. What's your move?",
    options: [
      { id: "a", label: "Quietly master it before the official training", dimension: "workhorse" },
      { id: "b", label: "Find a completely unexpected use for it", dimension: "wildcard" },
      { id: "c", label: "Help your team get comfortable with it", dimension: "mentor" },
      { id: "d", label: "Use it to finally get that stalled deal over the line", dimension: "closer" },
    ],
  },
  {
    id: "q3",
    prompt: "Your reputation on the team is basically…",
    options: [
      { id: "a", label: "Calm under pressure — you handle the fire someone else started", dimension: "fixer" },
      { id: "b", label: "The one who keeps every side talking to each other", dimension: "diplomat" },
      { id: "c", label: "Always thinking two moves ahead of everyone else", dimension: "strategist" },
      { id: "d", label: "The energy that makes the room want to keep going", dimension: "hype_machine" },
    ],
  },
  {
    id: "q4",
    prompt: "How would your manager describe your work style?",
    options: [
      { id: "a", label: "Reliable — things just get done, no drama", dimension: "workhorse" },
      { id: "b", label: "Unconventional, but it somehow works", dimension: "wildcard" },
      { id: "c", label: "Patient — great with people who are still learning", dimension: "mentor" },
      { id: "d", label: "Persuasive — you get people to yes", dimension: "closer" },
    ],
  },
  {
    id: "q5",
    prompt: "A meeting is getting tense. What's your role?",
    options: [
      { id: "a", label: "Fix the actual problem quietly, after the meeting", dimension: "fixer" },
      { id: "b", label: "Defuse the tension in the room", dimension: "diplomat" },
      { id: "c", label: "Steer it back to what actually matters long-term", dimension: "strategist" },
      { id: "d", label: "Lighten the mood so people can think straight", dimension: "hype_machine" },
    ],
  },
  {
    id: "q6",
    prompt: "A junior teammate is stuck. What do you do?",
    options: [
      { id: "a", label: "Just take the task off their plate and get it done", dimension: "workhorse" },
      { id: "b", label: "Suggest a totally different way to approach it", dimension: "wildcard" },
      { id: "c", label: "Sit with them and walk it through, step by step", dimension: "mentor" },
      { id: "d", label: "Help them see exactly what will land with the client", dimension: "closer" },
    ],
  },
  {
    id: "q7",
    prompt: "In a high-stakes pitch or negotiation, what's your superpower?",
    options: [
      { id: "a", label: "You've already fixed the objections before they're raised", dimension: "fixer" },
      { id: "b", label: "You read the room and know exactly what everyone needs to hear", dimension: "diplomat" },
      { id: "c", label: "You bring an angle nobody else thought of", dimension: "wildcard" },
      { id: "d", label: "You're the one who actually closes it", dimension: "closer" },
    ],
  },
];

const CHARACTER_TIE_BREAK_ORDER = ["fixer", "diplomat", "strategist", "hype_machine", "workhorse", "wildcard", "mentor", "closer"];

export const CORPORATE_CHARACTER_QUIZ: CareerProfileQuizDefinition = {
  meta: CAREER_PROFILE_QUIZZES.corporate_character,
  questions: CHARACTER_QUESTIONS,
  archetypes: CHARACTER_ARCHETYPES,
  tieBreakOrder: CHARACTER_TIE_BREAK_ORDER,
};

// ---------------------------------------------------------------------------
// CORPORATE RED FLAG -- deliberately self-aware/playful (the popular
// "red flag or green flag" quiz format), never mean-spirited. Every result
// is framed as an endearing quirk, not a flaw -- consistent with the
// positive-framing rule even where the quiz concept itself is a light,
// affectionate self-roast.
// ---------------------------------------------------------------------------

const RED_FLAG_ARCHETYPES: CareerProfileArchetype[] = [
  {
    key: "perfectionist",
    title: "The Perfectionist",
    emoji: "🔍",
    description:
      "You'll rewrite it five times before anyone else even notices a typo. It's not about ego — you just can't send something out into the world that you know could be a little bit better, even at 11pm on a Friday.",
  },
  {
    key: "over_committer",
    title: "The Over-Committer",
    emoji: "🙋",
    description:
      "You say yes before checking your calendar, then somehow still deliver. Your genuine enthusiasm for helping outruns your actual bandwidth on a fairly regular basis — and yet, somehow, it always gets done.",
  },
  {
    key: "control_enthusiast",
    title: "The Control Enthusiast",
    emoji: "🎛️",
    description:
      "Delegating is a skill you're \"still working on\" — your words. You don't distrust your team, exactly; you just trust your own version of \"done right\" a little more than everyone else's.",
  },
  {
    key: "people_pleaser",
    title: "The People-Pleaser",
    emoji: "🤲",
    description:
      "You'd rather stay late than let anyone down. Saying no feels almost physically uncomfortable, so you find yourself absorbing more than your fair share — usually without anyone even asking you to.",
  },
  {
    key: "last_minute_genius",
    title: "The Last-Minute Genius",
    emoji: "⏰",
    description:
      "You do your best work right up against the deadline, every time. Early starts have never quite worked for you — something about the pressure of the clock is what actually gets your best ideas out.",
  },
  {
    key: "multitasker",
    title: "The Chronic Multitasker",
    emoji: "🎪",
    description:
      "You've got six things open at once and somehow all of them are urgent. Single-tasking has never really suited you — you think better with a few plates spinning than with one thing in front of you at a time.",
  },
  {
    key: "devils_advocate",
    title: "The Devil's Advocate",
    emoji: "🥊",
    description:
      "You'll poke holes in the plan — even your own — just to stress-test it. It's not pessimism, it's a habit: if a plan can survive you arguing against it, you figure it can survive contact with reality too.",
  },
  {
    key: "silent_fixer",
    title: "The Silent Fixer",
    emoji: "🤫",
    description:
      "You quietly clean up messes instead of ever mentioning who made them. Credit has never really been the point for you — you just can't leave something broken sitting there when you know how to fix it.",
  },
];

const RED_FLAG_QUESTIONS: CareerProfileQuestion[] = [
  {
    id: "q1",
    prompt: "It's 6pm and the deck is \"done.\" What do you actually do?",
    options: [
      { id: "a", label: "Open it one more time to fix something only you'd notice", dimension: "perfectionist" },
      { id: "b", label: "Say yes to reviewing someone else's deck too", dimension: "over_committer" },
      { id: "c", label: "Rebuild the slide your teammate made, just slightly better", dimension: "control_enthusiast" },
      { id: "d", label: "Stay late to make sure everyone else feels good about it first", dimension: "people_pleaser" },
    ],
  },
  {
    id: "q2",
    prompt: "A deadline is tomorrow morning. Where are you tonight?",
    options: [
      { id: "a", label: "Just getting started — you do your best work under pressure", dimension: "last_minute_genius" },
      { id: "b", label: "Juggling it alongside three other \"quick\" things", dimension: "multitasker" },
      { id: "c", label: "Rethinking the whole approach one more time", dimension: "devils_advocate" },
      { id: "d", label: "Quietly fixing an error someone else left in it", dimension: "silent_fixer" },
    ],
  },
  {
    id: "q3",
    prompt: "Someone asks you to delegate part of your workload. Your honest reaction?",
    options: [
      { id: "a", label: "It'll just be faster if I do it myself, properly", dimension: "perfectionist" },
      { id: "b", label: "Sure — and I'll take on a bit more too", dimension: "over_committer" },
      { id: "c", label: "I'll delegate it… and then quietly check their work", dimension: "control_enthusiast" },
      { id: "d", label: "I don't want to burden anyone else with it", dimension: "people_pleaser" },
    ],
  },
  {
    id: "q4",
    prompt: "In a planning meeting, what role do you keep falling into?",
    options: [
      { id: "a", label: "The one who'll figure out the details later", dimension: "last_minute_genius" },
      { id: "b", label: "The one tracking five different threads at once", dimension: "multitasker" },
      { id: "c", label: "The one asking \"but what if this breaks?\"", dimension: "devils_advocate" },
      { id: "d", label: "The one who already patched the issue before the meeting started", dimension: "silent_fixer" },
    ],
  },
  {
    id: "q5",
    prompt: "Your inbox is a mess. What's really going on?",
    options: [
      { id: "a", label: "You're drafting the \"perfect\" reply to three emails", dimension: "perfectionist" },
      { id: "b", label: "You've said yes to more than you can realistically do this week", dimension: "over_committer" },
      { id: "c", label: "You're cc'd on everything because you like staying in the loop", dimension: "control_enthusiast" },
      { id: "d", label: "You're answering everyone else's urgent thing before your own", dimension: "people_pleaser" },
    ],
  },
  {
    id: "q6",
    prompt: "How do you actually feel about deadlines?",
    options: [
      { id: "a", label: "They're basically a start time, not an end time", dimension: "last_minute_genius" },
      { id: "b", label: "There are always three of them at once anyway", dimension: "multitasker" },
      { id: "c", label: "They're a great excuse to question if this is even the right plan", dimension: "devils_advocate" },
      { id: "d", label: "You quietly hit them without telling anyone how close it was", dimension: "silent_fixer" },
    ],
  },
  {
    id: "q7",
    prompt: "What would your closest coworker tease you about?",
    options: [
      { id: "a", label: "Redoing something that was already fine", dimension: "perfectionist" },
      { id: "b", label: "Somehow being on every single project", dimension: "over_committer" },
      { id: "c", label: "Never actually being \"just\" in one meeting", dimension: "multitasker" },
      { id: "d", label: "Fixing things nobody even knew were broken", dimension: "silent_fixer" },
    ],
  },
];

const RED_FLAG_TIE_BREAK_ORDER = [
  "perfectionist",
  "over_committer",
  "control_enthusiast",
  "people_pleaser",
  "last_minute_genius",
  "multitasker",
  "devils_advocate",
  "silent_fixer",
];

export const CORPORATE_RED_FLAG_QUIZ: CareerProfileQuizDefinition = {
  meta: CAREER_PROFILE_QUIZZES.corporate_red_flag,
  questions: RED_FLAG_QUESTIONS,
  archetypes: RED_FLAG_ARCHETYPES,
  tieBreakOrder: RED_FLAG_TIE_BREAK_ORDER,
};

// ---------------------------------------------------------------------------
// AI-ERA CAREER ADVANTAGE -- deliberately qualitative, never a fabricated
// "% safe from automation" figure (trust/safety rule: no fake AI-proof
// percentages). Each result names a durable human strength, not a score.
// ---------------------------------------------------------------------------

const AI_ERA_ARCHETYPES: CareerProfileArchetype[] = [
  {
    key: "human_judgment",
    title: "Human Judgment",
    emoji: "🧭",
    description:
      "When the stakes are high and the data's incomplete, people trust your call. A tool can hand you a confident answer, but you're the one who knows when the context around it means that answer is actually wrong.",
  },
  {
    key: "relationship_capital",
    title: "Relationship Capital",
    emoji: "🤝",
    description:
      "Deals and decisions still move through trust, and people trust you. No model can replace the fact that when you say something will work, the room actually believes you — and acts on it.",
  },
  {
    key: "creative_leaps",
    title: "Creative Leaps",
    emoji: "🎨",
    description:
      "You connect ideas nobody else thought to connect. Where a tool remixes what already exists, you're the one who notices the option that was never in the training data to begin with.",
  },
  {
    key: "systems_thinking",
    title: "Systems Thinking",
    emoji: "🧩",
    description:
      "You see how the pieces fit together, not just the piece in front of you. You're the one who catches what a narrow, well-optimized answer would quietly break somewhere else downstream.",
  },
  {
    key: "adaptability",
    title: "Adaptability",
    emoji: "🌊",
    description:
      "You pick up new tools and new ways of working faster than most. Change doesn't rattle you — you treat every new tool as one more thing to get good at using, not a threat to what you already know.",
  },
  {
    key: "storytelling",
    title: "Storytelling",
    emoji: "📖",
    description:
      "You make the complicated thing make sense to whoever's in the room. A sharp analysis is only useful if someone acts on it, and you're the one who turns the data into a decision people actually understand.",
  },
  {
    key: "ownership",
    title: "Ownership",
    emoji: "🛡️",
    description:
      "When it's on the line, you're the one who takes it personally. You don't need to be told to care about the outcome — accountability isn't a policy for you, it's just how you work.",
  },
  {
    key: "orchestration",
    title: "Orchestration",
    emoji: "🎼",
    description:
      "You're the one who directs the tools, the people, and the plan toward one outcome. Plenty of people can run a single piece well; you're the one who makes sure all of the pieces are actually moving in the same direction.",
  },
];

const AI_ERA_QUESTIONS: CareerProfileQuestion[] = [
  {
    id: "q1",
    prompt: "An AI tool gives your team a confident, well-formatted recommendation. What do you bring to the table that it doesn't?",
    options: [
      { id: "a", label: "The judgment call on what actually matters here, given the full context", dimension: "human_judgment" },
      { id: "b", label: "The trust to get the room to actually act on it", dimension: "relationship_capital" },
      { id: "c", label: "A completely different angle the tool never considered", dimension: "creative_leaps" },
      { id: "d", label: "An understanding of how this affects everything else downstream", dimension: "systems_thinking" },
    ],
  },
  {
    id: "q2",
    prompt: "A new tool changes how your whole team works overnight. What's your instinct?",
    options: [
      { id: "a", label: "Learn it fast and figure out what it's actually good for", dimension: "adaptability" },
      { id: "b", label: "Explain to everyone else why it matters and how to use it", dimension: "storytelling" },
      { id: "c", label: "Make sure nothing falls through the cracks during the transition", dimension: "ownership" },
      { id: "d", label: "Figure out how it fits with everything else your team already uses", dimension: "orchestration" },
    ],
  },
  {
    id: "q3",
    prompt: "Two AI-generated options land on your desk, both technically correct. How do you pick?",
    options: [
      { id: "a", label: "Weigh the nuance the data can't capture", dimension: "human_judgment" },
      { id: "b", label: "Think about who needs to buy into this and what they'll actually accept", dimension: "relationship_capital" },
      { id: "c", label: "Realize there's a third option neither of them considered", dimension: "creative_leaps" },
      { id: "d", label: "Think through how each one plays out across the whole system", dimension: "systems_thinking" },
    ],
  },
  {
    id: "q4",
    prompt: "Your role starts shifting because more of the routine work gets automated. What do you lean into?",
    options: [
      { id: "a", label: "Picking up whatever new skill the moment calls for", dimension: "adaptability" },
      { id: "b", label: "Becoming the person who explains what it all means", dimension: "storytelling" },
      { id: "c", label: "Being the one who's accountable when it actually matters", dimension: "ownership" },
      { id: "d", label: "Directing the tools and people toward the outcome that matters", dimension: "orchestration" },
    ],
  },
  {
    id: "q5",
    prompt: "What's the thing people still come to you for, even with AI everywhere?",
    options: [
      { id: "a", label: "A second opinion they actually trust", dimension: "human_judgment" },
      { id: "b", label: "A door you can open that a tool can't", dimension: "relationship_capital" },
      { id: "c", label: "An idea nobody else would have thought of", dimension: "creative_leaps" },
      { id: "d", label: "Seeing what a narrow tool would miss", dimension: "systems_thinking" },
    ],
  },
  {
    id: "q6",
    prompt: "A big AI-powered shift is coming to your industry. How are you preparing?",
    options: [
      { id: "a", label: "Already experimenting with the new tools, ahead of most people", dimension: "adaptability" },
      { id: "b", label: "Getting good at explaining the change to people who are nervous about it", dimension: "storytelling" },
      { id: "c", label: "Making sure your team's work stays solid through the transition", dimension: "ownership" },
      { id: "d", label: "Thinking about how to combine the new tools with what already works", dimension: "orchestration" },
    ],
  },
  {
    id: "q7",
    prompt: "What will still matter most in your job five years from now?",
    options: [
      { id: "a", label: "Making the calls only a person with real context can make", dimension: "human_judgment" },
      { id: "b", label: "The trust people have built with you", dimension: "relationship_capital" },
      { id: "c", label: "Making complicated things make sense to real people", dimension: "storytelling" },
      { id: "d", label: "Being the one who pulls it all together toward one goal", dimension: "orchestration" },
    ],
  },
];

const AI_ERA_TIE_BREAK_ORDER = [
  "human_judgment",
  "relationship_capital",
  "creative_leaps",
  "systems_thinking",
  "adaptability",
  "storytelling",
  "ownership",
  "orchestration",
];

export const AI_ERA_ADVANTAGE_QUIZ: CareerProfileQuizDefinition = {
  meta: CAREER_PROFILE_QUIZZES.ai_era_advantage,
  questions: AI_ERA_QUESTIONS,
  archetypes: AI_ERA_ARCHETYPES,
  tieBreakOrder: AI_ERA_TIE_BREAK_ORDER,
};

// ---------------------------------------------------------------------------
// CAREER MODE -- which "mode" someone is currently operating in. Framed as
// a present-tense snapshot, not a fixed identity -- your mode can (and will)
// change as your career does.
// ---------------------------------------------------------------------------

const CAREER_MODE_ARCHETYPES: CareerProfileArchetype[] = [
  {
    key: "owner_mode",
    title: "Owner Mode",
    emoji: "🏗️",
    description:
      "You treat the work like it's yours, because to you, it is. Titles and org charts are almost beside the point — if something's broken and it's in front of you, you fix it like your name is on it.",
  },
  {
    key: "growth_mode",
    title: "Growth Mode",
    emoji: "📈",
    description:
      "Right now, you're optimizing for how much you're learning, not just what's due. You're deliberately choosing the harder, less certain path when it teaches you something the easy path wouldn't.",
  },
  {
    key: "explorer_mode",
    title: "Explorer Mode",
    emoji: "🧭",
    description:
      "You're testing what actually excites you before committing to one direction. This is a season of genuine curiosity for you, not indecision — you're gathering real evidence about what you want before you commit to it.",
  },
  {
    key: "focus_mode",
    title: "Focus Mode",
    emoji: "🎯",
    description:
      "You've picked your lane and you're going deep, not wide. Saying no to the shiny distractions is how you're building real depth right now, and it's starting to show in how good you are at the one thing you chose.",
  },
  {
    key: "team_mode",
    title: "Team Mode",
    emoji: "🤝",
    description:
      "Your energy right now is about making the people around you better. Your own output has taken a back seat, on purpose, to whether the people around you are actually leveling up.",
  },
  {
    key: "stability_mode",
    title: "Stability Mode",
    emoji: "⚓",
    description:
      "You're building a solid foundation, on purpose, before the next big leap. This isn't playing it safe — it's you deliberately getting your footing right so the next move actually holds.",
  },
  {
    key: "ambition_mode",
    title: "Ambition Mode",
    emoji: "🚀",
    description:
      "You're playing for the next level, and it shows in how you show up. Every project right now is at least partly about proving you're ready for what's next, and you're not being quiet about it.",
  },
  {
    key: "balance_mode",
    title: "Balance Mode",
    emoji: "🌤️",
    description:
      "You're protecting your energy so the work stays sustainable, not just intense. You've learned the hard way that burnout doesn't actually get you there faster, so you're deliberately playing the long game.",
  },
];

const CAREER_MODE_QUESTIONS: CareerProfileQuestion[] = [
  {
    id: "q1",
    prompt: "Right now, what's actually driving how you show up at work?",
    options: [
      { id: "a", label: "Making sure this goes well, because it reflects on you", dimension: "owner_mode" },
      { id: "b", label: "How much you're learning day to day", dimension: "growth_mode" },
      { id: "c", label: "Figuring out what kind of work actually excites you", dimension: "explorer_mode" },
      { id: "d", label: "Getting really good at the one thing you've chosen to focus on", dimension: "focus_mode" },
    ],
  },
  {
    id: "q2",
    prompt: "What would make this year feel like a win to you?",
    options: [
      { id: "a", label: "Your team came out of it stronger because of you", dimension: "team_mode" },
      { id: "b", label: "You built something solid you can count on", dimension: "stability_mode" },
      { id: "c", label: "You made a real, visible jump toward the next level", dimension: "ambition_mode" },
      { id: "d", label: "You did great work without burning out", dimension: "balance_mode" },
    ],
  },
  {
    id: "q3",
    prompt: "A new project lands on your desk with no clear owner. What's your instinct?",
    options: [
      { id: "a", label: "Take it and run with it like it's yours", dimension: "owner_mode" },
      { id: "b", label: "See it as a chance to learn something new", dimension: "growth_mode" },
      { id: "c", label: "Use it to test out a direction you haven't tried", dimension: "explorer_mode" },
      { id: "d", label: "Only take it if it fits squarely into what you're already building", dimension: "focus_mode" },
    ],
  },
  {
    id: "q4",
    prompt: "How are you actually spending your extra energy at work these days?",
    options: [
      { id: "a", label: "Helping the people around you level up", dimension: "team_mode" },
      { id: "b", label: "Shoring up the fundamentals so nothing's shaky", dimension: "stability_mode" },
      { id: "c", label: "Positioning yourself for the next big move", dimension: "ambition_mode" },
      { id: "d", label: "Protecting your time so this is sustainable", dimension: "balance_mode" },
    ],
  },
  {
    id: "q5",
    prompt: "When something goes wrong on your watch, what's your instinct?",
    options: [
      { id: "a", label: "Own it fully and fix it — it's on you", dimension: "owner_mode" },
      { id: "b", label: "Figure out what it taught you", dimension: "growth_mode" },
      { id: "c", label: "Take it as a sign to try a different approach entirely", dimension: "explorer_mode" },
      { id: "d", label: "Zoom in and fix the one thing that actually broke", dimension: "focus_mode" },
    ],
  },
  {
    id: "q6",
    prompt: "How would your closest colleagues describe your mindset right now?",
    options: [
      { id: "a", label: "All about lifting the people around them", dimension: "team_mode" },
      { id: "b", label: "Steady — building something that'll last", dimension: "stability_mode" },
      { id: "c", label: "Hungry — clearly playing for what's next", dimension: "ambition_mode" },
      { id: "d", label: "Grounded — protecting their energy on purpose", dimension: "balance_mode" },
    ],
  },
  {
    id: "q7",
    prompt: "If you're honest, what's the real goal behind how you're working right now?",
    options: [
      { id: "a", label: "Being someone people can hand things to and trust completely", dimension: "owner_mode" },
      { id: "b", label: "Becoming meaningfully better than you were a year ago", dimension: "growth_mode" },
      { id: "c", label: "Having a solid, dependable foundation under you", dimension: "stability_mode" },
      { id: "d", label: "Getting to the next level, and you're not hiding that", dimension: "ambition_mode" },
    ],
  },
];

const CAREER_MODE_TIE_BREAK_ORDER = [
  "owner_mode",
  "growth_mode",
  "explorer_mode",
  "focus_mode",
  "team_mode",
  "stability_mode",
  "ambition_mode",
  "balance_mode",
];

export const CAREER_MODE_QUIZ: CareerProfileQuizDefinition = {
  meta: CAREER_PROFILE_QUIZZES.career_mode,
  questions: CAREER_MODE_QUESTIONS,
  archetypes: CAREER_MODE_ARCHETYPES,
  tieBreakOrder: CAREER_MODE_TIE_BREAK_ORDER,
};

// Every implemented quiz gets registered here -- getCareerProfileQuizDefinition
// is the only way callers (API routes, the quiz-runner UI) reach quiz
// content, so adding a quiz's content is a one-line registration once its
// questions/archetypes are written, without touching any call site.
const QUIZ_DEFINITIONS: Partial<Record<CareerProfileQuizId, CareerProfileQuizDefinition>> = {
  career_superpower: CAREER_SUPERPOWER_QUIZ,
  corporate_character: CORPORATE_CHARACTER_QUIZ,
  corporate_red_flag: CORPORATE_RED_FLAG_QUIZ,
  ai_era_advantage: AI_ERA_ADVANTAGE_QUIZ,
  career_mode: CAREER_MODE_QUIZ,
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
