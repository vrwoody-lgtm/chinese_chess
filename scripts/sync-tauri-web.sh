#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/tauri-web"

mkdir -p "$WEB_DIR"
cp "$ROOT_DIR/index.html" "$WEB_DIR/index.html"
cp "$ROOT_DIR/styles.css" "$WEB_DIR/styles.css"
cp "$ROOT_DIR/game.js" "$WEB_DIR/game.js"
rm -rf "$WEB_DIR/assets"
cp -R "$ROOT_DIR/assets" "$WEB_DIR/assets"
