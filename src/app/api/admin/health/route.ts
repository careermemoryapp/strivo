import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { getDb } from "@/lib/db";

// Detailed system health, for the admin dashboard only -- deliberately
// separate from the public /api/health, which stays minimal on purpose
// (it's unauthenticated, so it shouldn't hand out memory usage, process
// uptime, or which pm2 worker answered). This route requires the same
// admin session as everything else under /api/admin/*.
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let databaseOk = true;
  let databaseMs = 0;
  try {
    const db = getDb();
    const start = performance.now();
    db.prepare("SELECT 1").get();
    databaseMs = Math.round((performance.now() - start) * 100) / 100;
  } catch (e) {
    console.error("Admin health check: database query failed:", e);
    databaseOk = false;
  }

  const mem = process.memoryUsage();
  const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;

  return NextResponse.json({
    status: databaseOk ? "ok" : "degraded",
    database: { ok: databaseOk, responseMs: databaseMs },
    process: {
      // pm2 sets this per cluster worker -- shows which of the (currently 2)
      // instances actually answered this particular request.
      pm2InstanceId: process.env.pm_id ?? process.env.NODE_APP_INSTANCE ?? null,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryMb: { rss: mb(mem.rss), heapUsed: mb(mem.heapUsed), heapTotal: mb(mem.heapTotal) },
    },
    checkedAt: new Date().toISOString(),
  });
}
