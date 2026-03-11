#!/usr/bin/env bash
set -euo pipefail

# Stop the Electron app launched by scripts/dev.sh.
# Derives the same deterministic CDP port and kills processes on it.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Derive the same CDP port ────────────────────────────────────────
CDP_PORT=$(python3 -c "
import hashlib
h = int(hashlib.md5('$PROJECT_ROOT'.encode()).hexdigest()[:4], 16)
print(10000 + (h % 50000))
")

PID_FILE="$PROJECT_ROOT/.cdp-pid"

# Kill by PID if available
if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" | tr -d '[:space:]')"
  if [[ -n "$PID" ]] && ps -p "$PID" > /dev/null 2>&1; then
    echo "Killing Electron app (PID $PID)..."
    kill "$PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# Also kill anything bound to the CDP port (child processes)
PIDS="$(lsof -ti:"$CDP_PORT" 2>/dev/null || true)"
if [[ -n "$PIDS" ]]; then
  echo "Killing processes on CDP port $CDP_PORT..."
  echo "$PIDS" | xargs kill 2>/dev/null || true
fi

echo "Cleaned up (port $CDP_PORT)."
