import { createMessage, listMessages, type Message } from "@/lib/repo/messages";
import { touchChat } from "@/lib/repo/chats";
import { retrieveRelevantMemories, type RetrievalResult } from "@/lib/retrieval";
import { buildSystemPrompt, chatCompletion, type ChatMessage } from "@/lib/ai";

const HISTORY_LIMIT = 16;

export async function sendUserMessageAndGetReply(
  userId: string,
  chatId: string,
  content: string
): Promise<{ userMessage: Message; aiMessage: Message; retrieval: RetrievalResult; error?: string }> {
  const userMessage = createMessage({ chatId, userId, sender: "user", content, status: "sent" });

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

  const retrieval = await retrieveRelevantMemories(userId, retrievalQuery || content);
  const history: ChatMessage[] = priorMessages.map((m) => ({
    role: m.sender === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const systemPrompt = buildSystemPrompt(retrieval.memories);
  const result = await chatCompletion(systemPrompt, history);

  touchChat(userId, chatId, {
    lastMessage: content,
    memoryCount: retrieval.memories.length,
  });

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
