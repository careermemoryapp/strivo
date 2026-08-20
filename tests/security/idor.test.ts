import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Points DATABASE_PATH at a throwaway file *before* importing anything that
// touches lib/db.ts (its DB_PATH constant is read once, at import time), so
// this suite never touches the real production database. Using a fresh temp
// dir per run also means test files can run in parallel without stepping on
// each other.
let dbDir: string;
let memoriesRepo: typeof import("@/lib/repo/memories");
let chatsRepo: typeof import("@/lib/repo/chats");
let messagesRepo: typeof import("@/lib/repo/messages");
let usersRepo: typeof import("@/lib/repo/users");

beforeAll(async () => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "strivo-idor-test-"));
  process.env.DATABASE_PATH = path.join(dbDir, "test.db");
  memoriesRepo = await import("@/lib/repo/memories");
  chatsRepo = await import("@/lib/repo/chats");
  messagesRepo = await import("@/lib/repo/messages");
  usersRepo = await import("@/lib/repo/users");
});

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

function makeUser(usersRepo_: typeof import("@/lib/repo/users"), email: string) {
  return usersRepo_.createUser({
    firstName: "Test",
    lastName: "User",
    email,
    passwordHash: "unused-in-google-only-auth",
  });
}

describe("memories: per-user isolation", () => {
  it("owner can read their own memory; a different user cannot, even knowing its id", () => {
    const userA = makeUser(usersRepo, "idor-a@example.com");
    const userB = makeUser(usersRepo, "idor-b@example.com");

    const memory = memoriesRepo.createMemory({
      userId: userA.id,
      title: "Private thought",
      transcript: "Something only user A should ever see.",
      source: "text",
    });

    expect(memoriesRepo.getMemoryById(userA.id, memory.id)).toBeDefined();
    expect(memoriesRepo.getMemoryById(userB.id, memory.id)).toBeUndefined();
  });

  it("a different user's update call has no effect on someone else's memory", () => {
    const userA = makeUser(usersRepo, "idor-a2@example.com");
    const userB = makeUser(usersRepo, "idor-b2@example.com");

    const memory = memoriesRepo.createMemory({
      userId: userA.id,
      title: "Original title",
      transcript: "Original transcript",
      source: "text",
    });

    // Attacker (userB) guesses/knows userA's memory id and tries to tamper with it.
    const result = memoriesRepo.updateMemoryMetadata(userB.id, memory.id, { title: "Hacked" });
    expect(result).toBeUndefined();

    const stillOriginal = memoriesRepo.getMemoryById(userA.id, memory.id);
    expect(stillOriginal?.title).toBe("Original title");
  });

  it("a different user's delete call cannot remove someone else's memory", () => {
    const userA = makeUser(usersRepo, "idor-a3@example.com");
    const userB = makeUser(usersRepo, "idor-b3@example.com");

    const memory = memoriesRepo.createMemory({
      userId: userA.id,
      title: "Should survive",
      transcript: "...",
      source: "text",
    });

    memoriesRepo.deleteMemory(userB.id, memory.id);

    expect(memoriesRepo.getMemoryById(userA.id, memory.id)).toBeDefined();
  });

  it("listMemories never returns another user's memories", () => {
    const userA = makeUser(usersRepo, "idor-a4@example.com");
    const userB = makeUser(usersRepo, "idor-b4@example.com");

    memoriesRepo.createMemory({ userId: userA.id, title: "A's memory", transcript: "...", source: "text" });
    memoriesRepo.createMemory({ userId: userB.id, title: "B's memory", transcript: "...", source: "text" });

    const listA = memoriesRepo.listMemories(userA.id);
    expect(listA.every((m) => m.user_id === userA.id)).toBe(true);
    expect(listA.some((m) => m.title === "B's memory")).toBe(false);
  });
});

describe("chats + messages: per-user isolation", () => {
  it("a different user cannot read another user's chat or its messages", () => {
    const userA = makeUser(usersRepo, "idor-chat-a@example.com");
    const userB = makeUser(usersRepo, "idor-chat-b@example.com");

    const chat = chatsRepo.createChat({ userId: userA.id, title: "A's chat", category: "General" });
    const message = messagesRepo.createMessage({
      chatId: chat.id,
      userId: userA.id,
      sender: "user",
      content: "Secret question",
    });

    expect(chatsRepo.getChatById(userB.id, chat.id)).toBeUndefined();
    expect(messagesRepo.getMessageById(userB.id, message.id)).toBeUndefined();
    expect(messagesRepo.listMessages(userB.id, chat.id)).toEqual([]);

    // Owner can still see everything.
    expect(chatsRepo.getChatById(userA.id, chat.id)).toBeDefined();
    expect(messagesRepo.listMessages(userA.id, chat.id)).toHaveLength(1);
  });

  it("a different user's touchChat call cannot modify someone else's chat", () => {
    const userA = makeUser(usersRepo, "idor-chat-a2@example.com");
    const userB = makeUser(usersRepo, "idor-chat-b2@example.com");

    const chat = chatsRepo.createChat({ userId: userA.id, title: "Original", category: "General" });
    const result = chatsRepo.touchChat(userB.id, chat.id, { title: "Hacked title" });

    expect(result).toBeUndefined();
    expect(chatsRepo.getChatById(userA.id, chat.id)?.title).toBe("Original");
  });
});
