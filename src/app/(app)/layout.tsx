"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";

// Home is the first screen re-skinned dark (the rest of the app stays light
// for now — staged rollout). Two earlier attempts at painting this on a
// wrapping <div> (first with background-attachment: fixed, then with
// background-size: 100% 100%) both left the gradient covering only part of
// the scrollable page — the div's own box height didn't reliably track the
// full content height in every case, so the background ran out partway
// down and the rest of the page fell back to white. Setting it directly on
// <body> instead sidesteps that entirely: the body element is guaranteed by
// the browser to size to the full scrollable document, full width, no
// matter how tall the content is, so its background always covers
// everything below it (including the strip behind the fixed bottom nav).
const HOME_BG =
  "radial-gradient(circle at 12% 6%, rgba(190,120,255,0.35), transparent 38%)," +
  "radial-gradient(circle at 92% 16%, rgba(79,110,247,0.32), transparent 42%)," +
  "radial-gradient(circle at 50% 105%, rgba(120,60,220,0.3), transparent 55%)," +
  "linear-gradient(170deg,#1a0f3d 0%,#231259 30%,#1c1050 55%,#120b38 78%,#0a0620 100%)";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const dark = pathname === "/home";

  useEffect(() => {
    if (dark) {
      document.body.style.background = HOME_BG;
    }
    return () => {
      document.body.style.background = "";
    };
  }, [dark]);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-md flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
