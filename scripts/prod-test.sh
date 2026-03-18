#!/usr/bin/env bash
set -euo pipefail

# Launch the PRODUCTION Electron binary for Playwright e2e testing with a
# deterministic CDP port derived from the worktree path. Mirrors dev.sh but
# targets the packaged .app instead of electron-vite dev.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Derive deterministic CDP port from worktree path ────────────────
CDP_PORT=$(python3 -c "
import hashlib, sys
h = int(hashlib.md5(sys.argv[1].encode()).hexdigest()[:4], 16)
print(10000 + (h % 50000))
" "$PROJECT_ROOT")

# ── Verify production binary exists ─────────────────────────────────
APP_BINARY="$PROJECT_ROOT/dist/mac-arm64/Multiplexer.app/Contents/MacOS/Multiplexer"
if [[ ! -f "$APP_BINARY" ]]; then
  echo "ERROR: Production binary not found at:" >&2
  echo "  $APP_BINARY" >&2
  echo "Run 'pnpm dist:mac' first to build the notarized .dmg." >&2
  exit 1
fi

# ── Check if port is already in use ─────────────────────────────────
if lsof -ti:"$CDP_PORT" > /dev/null 2>&1; then
  echo "ERROR: Port $CDP_PORT is already in use." >&2
  echo "Run 'bash scripts/prod-test-stop.sh' first, or check 'lsof -i :$CDP_PORT'." >&2
  exit 1
fi

# ── Isolate app data directories ────────────────────────────────────
export MULTIPLEXER_E2E=1
export MULTIPLEXER_ROOT_DIR="/tmp/multiplexer-prod-test-$CDP_PORT"
export MULTIPLEXER_USER_DATA_DIR="/tmp/multiplexer-prod-playwright-$CDP_PORT"
export REMOTE_DEBUGGING_PORT="$CDP_PORT"
mkdir -p "$MULTIPLEXER_ROOT_DIR" "$MULTIPLEXER_USER_DATA_DIR"

# ── Detect macOS dark mode ──────────────────────────────────────────
if defaults read -g AppleInterfaceStyle &>/dev/null; then
  export MULTIPLEXER_FORCE_DARK=1
fi

# ── Launch production binary (fully detached) ───────────────────────
nohup "$APP_BINARY" > /dev/null 2>&1 &

APP_PID=$!

# ── Write PID file for cleanup ──────────────────────────────────────
echo "$APP_PID" > "$PROJECT_ROOT/.cdp-prod-pid"

echo "Production Electron app launched:"
echo "  CDP port: $CDP_PORT"
echo "  PID:      $APP_PID"
echo "  userData: $MULTIPLEXER_USER_DATA_DIR"
echo "  dataDir:  $MULTIPLEXER_ROOT_DIR"
echo ""
echo "To stop: bash scripts/prod-test-stop.sh"
