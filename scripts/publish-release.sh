#!/usr/bin/env bash
# 手动打包并发布到 GitHub Release。
#
# 用法：
#   1) 先在对应平台上构建（Windows 用 Windows 机器，macOS 用 Mac 机器）：
#        npm install
#        npm run tauri:build
#   2) 运行本脚本发布（需已安装 gh 并登录：gh auth login）：
#        bash scripts/publish-release.sh v0.2.0
#
# 它会收集本平台打包产物，并上传到以该 tag 命名的 GitHub Release。
# 跨平台协作时，各自在自己机器上运行本脚本，最终同一个 Release 会累积
# Windows + macOS 两套产物。

set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "用法: bash scripts/publish-release.sh <tag，例如 v0.2.0>"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"

if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "未找到打包产物目录: $BUNDLE_DIR"
  echo "请先运行 npm run tauri:build"
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "收集打包产物..."
shopt -s nullglob
# Windows
cp $BUNDLE_DIR/msi/*.msi "$TMP" 2>/dev/null || true
cp $BUNDLE_DIR/nsis/*.exe "$TMP" 2>/dev/null || true
cp $BUNDLE_DIR/portable/*.exe "$TMP" 2>/dev/null || true
# macOS
cp $BUNDLE_DIR/dmg/*.dmg "$TMP" 2>/dev/null || true
APP=$(ls -d $BUNDLE_DIR/macos/*.app 2>/dev/null | head -n1)
if [[ -n "$APP" ]]; then
  (cd "$(dirname "$APP")" && zip -r -y "$TMP/$(basename "$APP" .app).app.zip" "$(basename "$APP")")
fi
shopt -u nullglob

if [[ -z "$(ls -A "$TMP")" ]]; then
  echo "没有收集到任何产物，请确认构建已成功完成。"
  exit 1
fi

echo "收集到的文件："
ls -lh "$TMP"

# 确保 Release 存在（不存在则创建 draft，稍后手动发布）
if ! gh release view "$VERSION" >/dev/null 2>&1; then
  echo "创建 Release $VERSION ..."
  gh release create "$VERSION" --draft --title "$VERSION" --notes "自动创建，待补充发布说明。"
fi

echo "上传产物到 Release $VERSION ..."
gh release upload "$VERSION" "$TMP"/* --clobber

echo "完成。请到 GitHub 的 Releases 页面检查并发布（若仍为 draft）。"
