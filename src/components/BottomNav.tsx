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

// Same dark tone as every screen's header now (see DARK in DarkHeader.tsx)
// — kept as a plain solid color (no opacity/backdrop-blur) on purpose. An
// earlier version used a translucent dark background that depended on
// whatever was behind it, which caused real rendering bugs when that
// background didn't paint the way the code expected. A flat opaque color
// can't have that problem, regardless of what's on the page above it.
const DARK = "#26213c";

export default function BottomNav() {
  const pathname = usePathname();
  // Every screen in the app now uses the dark header + soothing body
  // treatment (staged rollout complete), so the nav is always dark.

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10" style={{ background: DARK }}>
      <div className="mx-auto max-w-md px-2 pb-[env(safe-area-inset-bottom)]">
        <ul className="flex items-stretch justify-between">
          {ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            const activeColor = "text-white";
            const inactiveColor = "text-white/40";
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="flex flex-col items-center justify-center gap-1 py-2 active:opacity-50 transition-opacity"
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
