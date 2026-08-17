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
  // Home is the first screen re-skinned with a dark gradient background
  // (the rest of the app is still light for now — a deliberate staged
  // rollout). The nav is a single shared fixed component across every
  // (app) route, so it needs to switch its own palette based on which
  // screen is behind it rather than picking one look for every page.
  const dark = pathname === "/home";

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 backdrop-blur border-t",
        dark ? "bg-[#0a0620]/70 border-white/10" : "bg-surface/95 border-border"
      )}
      style={{ boxShadow: dark ? "none" : "var(--shadow-nav)" }}
    >
      <div className="mx-auto max-w-md px-2 pb-[env(safe-area-inset-bottom)]">
        <ul className="flex items-stretch justify-between">
          {ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            const activeColor = dark ? "text-white" : "text-brand-primary";
            const inactiveColor = dark ? "text-white/40" : "text-ink-faint";
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="flex flex-col items-center justify-center gap-1 py-2"
                >
                  <Icon size={21} strokeWidth={2} className={active ? activeColor : inactiveColor} />
                  <span className={cn("text-[10px] font-medium", active ? activeColor : inactiveColor)}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
