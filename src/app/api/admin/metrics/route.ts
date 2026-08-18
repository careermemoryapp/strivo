import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { computeAdminMetrics } from "@/lib/repo/admin";

export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ metrics: computeAdminMetrics() });
}
