#!/usr/bin/env bash
# Build the latest version and replace the installed /Applications/Crafterm.app.
# Usage: npm run deploy
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="Crafterm"
DEST="/Applications/${APP_NAME}.app"

echo "▸ Building renderer/main/preload…"
npm run build

echo "▸ Packaging app (.app)…"
npx electron-builder --dir

# electron-builder writes to dist/mac, dist/mac-arm64, or dist/mac-universal
APP_PATH="$(find dist -maxdepth 2 -name "${APP_NAME}.app" -type d 2>/dev/null | head -1)"
if [[ -z "${APP_PATH}" ]]; then
  echo "✗ Could not find built ${APP_NAME}.app under dist/" >&2
  exit 1
fi
echo "▸ Built: ${APP_PATH}"

echo "▸ Quitting running instance (if any)…"
osascript -e "quit app \"${APP_NAME}\"" 2>/dev/null || true
sleep 1

echo "▸ Replacing ${DEST}…"
rm -rf "${DEST}"
cp -R "${APP_PATH}" "${DEST}"

echo "▸ Launching ${APP_NAME}…"
open "${DEST}"

echo "✓ Deployed ${APP_NAME} to /Applications"
