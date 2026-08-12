"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Card } from "@/components/Card";
import { chatCategoryDef } from "@/lib/categoryIcons";
import type { Chat } from "@/lib/repo/chats";

export function ChatCard({ chat }: { chat: Chat }) {
  const { icon: Icon, bg, text } = chatCategoryDef(chat.category);
  return (
    <Link href={`/chats/${chat.id}`} className="block">
      <Card className="hover:border-brand-primary/40 transition-colors">
        <div className="flex gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg} ${text}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-ink truncate">{chat.title}</h3>
              <span className="shrink-0 text-xs text-ink-faint">
                {formatDistanceToNowStrict(new Date(chat.updated_at), { addSuffix: true })}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-ink-soft line-clamp-1">
              {chat.last_message || "No messages yet"}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
