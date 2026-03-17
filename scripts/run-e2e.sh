#!/usr/bin/env bash
set -euo pipefail

# Orchestrate e2e tests against the production Electron binary:
#   1. Source .env.local for BOLTZ_API_KEY
#   2. Verify production binary exists
#   3. Launch it with CDP enabled
#   4. Wait for CDP to be ready
#   5. Run Playwright tests
#   6. Clean up (always, via trap)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Always clean up on exit ─────────────────────────────────────────
cleanup() {
  echo ""
  echo "Cleaning up..."
  bash "$SCRIPT_DIR/prod-test-stop.sh" 2>/dev/null || true
}
trap cleanup EXIT

# ── Source .env.local for API key ────────────────────────────────────
if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_ROOT/.env.local"
  set +a
fi

if [[ -z "${BOLTZ_API_KEY:-}" ]]; then
  echo "ERROR: BOLTZ_API_KEY not set." >&2
  echo "Either export it or add it to .env.local" >&2
  exit 1
fi

# ── Clean up previous test data for isolation ──────────────────────────
CDP_PORT=$(python3 -c "
import hashlib, sys
h = int(hashlib.md5(sys.argv[1].encode()).hexdigest()[:4], 16)
print(10000 + (h % 50000))
" "$PROJECT_ROOT")
rm -rf "/tmp/multiplexer-prod-playwright-$CDP_PORT"
rm -rf "/tmp/multiplexer-prod-test-$CDP_PORT"

# ── Launch production binary ─────────────────────────────────────────
bash "$SCRIPT_DIR/prod-test.sh"

# ── Derive CDP port (same algorithm) ────────────────────────────────
CDP_PORT=$(python3 -c "
import hashlib, sys
h = int(hashlib.md5(sys.argv[1].encode()).hexdigest()[:4], 16)
print(10000 + (h % 50000))
" "$PROJECT_ROOT")

# ── Wait for CDP to be ready ────────────────────────────────────────
echo "Waiting for CDP on port $CDP_PORT..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:$CDP_PORT/json/version" > /dev/null 2>&1; then
    echo "CDP ready."
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "ERROR: CDP not ready after 30 seconds." >&2
    exit 1
  fi
  sleep 1
done

# ── Run Playwright tests ────────────────────────────────────────────
cd "$PROJECT_ROOT"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test "$@"
