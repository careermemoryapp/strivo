import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { getStaticSecurityChecklist, readDependencyAudit } from "@/lib/securityStatus";

// Admin-only. Surfaces "how secure is this app right now" directly on the
// dashboard: a checklist of protections that have actually been built and
// verified in code, plus a live count of known dependency vulnerabilities
// (read from whatever scripts/deploy.sh's `npm audit` last wrote to disk).
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    checklist: getStaticSecurityChecklist(),
    dependencyAudit: readDependencyAudit(),
  });
}
