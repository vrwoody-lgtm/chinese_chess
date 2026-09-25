#!/usr/bin/env bash
set -euo pipefail

# Xcode runs build phases without loading the user's interactive shell profile.
# Make npm available when Node.js is installed through nvm or Homebrew.
if [ -n "${HOME:-}" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh" --no-use
  nvm use --silent >/dev/null 2>&1 || true
fi

# Xcode build phases do not inherit the interactive shell PATH. Rustup
# installs rustc and llvm tools in this directory, so expose them before the
# Tauri script and the SwiftRs post-processing run.
if [ -d "${HOME:-}/.cargo/bin" ]; then
  PATH="$HOME/.cargo/bin:$PATH"
  export PATH
fi

if ! command -v npm >/dev/null 2>&1 && [ -n "${HOME:-}" ]; then
  for node_bin in "$HOME"/.nvm/versions/node/*/bin; do
    if [ -x "$node_bin/npm" ]; then
      PATH="$node_bin:$PATH"
      export PATH
      break
    fi
  done
fi

PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm is required to build the iOS target. Install Node.js or configure it in the Xcode build environment." >&2
  exit 1
fi

npm run -- tauri ios xcode-script "$@"

# Xcode 27 internalizes SwiftRs @_cdecl exports inside the Rust static archive.
# Promote them after Tauri's xcode-script copies libapp.a, before Xcode links it.
fix_swift_rs_exports() {
  local arch configuration archive rust_sysroot rust_host llvm_objcopy temp_dir
  arch="${ARCHS:-arm64}"
  arch="${arch%% *}"
  configuration="${CONFIGURATION:-release}"
  archive="${SRCROOT}/Externals/${arch}/${configuration}/libapp.a"

  if [ ! -f "$archive" ] || ! xcrun ar -t "$archive" | grep -x 'SwiftRs.o' >/dev/null; then
    return 0
  fi

  rust_sysroot="$(rustc --print sysroot)"
  rust_host="$(rustc -vV | sed -n 's/^host: //p')"
  llvm_objcopy="${rust_sysroot}/lib/rustlib/${rust_host}/bin/llvm-objcopy"
  if [ ! -x "$llvm_objcopy" ]; then
    echo "swift-rs requires llvm-objcopy; run 'rustup component add llvm-tools'." >&2
    return 1
  fi

  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/swift-rs.XXXXXX")"
  trap 'rm -rf "$temp_dir"' RETURN

  xcrun ar -p "$archive" SwiftRs.o > "$temp_dir/SwiftRs.o"
  "$llvm_objcopy" \
    --globalize-symbol=_retain_object \
    --globalize-symbol=_release_object \
    --globalize-symbol=_string_from_bytes \
    --globalize-symbol=_data_from_bytes \
    "$temp_dir/SwiftRs.o"
  (
    cd "$temp_dir"
    xcrun ar -r "$archive" SwiftRs.o
  )
  xcrun ranlib "$archive"
}

fix_swift_rs_exports
