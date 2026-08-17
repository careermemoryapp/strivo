"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import { cn } from "@/lib/utils";

// Home is the first screen re-skinned dark (the rest of the app stays light
// for now — staged rollout). The background has to live here, on the
// full-width outer wrapper, rather than inside the Home page's own content
// column: the page content is capped at max-w-md and centered, so a
// background painted only inside it left a visible light strip on either
// side on wider viewports, and left the fixed bottom nav blending against
// the light layout background instead of this gradient (it read as washed-
// out gray instead of rich purple). Painting it here instead means both the
// full viewport width and the strip directly behind the nav are covered.
const HOME_BG =
  "radial-gradient(circle at 12% 6%, rgba(190,120,255,0.35), transparent 38%)," +
  "radial-gradient(circle at 92% 16%, rgba(79,110,247,0.32), transparent 42%)," +
  "radial-gradient(circle at 50% 105%, rgba(120,60,220,0.3), transparent 55%)," +
  "linear-gradient(170deg,#1a0f3d 0%,#231259 30%,#1c1050 55%,#120b38 78%,#0a0620 100%)";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const dark = pathname === "/home";

  return (
    <div
      className={cn("flex min-h-screen flex-col", !dark && "bg-bg")}
      style={dark ? { background: HOME_BG, backgroundRepeat: "no-repeat", backgroundSize: "100% 100%" } : undefined}
    >
      <main className="mx-auto w-full max-w-md flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
