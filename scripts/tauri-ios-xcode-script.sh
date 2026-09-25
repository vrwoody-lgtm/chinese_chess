#!/usr/bin/env bash
set -euo pipefail

# Xcode runs build phases without loading the user's interactive shell profile.
# Make npm available when Node.js is installed through nvm or Homebrew.
if [ -n "${HOME:-}" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh" --no-use
  nvm use --silent >/dev/null 2>&1 || true
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

exec npm run -- tauri ios xcode-script "$@"
