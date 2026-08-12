import { CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { LogoMark } from "@/components/Logo";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

export function ChatBubble({
  sender,
  content,
  status,
  createdAt,
}: {
  sender: "user" | "ai";
  content: string;
  status?: "sent" | "error" | "pending";
  createdAt?: string;
}) {
  const time = createdAt ? format(new Date(createdAt), "h:mm a") : null;

  if (sender === "user") {
    return (
      <div className="flex flex-col items-end">
        {time && (
          <div className="mb-1 flex items-center gap-1.5 pr-1 text-xs text-ink-faint">
            <span className="font-medium text-ink-soft">You</span>
            <span>{time}</span>
          </div>
        )}
        <div
          className={cn(
            "max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-primary-soft px-4 py-2.5 text-ink whitespace-pre-wrap flex items-end gap-1.5",
            status === "pending" && "opacity-60"
          )}
        >
          <span>{content}</span>
          {status === "sent" && <CheckCheck size={14} className="mb-0.5 shrink-0 text-brand-primary" />}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start">
      {time && (
        <div className="mb-1 flex items-center gap-1.5 pl-9 text-xs text-ink-faint">
          <span className="font-medium text-ink-soft">{APP_NAME}</span>
          <span>{time}</span>
        </div>
      )}
      <div className="flex gap-2 max-w-[85%]">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface border border-border mt-0.5">
          <LogoMark size={16} />
        </div>
        <div
          className={cn(
            "rounded-2xl rounded-tl-sm bg-surface border border-border px-4 py-2.5 text-ink whitespace-pre-wrap",
            status === "error" && "border-red-200 bg-red-50 text-red-700"
          )}
          style={status !== "error" ? { boxShadow: "var(--shadow-card)" } : undefined}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
