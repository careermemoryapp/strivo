#!/usr/bin/env bash
# Deploys the latest pushed code, and remembers what was running before --
# so a bad deploy can be undone with one command (see rollback.sh).
#
# Usage (on the EC2 server, inside ~/strivo):
#   bash scripts/deploy.sh
set -e

cd "$(dirname "$0")/.."

# Remember what's live right now, before touching anything. This is what
# rollback.sh restores if the new version turns out to be broken.
PREVIOUS_COMMIT=$(git rev-parse HEAD)
echo "$PREVIOUS_COMMIT" > .last-known-good
echo "Saved current version ($PREVIOUS_COMMIT) as the rollback point."
echo ""

echo "Pulling latest code..."
git pull

echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "Scanning dependencies for known vulnerabilities..."
# npm audit exits non-zero when it finds anything, which would otherwise
# trip this script's `set -e` -- `|| true` just means "don't stop the
# deploy over this," the actual results still get written to disk either
# way and read by the admin dashboard's Security status panel.
npm audit --omit=dev --json > security-audit.json 2>/dev/null || true
echo "Done (results visible on the admin dashboard)."

echo ""
echo "Building..."
npm run build

echo ""
echo "Restarting..."
pm2 restart strivo --update-env

NEW_COMMIT=$(git rev-parse HEAD)
echo ""
if [ "$NEW_COMMIT" = "$PREVIOUS_COMMIT" ]; then
  echo "Deployed $NEW_COMMIT (no new changes -- already up to date)."
else
  echo "Deployed $NEW_COMMIT."
  echo "If anything looks broken, run: bash scripts/rollback.sh"
fi
