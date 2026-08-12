"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageSquare, Brain, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/chats", label: "Chats", icon: MessageSquare },
  { href: "/memories", label: "Memories", icon: Brain },
  { href: "/record", label: "Record", icon: Mic },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur border-t border-border"
      style={{ boxShadow: "var(--shadow-nav)" }}
    >
      <div className="mx-auto max-w-md px-2 pb-[env(safe-area-inset-bottom)]">
        <ul className="flex items-stretch justify-between">
          {ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="flex flex-col items-center justify-center gap-1 py-2.5"
                >
                  <Icon
                    size={22}
                    strokeWidth={2}
                    className={active ? "text-brand-primary" : "text-ink-faint"}
                  />
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      active ? "text-brand-primary" : "text-ink-faint"
                    )}
                  >
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 h-0.5 w-5 rounded-full",
                      active ? "bg-brand-primary" : "bg-transparent"
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
