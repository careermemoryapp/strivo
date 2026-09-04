"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Bell } from "lucide-react";

// The bell icon + unread badge, shared by every root screen's header (Home,
// Chats, Memories, Record, Settings -- see each one's DarkHeader usage) so
// notifications (see app/(app)/notifications) are reachable from anywhere
// in the app, not just Home. Self-fetching rather than fed via server props
// or CurrentUserContext on purpose: unlike the user's name (which barely
// ever changes -- see CurrentUserContext.tsx's comment on why THAT is fine
// to set once per session), the unread count changes constantly -- reading
// a notification, a new one arriving -- and (app)/layout.tsx stays mounted
// across tab switches, so a value baked in once at layout-load would go
// stale the moment you read something and switch tabs. Refetching on every
// pathname change keeps it honest without needing global state.
export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) setUnreadCount(json.unreadCount ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-runs on every navigation within (app) -- see the comment above for
    // why this can't just be fetched once.
  }, [pathname]);

  return (
    // Outer button is h-11 w-11 (44px) -- Google's/Apple's minimum
    // recommended touch target, up from the old h-8 w-8 (32px), which was a
    // genuinely small tap area (this is the icon the founder specifically
    // reported needing 2-3 taps on). The inner span keeps the original
    // h-8 w-8 footprint so the Bell icon and its unread badge sit exactly
    // where they always did -- items-center/justify-center on the outer
    // button just centers that same-sized inner block inside a bigger
    // invisible hit area, so this is a bigger tap target, not a layout
    // change.
    <button
      onClick={() => router.push("/notifications")}
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      className="flex h-11 w-11 items-center justify-center rounded-full text-white/85 active:bg-white/10"
    >
      <span className="relative flex h-8 w-8 items-center justify-center">
        <Bell size={19} />
        {unreadCount > 0 && (
          <span
            className="absolute right-1 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ background: "#f43f5e" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </span>
    </button>
  );
}
