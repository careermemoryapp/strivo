import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Simple, unauthenticated health check. Deliberately reveals nothing about
// the app beyond "is it up and can it reach its database" -- no version
// numbers, stack traces, or config details, since this endpoint is public
// by design (infrastructure/monitoring needs to reach it without a login).
//
// What this is for:
// - A monitoring tool (UptimeRobot, Better Uptime, AWS health checks, a
//   future load balancer) can poll this instead of just checking that port
//   443 responds, which would look "healthy" even if the database were
//   unreachable underneath.
// - A quick manual check: `curl https://strivo.ai/api/health`
export async function GET() {
  try {
    const db = getDb();
    // Cheapest possible real query -- proves the SQLite connection is open
    // and can actually execute, not just that the file exists.
    db.prepare("SELECT 1").get();
    return NextResponse.json({ status: "ok", database: "ok", time: new Date().toISOString() });
  } catch (e) {
    console.error("Health check failed:", e);
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
