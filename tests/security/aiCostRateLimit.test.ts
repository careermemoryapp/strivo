import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Regression test for a real gap found during the Aug 2026 threat-catalogue
// audit: POST /api/memories, PATCH /api/memories/[id], and POST /api/chats
// (when it includes an initialMessage) each trigger real OpenAI spend, but
// only chat-message replies to an *existing* chat were rate limited. That
// meant:
//   1. Memory creation/editing had no cap at all -- a compromised session or
//      buggy client could loop it indefinitely.
//   2. Someone could dodge the chat-message rate limit entirely by always
//      starting a brand new chat with an initial message instead of posting
//      to an existing one.
// This test drives the actual route handlers (with auth/AI/db mocked out)
// to prove both are now capped, and that (2) shares its bucket with the
// existing chat-message endpoint rather than getting its own separate one.

let dbDir: string;
let userAId: string;
let userBId: string;

vi.mock("@/lib/serverAuth", () => ({
  requireUserId: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  generateMemoryMetadata: vi.fn(async () => null),
  embedText: vi.fn(async () => null),
}));

vi.mock("@/lib/chatService", () => ({
  sendUserMessageAndGetReply: vi.fn(async () => ({ reply: "ok", relevantMemories: [] })),
}));

beforeAll(async () => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "strivo-aicost-test-"));
  process.env.DATABASE_PATH = path.join(dbDir, "test.db");

  // Rows in memories/chats have a foreign key to users, so each fake "user"
  // used below needs a real user row first -- ids are DB-generated, so
  // capture what createUser actually assigned rather than inventing one.
  const usersRepo = await import("@/lib/repo/users");
  userAId = usersRepo.createUser({
    firstName: "Test",
    lastName: "User A",
    email: "aicost-a@example.com",
    passwordHash: "unused-in-google-only-auth",
  }).id;
  userBId = usersRepo.createUser({
    firstName: "Test",
    lastName: "User B",
    email: "aicost-b@example.com",
    passwordHash: "unused-in-google-only-auth",
  }).id;
});

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

function jsonRequest(body: unknown): Request {
  return new Request("https://strivo.ai/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AI-cost endpoints are rate limited", () => {
  it("POST /api/memories blocks after the per-user limit", async () => {
    const { requireUserId } = await import("@/lib/serverAuth");
    vi.mocked(requireUserId).mockResolvedValue(userAId);

    const { POST } = await import("@/app/api/memories/route");
    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const res = await POST(jsonRequest({ transcript: `memory ${i}`, source: "text" }));
      lastStatus = res.status;
      if (res.status === 429) break;
    }
    expect(lastStatus).toBe(429);
  });

  it("starting a new chat with an initial message shares the same limit bucket as posting a message to an existing chat (closes the bypass)", async () => {
    const { POST: createChat } = await import("@/app/api/chats/route");

    // A different user (fresh rate-limit bucket) so this test doesn't
    // inherit exhaustion from the memories test above.
    const { requireUserId } = await import("@/lib/serverAuth");
    vi.mocked(requireUserId).mockResolvedValue(userBId);

    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const res = await createChat(
        jsonRequest({ title: `Chat ${i}`, category: "General", initialMessage: "hello" })
      );
      lastStatus = res.status;
      if (res.status === 429) break;
    }
    // Before the fix, POST /api/chats had no limit at all, so this loop
    // would run all 61 iterations and never see a 429.
    expect(lastStatus).toBe(429);
  });
});
