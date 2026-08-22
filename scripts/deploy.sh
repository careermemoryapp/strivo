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
# Build into a scratch directory instead of the live ".next" -- the old
# server keeps running and answering real requests the whole time this
# runs, and building straight into ".next" means it's overwriting, file by
# file, the exact files that live process might be reading from at that
# exact moment. That's the real cause of the odd one-off "manifest does not
# exist" / "cannot find module" errors that show up in Sentry right around
# deploy times. Swapping the whole finished directory in with one instant
# rename removes that window almost entirely.
rm -rf .next-build
NEXT_DIST_DIR=.next-build npm run build

echo ""
echo "Swapping in the new build..."
rm -rf .next-previous-build
[ -d .next ] && mv .next .next-previous-build
mv .next-build .next
rm -rf .next-previous-build

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
