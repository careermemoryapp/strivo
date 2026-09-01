import { createMessage, listMessages, updateMessageEmbedding, type Message } from "@/lib/repo/messages";
import { touchChat } from "@/lib/repo/chats";
import { retrieveRelevantMemories, type RetrievalResult } from "@/lib/retrieval";
import { buildSystemPrompt, chatCompletion, embedText, generateChatTitle, type ChatMessage } from "@/lib/ai";
import { isFeatureEnabled } from "@/lib/repo/featureFlags";
import { getUserById } from "@/lib/repo/users";

const HISTORY_LIMIT = 16;

// Below this length a message is things like "ok", "thanks", "yes" -- no
// real recall value, and embedding every single one would be pure waste
// (see listMessagesWithEmbeddings in lib/repo/messages.ts, the pool this
// feeds). Chosen loosely, not tuned -- the cost of skipping a genuinely
// recall-worthy 8-character message is low, and the model still has full
// history for the current chat regardless of whether it got embedded.
const MIN_EMBEDDABLE_LENGTH = 12;

export async function sendUserMessageAndGetReply(
  userId: string,
  chatId: string,
  content: string
): Promise<{ userMessage: Message; aiMessage: Message; retrieval: RetrievalResult; error?: string }> {
  const userMessage = createMessage({ chatId, userId, sender: "user", content, status: "sent" });

  // Fire-and-forget: embed this message in the background so a future
  // question in a DIFFERENT chat can recall it even though it's never being
  // saved as a formal Memory (see retrieveRelevantMemories in
  // lib/retrieval.ts and the messages.embedding column comment in
  // lib/db.ts). Deliberately not awaited -- nothing below depends on it, and
  // the user is waiting on the reply, not on this. Safe to do fire-and-forget
  // here specifically because Strivo runs on a long-lived pm2 process (see
  // ecosystem config), not a serverless/edge function that could get frozen
  // or killed before this promise resolves.
  if (content.trim().length >= MIN_EMBEDDABLE_LENGTH) {
    embedText(content)
      .then((embedding) => {
        if (embedding) updateMessageEmbedding(userMessage.id, embedding);
      })
      .catch(() => {});
  }

  const priorMessages = listMessages(userId, chatId)
    .filter((m) => m.status !== "error")
    .slice(-HISTORY_LIMIT);

  // Short follow-ups ("what did I do in that presentation?") lean on
  // pronouns that only resolve using the recent conversation — searched on
  // their own, they're too generic and can surface an unrelated but
  // topically-similar older memory instead of the one actually being
  // discussed (e.g. an old memory about a different presentation entirely).
  // Folding in the last couple of turns gives retrieval the context it
  // needs to disambiguate. The actual chat reply below still uses the real
  // conversation history/content field, unaffected by this.
  const retrievalQuery = priorMessages
    .slice(-4)
    .map((m) => m.content)
    .join("\n");

  // Only the very first message in a chat gets a generated title (see
  // generateChatTitle in lib/ai.ts) -- after that the chat keeps whatever
  // title it has, same as ChatGPT/Claude. priorMessages already includes
  // the userMessage just created above, so "1" means nothing existed before
  // it. Run this alongside retrieval rather than after it -- it doesn't
  // depend on retrieval's result, and serializing two OpenAI calls here
  // would double the wait on every brand-new chat for no reason.
  const isFirstMessage = priorMessages.length === 1;
  const [retrieval, generatedTitle] = await Promise.all([
    retrieveRelevantMemories(userId, retrievalQuery || content, chatId),
    isFirstMessage ? generateChatTitle(content) : Promise.resolve(null),
  ]);
  const history: ChatMessage[] = priorMessages.map((m) => ({
    role: m.sender === "user" ? "user" : "assistant",
    content: m.content,
  }));

  touchChat(userId, chatId, {
    lastMessage: content,
    memoryCount: retrieval.memories.length,
    ...(generatedTitle ? { title: generatedTitle } : {}),
  });

  // Admin kill switch (see lib/repo/featureFlags.ts) -- checked right
  // before the OpenAI call so a paused AI chat still saves the user's
  // message and shows a clear reason, rather than the generic "couldn't
  // reach the AI" message that's meant for real outages.
  if (!isFeatureEnabled("ai_chat")) {
    const aiMessage = createMessage({
      chatId,
      userId,
      sender: "ai",
      content: "AI chat is temporarily unavailable right now. Your message was saved — please try again shortly.",
      status: "error",
    });
    return { userMessage, aiMessage, retrieval, error: "ai_chat feature disabled" };
  }

  // Best-effort: a lookup failure here just means the chat AI won't have a
  // name to use, not something worth failing the whole reply over.
  const firstName = getUserById(userId)?.first_name ?? null;
  const systemPrompt = buildSystemPrompt(retrieval.memories, new Date(), firstName, retrieval.recalledMessages);
  const result = await chatCompletion(systemPrompt, history);

  if ("error" in result) {
    const aiMessage = createMessage({
      chatId,
      userId,
      sender: "ai",
      content:
        "I couldn't reach the AI right now, so I wasn't able to answer that. Your message was saved — please try again.",
      status: "error",
    });
    return { userMessage, aiMessage, retrieval, error: result.error };
  }

  const aiMessage = createMessage({
    chatId,
    userId,
    sender: "ai",
    content: result.reply,
    retrievedMemories: retrieval.memories.map((m) => m.id),
    status: "sent",
  });

  return { userMessage, aiMessage, retrieval };
}
