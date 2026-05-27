#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Web sessions bootstrap Node 22, but this project pins Node 26 via .nvmrc
# (engines.node >= 26). On Node < 24, `URLPattern` is not a global, so the
# worker-routing test suite fails to even load. Select the .nvmrc Node via nvm,
# persist it on PATH for the whole session, then install dependencies.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 1

# Locate and source nvm (the function is not available in non-login shells).
for candidate in "/opt/nvm/nvm.sh" "${NVM_DIR:-}/nvm.sh" "$HOME/.nvm/nvm.sh"; do
  if [ -n "$candidate" ] && [ -s "$candidate" ]; then
    # shellcheck disable=SC1090
    . "$candidate"
    break
  fi
done

if command -v nvm >/dev/null 2>&1; then
  # No version argument => nvm reads the version from .nvmrc.
  if nvm install && nvm use; then
    node_bin_dir="$(dirname "$(command -v node)")"
    if [ -d "$node_bin_dir" ]; then
      export PATH="$node_bin_dir:$PATH"
      if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
        echo "export PATH=\"$node_bin_dir:\$PATH\"" >> "$CLAUDE_ENV_FILE"
      fi
    fi
  else
    echo "WARN: could not select the .nvmrc Node via nvm; continuing with $(node -v)" >&2
  fi
else
  echo "WARN: nvm not found; continuing with $(node -v)" >&2
fi

echo "Using node $(node -v) / npm $(npm -v)"

npm install
