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

function jsonRequestFromIp(body: unknown, ip: string): Request {
  return new Request("https://strivo.ai/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
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

// Regression test for the IP-based layer added on top of the per-user
// limits above (see rateLimit.ts's `-ip` buckets). The scenario this
// guards against: someone creates several accounts specifically to dodge
// a single account's 60/hour cap. Simulates 5 separate accounts, all
// hitting from the same network (same x-forwarded-for), each staying
// safely under their own 60/hour limit -- but the 6th account's very
// first request, from that same IP, should already be blocked by the
// shared IP bucket even though that account itself has made zero requests
// so far.
describe("AI-cost endpoints also cap spend per network (IP), not just per account", () => {
  it("POST /api/memories blocks a brand-new account once its network has already spent the shared IP budget", async () => {
    const usersRepo = await import("@/lib/repo/users");
    const { requireUserId } = await import("@/lib/serverAuth");
    const { POST } = await import("@/app/api/memories/route");

    const sharedIp = "203.0.113.50";
    const accounts = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        usersRepo.createUser({
          firstName: "Test",
          lastName: `IP User ${i}`,
          email: `aicost-ip-${i}@example.com`,
          passwordHash: "unused-in-google-only-auth",
        })
      )
    );

    // Accounts 0-4: 60 requests each (300 total) -- each stays exactly at
    // its own per-user ceiling, none of them individually rate limited.
    for (const account of accounts.slice(0, 5)) {
      vi.mocked(requireUserId).mockResolvedValue(account.id);
      for (let i = 0; i < 60; i++) {
        const res = await POST(jsonRequestFromIp({ transcript: `memory ${i}`, source: "text" }, sharedIp));
        expect(res.status).not.toBe(429);
      }
    }

    // Account 5 has made zero requests of its own -- a fresh account would
    // normally sail through its own 60/hour limit. It should still get
    // blocked, because the shared network has already used its 300/hour.
    vi.mocked(requireUserId).mockResolvedValue(accounts[5].id);
    const res = await POST(jsonRequestFromIp({ transcript: "one more", source: "text" }, sharedIp));
    expect(res.status).toBe(429);
  });
});
