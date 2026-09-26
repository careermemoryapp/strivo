import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { computeGrowthFunnel } from "@/lib/repo/growthFunnel";

// Admin-only. Powers the "Growth funnel" section on the admin dashboard --
// visitors -> clicked "Get the app" -> installed -> signed up. Each stage
// degrades independently to "not configured" rather than failing the whole
// request (see computeGrowthFunnel's own comment).
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const funnel = await computeGrowthFunnel();
    return NextResponse.json({ funnel });
  } catch (e) {
    console.error("Admin growth-funnel fetch failed:", e);
    return NextResponse.json({ error: "Couldn't compute the funnel." }, { status: 502 });
  }
}
