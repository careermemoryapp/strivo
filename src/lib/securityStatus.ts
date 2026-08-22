import fs from "node:fs";
import path from "node:path";
import { adminTotpConfigured } from "@/lib/adminAuth";
import { sentryConfigured } from "@/lib/sentry";

// Turns a bunch of one-off security checks (done across several audits in
// Aug 2026) into something visible on the admin dashboard at any time,
// instead of living only in past conversations. This list should only grow
// when something new is actually built or verified in code -- never padded
// to look more complete than the app really is.
export type SecurityCheckStatus = "protected" | "planned";

export type SecurityCheck = {
  id: string;
  label: string;
  status: SecurityCheckStatus;
  detail: string;
};

export function getStaticSecurityChecklist(): SecurityCheck[] {
  return [
    {
      id: "rate-limiting",
      label: "AI-cost rate limiting",
      status: "protected",
      detail:
        "Every endpoint that spends real OpenAI budget is capped per-user and per-network (IP), so one account or one compromised network can't run up an unbounded bill.",
    },
    {
      id: "access-isolation",
      label: "Cross-user data isolation",
      status: "protected",
      detail:
        "Automated tests prove one user can never read, edit, or delete another user's memories or chats -- even knowing the exact ID.",
    },
    {
      id: "secrets",
      label: "No secrets in code",
      status: "protected",
      detail: "API keys and credentials live only in the server's environment variables, never committed to the codebase.",
    },
    {
      id: "mass-assignment",
      label: "Profile edits can't touch billing or limits",
      status: "protected",
      detail:
        "The endpoint users use to edit their own name/photo is whitelisted at the code level -- it has no path to subscription status or rate limits, even if the request is tampered with.",
    },
    {
      id: "error-monitoring",
      label: "Error monitoring",
      status: sentryConfigured() ? "protected" : "planned",
      detail: sentryConfigured()
        ? "Server errors are reported to Sentry in real time, not just left in server logs no one is watching."
        : "Sentry is integrated but SENTRY_API_TOKEN isn't set on this server yet -- errors aren't being reported anywhere.",
    },
    {
      id: "admin-mfa",
      label: "Admin login MFA",
      status: adminTotpConfigured() ? "protected" : "planned",
      detail: adminTotpConfigured()
        ? "Admin login requires a 6-digit authenticator app code in addition to the password."
        : "ADMIN_TOTP_SECRET isn't set on this server yet -- admin login is password-only.",
    },
    {
      id: "backups",
      label: "Backups",
      status: "protected",
      detail:
        "Daily automated snapshots, with a full restore tested end-to-end (integrity check plus row-count match against the live database).",
    },
    {
      id: "rollback",
      label: "Rollback plan",
      status: "protected",
      detail: "A broken deploy can be undone with one command (scripts/rollback.sh), restoring the exact last-known-good version.",
    },
    {
      id: "dependency-scanning",
      label: "Dependency vulnerability scanning",
      status: "protected",
      detail: "GitHub Dependabot alerts are enabled -- new vulnerabilities in any library Strivo depends on are flagged automatically.",
    },
    {
      id: "staging",
      label: "Staging environment",
      status: "planned",
      detail: "Not set up yet -- every change currently goes straight to production.",
    },
  ];
}

export type DependencyAuditSummary = {
  scannedAt: string;
  totals: { critical: number; high: number; moderate: number; low: number; info: number; total: number };
  vulnerablePackages: { name: string; severity: string; fixAvailable: boolean }[];
};

const AUDIT_FILE = path.join(process.cwd(), "security-audit.json");

// Reads the npm-audit snapshot scripts/deploy.sh writes on every deploy.
// Deliberately never runs `npm audit` itself here -- that's a slow
// subprocess call against the registry, and this route can be hit by
// dashboard polling, so it only ever reads whatever the last real deploy
// already computed. Returns null if no scan has happened yet (e.g. before
// the first deploy after this feature shipped).
export function readDependencyAudit(): DependencyAuditSummary | null {
  let raw: string;
  try {
    raw = fs.readFileSync(AUDIT_FILE, "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // npm audit's --json shape (npm 9+): top-level `vulnerabilities` keyed by
  // package name, and `metadata.vulnerabilities` with severity totals. Read
  // defensively since this is an external tool's output, not our own type.
  const data = parsed as {
    metadata?: { vulnerabilities?: Record<string, number> };
    vulnerabilities?: Record<string, { severity?: string; fixAvailable?: boolean | object }>;
  };

  const v = data.metadata?.vulnerabilities ?? {};
  const totals = {
    critical: v.critical ?? 0,
    high: v.high ?? 0,
    moderate: v.moderate ?? 0,
    low: v.low ?? 0,
    info: v.info ?? 0,
    total: v.total ?? 0,
  };

  const vulnerablePackages = Object.entries(data.vulnerabilities ?? {}).map(([name, info]) => ({
    name,
    severity: info.severity ?? "unknown",
    fixAvailable: !!info.fixAvailable,
  }));

  let scannedAt: string;
  try {
    scannedAt = fs.statSync(AUDIT_FILE).mtime.toISOString();
  } catch {
    scannedAt = new Date().toISOString();
  }

  return { scannedAt, totals, vulnerablePackages };
}
