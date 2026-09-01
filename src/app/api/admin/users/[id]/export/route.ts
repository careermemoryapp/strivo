import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { getUserById } from "@/lib/repo/users";
import { listMemories } from "@/lib/repo/memories";
import { listChats } from "@/lib/repo/chats";
import { listAllMessagesForUser } from "@/lib/repo/messages";

// Founder-triggered GDPR/CCPA data-portability fulfillment (see the privacy
// policy's "receive your data in a portable format" promise under GDPR/UK
// GDPR). Deliberately NOT self-serve -- a user can't hit this themselves;
// it's a manual admin action taken after a support request comes in via the
// Settings > Export Data flow (see /api/support and
// src/app/(app)/settings/page.tsx). That keeps the legal obligation
// satisfied (a request gets a real, complete, machine-readable export
// within a reasonable time) without handing every user a one-click button
// to walk their whole memory history to a competing app.
//
// Every query below is scoped by userId -- same isolation invariant as the
// rest of the repo layer (see the comment on getMemoryById in
// lib/repo/memories.ts). This route is exactly the kind of place a missing
// WHERE user_id would turn into a real cross-user data leak, since its
// entire purpose is dumping one user's full history to a file.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = await params;
  const user = getUserById(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const memories = listMemories(userId, {});
  const chats = listChats(userId, {});
  const messages = listAllMessagesForUser(userId);

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: {
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      // password_hash is intentionally omitted -- it's not "the user's
      // data" in the portability sense, it's a security credential, and
      // shipping it in an export file (even hashed) is pure downside.
      accountCreatedAt: user.created_at,
      subscriptionStatus: user.subscription_status,
      preferredPlan: user.preferred_plan,
    },
    memories: memories.map((m) => ({
      id: m.id,
      title: m.title,
      transcript: m.transcript,
      summary: m.summary,
      category: m.category,
      tags: safeParseArray(m.tags),
      competencies: safeParseArray(m.competencies),
      keyPoints: safeParseArray(m.key_points),
      reflectiveQuestion: m.reflective_question,
      reflectiveAnswer: m.reflective_answer,
      source: m.source,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
    chats: chats.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      messages: messages
        .filter((msg) => msg.chat_id === c.id)
        .map((msg) => ({
          sender: msg.sender,
          content: msg.content,
          createdAt: msg.created_at,
        })),
    })),
  };

  const json = JSON.stringify(exportData, null, 2);
  const filename = `strivo-export-${user.email.replace(/[^a-zA-Z0-9]/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function safeParseArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
