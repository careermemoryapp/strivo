#!/usr/bin/env bash
# Restores the version that was live right before the most recent deploy.
# Use this if a deploy just broke something and you need the site working
# again immediately -- figure out what actually went wrong afterwards, no
# need to rush that part.
#
# Usage (on the EC2 server, inside ~/strivo):
#   bash scripts/rollback.sh
set -e

cd "$(dirname "$0")/.."

if [ ! -f .last-known-good ]; then
  echo "No rollback point saved yet -- this only works after at least one"
  echo "deploy done via scripts/deploy.sh. Nothing to roll back to."
  exit 1
fi

TARGET=$(cat .last-known-good)
echo "Rolling back to $TARGET..."
echo ""

git reset --hard "$TARGET"

echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "Stopping the app for the build..."
# Same reasoning as deploy.sh -- this server doesn't have enough spare RAM
# to build Next.js while the live app keeps running, so the site is offline
# for the length of the build below (recent runs: ~8-9 minutes).
pm2 stop strivo || true

echo ""
echo "Building..."
# Same scratch-dir-then-swap approach as deploy.sh -- see its comment for
# why building straight into the live ".next" is worth avoiding.
rm -rf .next-build
NEXT_DIST_DIR=.next-build npm run build

echo ""
echo "Swapping in the build..."
rm -rf .next-previous-build
[ -d .next ] && mv .next .next-previous-build
mv .next-build .next
rm -rf .next-previous-build

echo ""
echo "Restarting..."
pm2 restart strivo --update-env

echo ""
echo "Rolled back to $TARGET and restarted. The site should be back to how"
echo "it was before the last deploy."
echo ""
echo "Note: this only undoes the CODE. It never touches the database, so"
echo "nobody's accounts or memories are affected either way."
echo ""
echo "Important: the broken version is still the latest thing on GitHub."
echo "Don't run deploy.sh again until the actual bug has been fixed and"
echo "pushed -- otherwise the next deploy will just bring the same problem"
echo "right back."
