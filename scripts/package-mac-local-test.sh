#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SOURCE="$ROOT_DIR/src-tauri/target/release/bundle/macos/Chinese Chess.app"
APP_NAME="Chinese Chess.app"
WORK_DIR="/private/tmp/PureChineseChessLocalTest"
PAYLOAD_DIR="$WORK_DIR/payload"
APP_PATH="$PAYLOAD_DIR/$APP_NAME"
PKG_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/PureChineseChess-local-test.pkg"
ENGINE_PATH="$APP_PATH/Contents/Resources/_up_/engines/pikafish"
HELPERS_DIR="$APP_PATH/Contents/Helpers"
HELPER_ENGINE_PATH="$HELPERS_DIR/pikafish"
COMPONENT_PLIST="$WORK_DIR/component.plist"
BUNDLE_ID="org.rwoodylabs.pureChineseChess.localtest"
APP_ENTITLEMENTS="$ROOT_DIR/src-tauri/entitlements.mac.plist"
HELPER_ENTITLEMENTS="$ROOT_DIR/src-tauri/entitlements.helper.plist"

if [[ ! -d "$APP_SOURCE" ]]; then
  echo "Missing app bundle. Run npm run build:mac:store first."
  exit 1
fi

rm -rf "$WORK_DIR"
mkdir -p "$PAYLOAD_DIR"
rm -f "$PKG_PATH"
cp -R "$APP_SOURCE" "$APP_PATH"
xattr -cr "$APP_PATH"

mkdir -p "$HELPERS_DIR"
mv "$ENGINE_PATH" "$HELPER_ENGINE_PATH"
ln -s "../../../Helpers/pikafish" "$ENGINE_PATH"

codesign --force --entitlements "$HELPER_ENTITLEMENTS" --sign - "$HELPER_ENGINE_PATH"
codesign --force --entitlements "$APP_ENTITLEMENTS" --sign - "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

pkgbuild --analyze --root "$PAYLOAD_DIR" "$COMPONENT_PLIST"
/usr/libexec/PlistBuddy -c "Set :0:BundleIsRelocatable false" "$COMPONENT_PLIST"
pkgbuild \
  --root "$PAYLOAD_DIR" \
  --install-location /Applications \
  --identifier "$BUNDLE_ID" \
  --version "0.2.0" \
  --component-plist "$COMPONENT_PLIST" \
  "$PKG_PATH"

echo "Created local test package:"
echo "$PKG_PATH"
