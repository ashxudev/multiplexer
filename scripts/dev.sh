#!/usr/bin/env bash
set -euo pipefail

# Launch the Electron app for Playwright verification with a deterministic
# CDP port derived from the worktree path. Safe to run in parallel across
# multiple git worktrees — each path maps to a unique port.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Derive deterministic CDP port from worktree path ────────────────
CDP_PORT=$(python3 -c "
import hashlib, sys
h = int(hashlib.md5(sys.argv[1].encode()).hexdigest()[:4], 16)
print(10000 + (h % 50000))
" "$PROJECT_ROOT")

# ── Check if port is already in use ─────────────────────────────────
if lsof -ti:"$CDP_PORT" > /dev/null 2>&1; then
  echo "ERROR: Port $CDP_PORT is already in use." >&2
  echo "Run 'bash scripts/dev-stop.sh' first, or check 'lsof -i :$CDP_PORT'." >&2
  exit 1
fi

# ── Isolate app data directory ──────────────────────────────────────
export MULTIPLEXER_ROOT_DIR="/tmp/multiplexer-data-$CDP_PORT"
mkdir -p "$MULTIPLEXER_ROOT_DIR"

# ── Detect macOS dark mode ──────────────────────────────────────────
#   nohup & can lose the connection to macOS WindowServer, causing
#   nativeTheme.shouldUseDarkColors to report false even in dark mode.
#   Pass hint via env var; the main process reads it to set themeSource.
if defaults read -g AppleInterfaceStyle &>/dev/null; then
  export MULTIPLEXER_FORCE_DARK=1
fi

# ── Launch electron-vite dev (fully detached) ───────────────────────
#   --remoteDebuggingPort: first-class electron-vite flag for CDP
#   --user-data-dir: isolates Electron profile (prefs, session, cache)
#     passed via -- separator to the Electron binary
nohup npx electron-vite dev \
  --remoteDebuggingPort "$CDP_PORT" \
  -- --user-data-dir="/tmp/multiplexer-playwright-$CDP_PORT" \
  > /dev/null 2>&1 &

APP_PID=$!

# ── Write PID file for cleanup ──────────────────────────────────────
echo "$APP_PID" > "$PROJECT_ROOT/.cdp-pid"

echo "Electron app launched:"
echo "  CDP port: $CDP_PORT"
echo "  PID:      $APP_PID"
echo "  userData: /tmp/multiplexer-playwright-$CDP_PORT"
echo "  dataDir:  $MULTIPLEXER_ROOT_DIR"
echo ""
echo "Playwright MCP is pre-connected to port $CDP_PORT."
echo "To stop: bash scripts/dev-stop.sh"
