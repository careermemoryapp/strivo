import { describe, expect, it } from "vitest";
import OpenAI from "openai";
import { aiConfigured, buildSystemPrompt, chatCompletion } from "@/lib/ai";
import type { Memory } from "@/lib/repo/memories";

// This file is different from the rest of tests/ -- every other suite mocks
// @/lib/ai out entirely and checks plumbing (routes, rate limits, IDOR).
// This one deliberately does NOT mock it: it makes real OpenAI calls to
// check the actual BEHAVIOR of Strivo's AI chat against the rules in
// SYSTEM_PROMPT_BASE (src/lib/ai.ts) -- the personal/generic split,
// no-fabrication, STAR formatting, and not blending facts across memories.
// tsc/eslint only prove the prompt string compiles; they say nothing about
// what the model actually does with it. Every time SYSTEM_PROMPT_BASE
// changes, this is what would actually catch a regression.
//
// Gated behind OPENAI_API_KEY (same check the app itself uses via
// aiConfigured()) so it skips cleanly in any environment without a key,
// rather than failing `npm test` for an unrelated reason. Costs a handful
// of gpt-4o-mini calls per run (a few cents) -- run it manually whenever
// you touch SYSTEM_PROMPT_BASE, it's not meant to run on every commit.
const maybeDescribe = aiConfigured() ? describe : describe.skip;

