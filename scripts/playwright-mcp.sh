#!/usr/bin/env bash
set -euo pipefail

# MCP wrapper for Playwright Electron verification.
# Derives a deterministic CDP port from the worktree path, so it matches
# the port used by scripts/dev.sh — no coordination files needed.
# Each worktree has a unique path → unique port → no collisions.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CDP_PORT=$(python3 -c "
import hashlib
h = int(hashlib.md5('$PROJECT_ROOT'.encode()).hexdigest()[:4], 16)
print(10000 + (h % 50000))
")

exec npx @playwright/mcp@latest --cdp-endpoint "http://localhost:$CDP_PORT"
