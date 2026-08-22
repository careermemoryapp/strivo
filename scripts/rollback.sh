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
echo "Building..."
npm run build

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
