#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Run all vitest suites across every haiphen service.
# Exits non-zero if any suite fails.
#
# Usage:
#   bash scripts/run-all-tests.sh          # run all
#   bash scripts/run-all-tests.sh auth api # run only these
# ─────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# All services with vitest test suites
ALL_SERVICES=(
  auth
  api
  checkout
  contact
  orchestrator
  crawler
  secure
  network
  graph
  risk
  causal
  supply
)

# If arguments passed, run only those
if [ $# -gt 0 ]; then
  SERVICES=("$@")
else
  SERVICES=("${ALL_SERVICES[@]}")
fi

PASS=0
FAIL=0
SKIP=0
RESULTS=()

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Haiphen Test Runner — $TIMESTAMP  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

for svc in "${SERVICES[@]}"; do
  dir="${ROOT}/haiphen-${svc}"

  # Check directory exists
  if [ ! -d "$dir" ]; then
    echo "⏭  haiphen-${svc}: directory not found — SKIP"
    SKIP=$((SKIP + 1))
    RESULTS+=("SKIP  haiphen-${svc}")
    continue
  fi

  # Check package.json has test script
  if [ ! -f "$dir/package.json" ]; then
    echo "⏭  haiphen-${svc}: no package.json — SKIP"
    SKIP=$((SKIP + 1))
    RESULTS+=("SKIP  haiphen-${svc}")
    continue
  fi

  # Check for vitest config
  has_vitest=false
  for cfg in vitest.config.ts vitest.config.js; do
    if [ -f "$dir/$cfg" ]; then
      has_vitest=true
      break
    fi
  done

  if [ "$has_vitest" = false ]; then
    echo "⏭  haiphen-${svc}: no vitest config — SKIP"
    SKIP=$((SKIP + 1))
    RESULTS+=("SKIP  haiphen-${svc}")
    continue
  fi

  # Install deps if node_modules missing
  if [ ! -d "$dir/node_modules" ]; then
    echo "📦 haiphen-${svc}: installing dependencies..."
    (cd "$dir" && npm install --silent 2>/dev/null) || true
  fi

  echo "🧪 haiphen-${svc}: running tests..."

  if (cd "$dir" && npx vitest run --reporter=verbose 2>&1); then
    echo "✅ haiphen-${svc}: PASS"
    PASS=$((PASS + 1))
    RESULTS+=("PASS  haiphen-${svc}")
  else
    echo "❌ haiphen-${svc}: FAIL"
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL  haiphen-${svc}")
  fi

  echo ""
done

# Summary
echo "══════════════════════════════════════════════════"
echo "  SUMMARY"
echo "══════════════════════════════════════════════════"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""
echo "  Total: $((PASS + FAIL + SKIP))  |  Pass: $PASS  |  Fail: $FAIL  |  Skip: $SKIP"
echo "══════════════════════════════════════════════════"

# Exit non-zero if any failures
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
