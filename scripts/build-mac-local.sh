#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="/private/tmp/ChineseChessBuild"
APP_NAME="Chinese Chess.app"

cd "$ROOT_DIR"
npx electron-builder --mac dir

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"
cp -R "$ROOT_DIR/dist/mac-arm64/$APP_NAME" "$TMP_DIR/$APP_NAME"
xattr -cr "$TMP_DIR/$APP_NAME"
codesign --force --deep --sign - "$TMP_DIR/$APP_NAME"

echo "Built signed local app:"
echo "$TMP_DIR/$APP_NAME"
