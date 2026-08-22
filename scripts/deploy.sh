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
echo "Stopping the app for the build..."
# The server this runs on has under 1GB of real RAM. The live app's two pm2
# workers alone eat a big chunk of that, and building Next.js at the same
# time was pushing the machine into out-of-memory territory -- the build
# would compile fine and then get silently SIGKILLed by the kernel right
# after, even with 2GB of swap already in place (confirmed via `free -h` /
# `pm2 list` on 2026-08-22: only ~264MB free RAM at idle before the build
# even starts). Stopping the app frees that memory for the build instead.
# This is the real, if unfortunate, tradeoff of a single small server: the
# site is offline for the length of the build below (recent runs: ~8-9
# minutes) every time you deploy. If that ever becomes a real problem,
# upgrading to an instance with more RAM removes this tradeoff entirely --
# ask before doing that, since it's an ongoing cost increase.
pm2 stop strivo || true

echo ""
echo "Building..."
# Build into a scratch directory instead of the live ".next" -- even with
# the app stopped above, building straight into ".next" risks the restart
# below picking up a half-written directory if anything goes wrong
# mid-build. Swapping the whole finished directory in with one instant
# rename avoids that.
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
