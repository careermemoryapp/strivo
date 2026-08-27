#!/usr/bin/env bash
# Runs just the dependency-vulnerability scan and writes the snapshot the
# admin dashboard's Security status panel reads (see readDependencyAudit in
# src/lib/securityStatus.ts). Previously this only ever ran as a side effect
# of scripts/deploy.sh, which meant a newly-disclosed CVE against an
# already-installed package would go unnoticed for however long it happened
# to be between deploys -- this script lets it run independently, on its own
# schedule, without touching the running app or requiring a deploy.
#
# One-off usage (on the EC2 server, inside ~/strivo):
#   bash scripts/audit-check.sh
#
# Recommended: add a weekly cron entry so this runs even during a stretch
# with no deploys. Run `crontab -e` on the server and add:
#   0 4 * * 1 cd ~/strivo && bash scripts/audit-check.sh >> audit-check.log 2>&1
# (4am every Monday; adjust the path if strivo isn't checked out at ~/strivo)
set -e

cd "$(dirname "$0")/.."

echo "$(date -Iseconds) Scanning dependencies for known vulnerabilities..."
# Same command and `|| true` reasoning as scripts/deploy.sh: npm audit exits
# non-zero when it finds anything, which isn't a failure of this script --
# the results still get written to disk either way.
npm audit --omit=dev --json > security-audit.json 2>/dev/null || true
echo "$(date -Iseconds) Done -- results visible on the admin dashboard."