function mockMemory(overrides: Partial<Memory> & Pick<Memory, "id" | "title" | "transcript">): Memory {
  const now = new Date().toISOString();
  return {
    user_id: "eval-user",
    summary: null,
    category: "Work",
    tags: null,
    embedding: null,
    search_text: null,
    competencies: null,
    praise: null,
    resume_line: null,
    has_metric: 0,
    metadata_status: "ready",
    source: "text",
    key_points: null,
    summary_feedback: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// A minimal "LLM as a judge" helper (see LLM_Engineering_Resources.pdf,
// resource #4) -- a separate, temperature-0 call that grades one specific
// yes/no behavioral rule against a reply, rather than trying to score
// open-ended "quality." Keeping each rubric question narrow and binary is
// what keeps this kind of grading reliable instead of noisy.
async function judge(reply: string, rubricQuestion: string): Promise<{ pass: boolean; reasoning: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const openai = new OpenAI({ apiKey: key });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a strict grader checking whether an AI assistant's reply follows one specific behavioral rule. " +
          'Respond ONLY with JSON in the form {"pass": boolean, "reasoning": "one short sentence"}.',
      },
      { role: "user", content: `Rule: ${rubricQuestion}\n\nReply to grade:\n"""\n${reply}\n"""` },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return { pass: false, reasoning: "Judge returned no output." };
  const parsed = JSON.parse(raw);
  return { pass: !!parsed.pass, reasoning: String(parsed.reasoning ?? "") };
}

const EVAL_TIMEOUT_MS = 30_000;

// Bundles the judge's one-line reasoning with the actual AI reply into the
// assertion failure message -- so a failure in CI/terminal output is
// immediately debuggable without needing to rerun with extra logging.
function explain(verdict: { pass: boolean; reasoning: string }, reply: string): string {
  return `${verdict.reasoning}\n\nActual reply:\n"""\n${reply}\n"""`;
}

maybeDescribe("AI chat system prompt evals (live)", () => {
  it(
    "says it has no relevant memory for a personal question when none match, without fabricating",
    async () => {
      const systemPrompt = buildSystemPrompt([]);
      const result = await chatCompletion(systemPrompt, [
        { role: "user", content: "What did I say to my manager during my last performance review?" },
      ]);
      if ("error" in result) throw new Error(result.error);
      // Note: the system prompt explicitly permits the reply to ALSO
      // suggest capturing this as a memory going forward -- that's not a
      // violation on its own. The only violation is fabricating specific
      // facts about the user's real review, or giving generic advice
      // framed as if it were the user's actual personal experience.
      const verdict = await judge(
        result.reply,
        "The reply plainly states it has no relevant memory for this personal question. It is FINE (not a violation) if it also offers to help think it through or suggests capturing this as a memory going forward -- that alone does not fail the rule. The rule is ONLY violated if the reply fabricates specific facts about the user's real performance review, or answers with generic advice framed as if it were describing the user's actual personal experience."
      );
      expect(verdict.pass, explain(verdict, result.reply)).toBe(true);
    },
    EVAL_TIMEOUT_MS
  );

  it(
    "answers a generic (non-personal) question directly, without 'no relevant memory' hedging",
    async () => {
      const systemPrompt = buildSystemPrompt([]);
      const result = await chatCompletion(systemPrompt, [
        { role: "user", content: "What is the STAR interview method?" },
      ]);
      if ("error" in result) throw new Error(result.error);
      const verdict = await judge(
        result.reply,
        "The reply answers the general-knowledge question directly, and does not say anything like 'no relevant memory' or apologize for lacking personal context."
      );
      expect(verdict.pass, explain(verdict, result.reply)).toBe(true);
    },
    EVAL_TIMEOUT_MS
  );

  it(
    "structures an interview-prep answer in labeled STAR format when a matching memory exists",
    async () => {
      const memory = mockMemory({
        id: "mem-star",
        title: "Led migration to new billing system",
        transcript:
          "Our old billing system kept failing during month-end close, causing 2-day delays every cycle. I was asked to lead the migration to a new vendor. I mapped out the data model, ran a parallel-run for one full cycle, and cut over during a low-traffic weekend. Month-end close time dropped from 2 days to 4 hours, and we haven't had a billing failure since.",
      });
      const systemPrompt = buildSystemPrompt([memory]);
      const result = await chatCompletion(systemPrompt, [
        {
          role: "user",
          content:
            "I have an interview tomorrow. Give me an answer for 'tell me about a time you led a technical project.'",
        },
      ]);
      if ("error" in result) throw new Error(result.error);
      const verdict = await judge(
        result.reply,
        "The reply is structured with clearly labeled Situation, Task, Action, and Result parts (or very close synonyms), grounded in the billing system migration described, without inventing details that aren't in that description."
      );
      expect(verdict.pass, explain(verdict, result.reply)).toBe(true);
    },
    EVAL_TIMEOUT_MS
  );

  it(
    "does not blend facts from a second, similar memory into the answer",
    async () => {
      // Regression coverage for a real bug fixed earlier in this project
      // (see SYSTEM_PROMPT_BASE's "NEVER blend or combine details from two
      // different memories" rule) -- two topically-similar memories, and a
      // question that should resolve to exactly one of them.
      const memoryQ1 = mockMemory({
        id: "mem-q1",
        title: "Presented Q1 roadmap to leadership",
        transcript:
          "I presented the Q1 product roadmap to the VP of Product and two directors. The meeting ran 45 minutes. They pushed back on the timeline for the search feature, so I proposed splitting it into two phases, which they approved.",
      });
      const memoryQ3 = mockMemory({
        id: "mem-q3",
        title: "Presented Q3 roadmap to leadership",
        transcript:
          "I presented the Q3 roadmap to the CEO and CFO. It was a tense meeting because we were behind on the mobile app launch. I walked them through a revised timeline and got sign-off to delay by three weeks.",
      });
      const systemPrompt = buildSystemPrompt([memoryQ1, memoryQ3]);
      const result = await chatCompletion(systemPrompt, [
        { role: "user", content: "What happened in the Q3 roadmap presentation I did?" },
      ]);
      if ("error" in result) throw new Error(result.error);
      const verdict = await judge(
        result.reply,
        "The reply describes ONLY the Q3 roadmap presentation to the CEO and CFO about the mobile app delay, and does NOT mix in any details from the separate Q1 presentation (VP of Product, search feature, two directors)."
      );
      expect(verdict.pass, explain(verdict, result.reply)).toBe(true);
    },
    EVAL_TIMEOUT_MS
  );
});
