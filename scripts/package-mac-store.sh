#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SOURCE="$ROOT_DIR/src-tauri/target/release/bundle/macos/Chinese Chess.app"
APP_NAME="Chinese Chess.app"
WORK_DIR="/private/tmp/PureChineseChessMacStore"
APP_PATH="$WORK_DIR/$APP_NAME"
PKG_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/PureChineseChess.pkg"
ENGINE_PATH="$APP_PATH/Contents/Resources/_up_/engines/pikafish"
PROFILE_PATH="${PROFILE_PATH:-$HOME/Downloads/PureChineseChess_Mac_App_Store.provisionprofile}"
APP_SIGN_IDENTITY="${APP_SIGN_IDENTITY:-}"
INSTALLER_SIGN_IDENTITY="${INSTALLER_SIGN_IDENTITY:-}"
PROFILE_PLIST="$WORK_DIR/profile.plist"
STORE_ENTITLEMENTS="$WORK_DIR/store-entitlements.plist"
NESTED_ENTITLEMENTS="$ROOT_DIR/src-tauri/entitlements.mac.plist"

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
mkdir -p "$WORK_DIR"
cp -R "$APP_SOURCE" "$APP_PATH"
cp "$PROFILE_PATH" "$APP_PATH/Contents/embedded.provisionprofile"
xattr -cr "$APP_PATH"

if ! security cms -D -i "$PROFILE_PATH" > "$PROFILE_PLIST" 2>/dev/null; then
  perl -0777 -ne 'if (/(<\?xml.*?<\/plist>)/s) { print $1 }' "$PROFILE_PATH" > "$PROFILE_PLIST"
fi

plutil -extract Entitlements xml1 -o "$STORE_ENTITLEMENTS" "$PROFILE_PLIST"
/usr/libexec/PlistBuddy -c "Add :com.apple.security.app-sandbox bool true" "$STORE_ENTITLEMENTS" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :com.apple.security.app-sandbox true" "$STORE_ENTITLEMENTS"

codesign --force --timestamp --options runtime --entitlements "$NESTED_ENTITLEMENTS" --sign "$APP_SIGN_IDENTITY" "$ENGINE_PATH"
codesign --force --timestamp --options runtime --entitlements "$STORE_ENTITLEMENTS" --sign "$APP_SIGN_IDENTITY" "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

productbuild --component "$APP_PATH" /Applications --sign "$INSTALLER_SIGN_IDENTITY" "$PKG_PATH"

echo "Created Mac App Store package:"
echo "$PKG_PATH"
