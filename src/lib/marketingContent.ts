// Shared marketing content -- extracted 2026-10-11 from MarketingHome.tsx
// so the blog pages (the index at /blog, via MarketingHero.tsx, and each
// post's sidebar -- components/blog/BlogSidebar.tsx) can reuse the exact
// same real testimonials and differentiator copy as the homepage, instead
// of a second, divergent copy that could drift out of sync (or worse, get
// re-fabricated) over time. MarketingHome.tsx imports these instead of
// defining them locally. COMPARISON_POINTS is still used in full by
// ChatGptComparisonSection.tsx, which the homepage doesn't currently
// render but is kept available for a future placement.

// Comparison copy deliberately understates what ChatGPT/Claude can do --
// e.g. not claiming "no memory at all" when custom instructions and
// memory features exist in some form -- the real, defensible differentiator
// is that Strivo acts proactively and automatically on a structured
// record, not just "remembers more."
export const COMPARISON_POINTS = [
  {
    title: "Follows up, unprompted",
    strivo: "You mention an interview next Tuesday. Five days later — completely on its own, no chat open, no reminder set — Strivo asks how it went, and turns your answer into a story you can actually use.",
    others: "The moment you close the tab, the conversation is gone. Nothing comes back to check on you — ever.",
  },
  {
    title: "Organizes your stories by competency",
    strivo: "Every memory is auto-tagged the second you record it — Leadership, Problem-Solving, and 20 more. Open your Story Bank and know exactly which \"tell me about a time...\" questions you can already answer, and which you can't yet.",
    others: "No memory of the shape of what you've told it. Finding that one story again means scrolling back through old chats and hoping you remember which one.",
  },
  {
    title: "Reacts to what you just said",
    strivo: "You finish talking. Before you've even opened a new screen, it tells you — unprompted — \"that's a strong Leadership example.\" You didn't have to ask. It noticed.",
    others: "Says nothing unless you explicitly ask it to evaluate your story. Most people never think to ask, so most good stories go unnoticed.",
  },
  {
    title: "Writes the resume line for you",
    strivo: "A polished, numbers-included bullet — built automatically the moment you finish your story, sitting there ready to copy straight into your resume.",
    others: "You have to ask for it, re-explain the context, and hope it gets the numbers right — every single time.",
  },
  {
    title: "Sends real check-ins automatically",
    strivo: "A recap of your week. A read on how you've grown. A quarter measured honestly against the one before it. All pushed to your phone — you never once have to go looking for them.",
    others: "Nothing arrives on its own. Every insight, every recap, every reflection has to be requested, from scratch, by you.",
  },
] as const;

// Seven real testimonials -- sourced directly from people who actually
// used the app (a Play Store review, a WhatsApp message, a recap call),
// quoted in their own words with their name/role as confirmed by the
// founder (2026-10-01/02). Order is the founder's choice, not
// rating-sorted. See this array's original comment history in
// MarketingHome.tsx (git blame) for the full provenance note -- kept
// short here since it's now imported, not re-justified in every file
// that uses it.
export const HERO_TESTIMONIALS = [
  {
    initial: "B",
    name: "Bhupender K.",
    role: "Program Manager",
    quote:
      "It can tell me stories about my own career — things I didn't even realize I could leverage.",
  },
  {
    initial: "R",
    name: "Rakesh G.",
    role: "Director",
    quote: "I've been using Strivo — you record a moment as it happens, and it's ready as a resume line or interview story when you need it.",
  },
  {
    initial: "S",
    name: "Sudhakar J.",
    role: "Chief Digital Officer",
    quote: "You make your career a project — set up the memory, and it remembers you. A good initiative.",
  },
  {
    initial: "A",
    name: "Arjun V.",
    role: "Director",
    quote: "The idea seems novel and promising.",
  },
  {
    initial: "H",
    name: "Harsha G.",
    role: "Software Developer",
    quote:
      "It surfaced career stories I didn't even realize I had — a point I thought was ordinary turned out to be a strong leadership story for interviews.",
  },
  {
    initial: "R",
    name: "Rohit K.",
    role: "Manager",
    quote:
      "I often forget what I've done at work. I just speak freely about it, and Strivo organizes everything into structured career memories for me.",
  },
  {
    initial: "S",
    name: "Sagar",
    role: "Product Manager",
    quote: "Really liked the clean, user-friendly interface — very intuitive and self-explanatory.",
  },
] as const;
