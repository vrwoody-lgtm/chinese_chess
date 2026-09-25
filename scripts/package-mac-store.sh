#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SOURCE="$ROOT_DIR/src-tauri/target/release/bundle/macos/Chinese Chess.app"
APP_NAME="Chinese Chess.app"
WORK_DIR="/private/tmp/PureChineseChessMacStore"
PAYLOAD_DIR="$WORK_DIR/payload"
APP_PATH="$PAYLOAD_DIR/$APP_NAME"
PKG_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/PureChineseChess.pkg"
TMP_PKG_PATH="$WORK_DIR/PureChineseChess.pkg"
ENGINE_PATH="$APP_PATH/Contents/Resources/_up_/engines/pikafish"
HELPERS_DIR="$APP_PATH/Contents/Helpers"
HELPER_ENGINE_PATH="$HELPERS_DIR/pikafish"
PROFILE_PATH="${PROFILE_PATH:-$HOME/Downloads/PureChineseChess_Mac_App_Store.provisionprofile}"
APP_SIGN_IDENTITY="${APP_SIGN_IDENTITY:-}"
INSTALLER_SIGN_IDENTITY="${INSTALLER_SIGN_IDENTITY:-}"
PROFILE_PLIST="$WORK_DIR/profile.plist"
STORE_ENTITLEMENTS="$WORK_DIR/store-entitlements.plist"
PKG_VERIFY_DIR="$WORK_DIR/pkg-verify"
HELPER_ENTITLEMENTS="$ROOT_DIR/src-tauri/entitlements.helper.plist"

if [[ ! -d "$APP_SOURCE" ]]; then
  echo "Missing app bundle. Run npm run build:mac:store first."
  exit 1
fi

if [[ -z "$APP_SIGN_IDENTITY" ]]; then
  echo "Set APP_SIGN_IDENTITY to your Apple Distribution or Mac App Distribution certificate name."
  echo "Example: APP_SIGN_IDENTITY='Apple Distribution: Your Name (TEAMID)'"
  exit 1
fi

if [[ -z "$INSTALLER_SIGN_IDENTITY" ]]; then
  echo "Set INSTALLER_SIGN_IDENTITY to your Mac Installer Distribution certificate name."
  echo "Example: INSTALLER_SIGN_IDENTITY='3rd Party Mac Developer Installer: Your Name (TEAMID)'"
  exit 1
fi

if [[ ! -f "$PROFILE_PATH" ]]; then
  echo "Provisioning profile not found: $PROFILE_PATH"
  exit 1
fi

rm -rf "$WORK_DIR"
mkdir -p "$PAYLOAD_DIR"
rm -f "$PKG_PATH"
cp -R "$APP_SOURCE" "$APP_PATH"
cp "$PROFILE_PATH" "$APP_PATH/Contents/embedded.provisionprofile"
xattr -cr "$APP_PATH"

mkdir -p "$HELPERS_DIR"
mv "$ENGINE_PATH" "$HELPER_ENGINE_PATH"
ln -s "../../../Helpers/pikafish" "$ENGINE_PATH"

if ! security cms -D -i "$PROFILE_PATH" > "$PROFILE_PLIST" 2>/dev/null; then
  perl -0777 -ne 'if (/(<\?xml.*?<\/plist>)/s) { print $1 }' "$PROFILE_PATH" > "$PROFILE_PLIST"
fi

plutil -extract Entitlements xml1 -o "$STORE_ENTITLEMENTS" "$PROFILE_PLIST"
/usr/libexec/PlistBuddy -c "Add :com.apple.security.app-sandbox bool true" "$STORE_ENTITLEMENTS" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :com.apple.security.app-sandbox true" "$STORE_ENTITLEMENTS"
/usr/libexec/PlistBuddy -c "Add :com.apple.security.network.client bool true" "$STORE_ENTITLEMENTS" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :com.apple.security.network.client true" "$STORE_ENTITLEMENTS"

codesign --force --entitlements "$HELPER_ENTITLEMENTS" --sign "$APP_SIGN_IDENTITY" "$HELPER_ENGINE_PATH"
codesign --force --entitlements "$STORE_ENTITLEMENTS" --sign "$APP_SIGN_IDENTITY" "$APP_PATH"
codesign --verify --strict --verbose=2 "$HELPER_ENGINE_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

productbuild --component "$APP_PATH" /Applications --sign "$INSTALLER_SIGN_IDENTITY" "$TMP_PKG_PATH"

rm -rf "$PKG_VERIFY_DIR"
pkgutil --expand-full "$TMP_PKG_PATH" "$PKG_VERIFY_DIR"
VERIFY_APP_PATH=$(find "$PKG_VERIFY_DIR" -path "*/Payload/$APP_NAME" -type d -maxdepth 5 | head -1)
if [[ -z "$VERIFY_APP_PATH" ]]; then
  echo "Could not find app bundle inside generated package."
  exit 1
fi
codesign --verify --strict --verbose=2 "$VERIFY_APP_PATH/Contents/Helpers/pikafish"
codesign --verify --deep --strict --verbose=2 "$VERIFY_APP_PATH"
codesign -d --entitlements :- "$VERIFY_APP_PATH/Contents/Helpers/pikafish" 2>/dev/null | \
  grep -q "com.apple.security.app-sandbox"
codesign -d --entitlements :- "$VERIFY_APP_PATH/Contents/Helpers/pikafish" 2>/dev/null | \
  grep -q "com.apple.security.inherit"
mv "$TMP_PKG_PATH" "$PKG_PATH"

echo "Created Mac App Store package:"
echo "$PKG_PATH"
