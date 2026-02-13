#!/usr/bin/env bash
# cron-prospect-digest.sh — Automate prospect gif recording + digest send
#
# Usage:
#   ./scripts/cron-prospect-digest.sh                # record gif + commit
#   ./scripts/cron-prospect-digest.sh --send         # also trigger digest email (all subscribers)
#   ./scripts/cron-prospect-digest.sh --test         # send test digest to OWNER_EMAIL only
#   ./scripts/cron-prospect-digest.sh --gif-only     # just record gif, no commit
#   ./scripts/cron-prospect-digest.sh --send-only    # just trigger digest email (all subscribers)
#
# Crontab (weekly gif refresh + daily digest send):
#   0 12 * * 1  cd /Users/jks142857/Desktop/haiphen-aboutme && ./scripts/cron-prospect-digest.sh 2>&1 >> /tmp/prospect-digest.log
#   0 13 * * 1-5  # Already handled by haiphen-contact CF Worker cron
#
# Environment:
#   DIGEST_HMAC_SECRET — required for --send/--test (set via: export DIGEST_HMAC_SECRET=...)
#   CONTACT_URL — override contact worker URL (default: https://haiphen-contact.pi-307.workers.dev)
#   OWNER_EMAIL — test recipient (default: jude@haiphen.io)
#
set -euo pipefail
cd "$(dirname "$0")/.."

CONTACT_URL="${CONTACT_URL:-https://haiphen-contact.pi-307.workers.dev}"
DIGEST_ENDPOINT="/api/digest/send"
GIF_OUTPUT="docs/assets/demos/cli-prospect-pipeline.gif"
OWNER_EMAIL="${OWNER_EMAIL:-jude@haiphen.io}"
SEND=false
GIF_ONLY=false
SEND_ONLY=false
TEST_SEND=false

for arg in "$@"; do
  case "$arg" in
    --send) SEND=true ;;
    --test) TEST_SEND=true ;;
    --gif-only) GIF_ONLY=true ;;
    --send-only) SEND_ONLY=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Step 1: Record prospect pipeline gif ──
if ! $SEND_ONLY; then
  log "Recording prospect pipeline gif..."

  if ! command -v vhs &>/dev/null; then
    log "ERROR: vhs not found. Install with: brew install vhs"
    exit 1
  fi

  ./scripts/record-demos.sh prospect-pipeline

  if [[ ! -f "$GIF_OUTPUT" ]]; then
    log "ERROR: Gif not found at $GIF_OUTPUT"
    exit 1
  fi

  GIF_SIZE=$(stat -f%z "$GIF_OUTPUT" 2>/dev/null || stat -c%s "$GIF_OUTPUT" 2>/dev/null || echo "0")
  GIF_KB=$((GIF_SIZE / 1024))
  log "Gif recorded: ${GIF_KB}KB"

  if $GIF_ONLY; then
    log "Done (gif-only mode)"
    exit 0
  fi

  # ── Step 2: Commit + push if changed ──
  if git diff --quiet -- "$GIF_OUTPUT" 2>/dev/null; then
    log "Gif unchanged, skipping commit"
  else
    log "Committing updated gif..."
    git add "$GIF_OUTPUT"
    git commit -m "chore: refresh prospect pipeline demo gif

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
    log "Pushing to remote..."
    git push origin HEAD
    log "Gif committed and pushed"
  fi
fi

# ── Step 3: Trigger digest send ──
if $SEND || $SEND_ONLY || $TEST_SEND; then
  SECRET="${DIGEST_HMAC_SECRET:-}"
  if [[ -z "$SECRET" ]]; then
    log "ERROR: DIGEST_HMAC_SECRET not set. Export it before running with --send/--test"
    exit 1
  fi

  SEND_DATE=$(date -u +%Y-%m-%d)
  if $TEST_SEND; then
    BODY="{\"send_date\":\"${SEND_DATE}\",\"test_email\":\"${OWNER_EMAIL}\"}"
    log "Test mode: sending only to ${OWNER_EMAIL}"
  else
    BODY="{\"send_date\":\"${SEND_DATE}\"}"
  fi
  URL="${CONTACT_URL}${DIGEST_ENDPOINT}"

  TS=$(python3 -c "import time; print(int(time.time()*1000))")
  SIG=$(printf '%s' "${TS}.${BODY}" | openssl dgst -sha256 -hmac "${SECRET}" -hex 2>/dev/null | awk '{print $NF}')

  log "Triggering digest send for ${SEND_DATE}..."
  RESP=$(curl -s -w "\n%{http_code}" -X POST "${URL}" \
    -H "Content-Type: application/json" \
    -H "X-Haiphen-Ts: ${TS}" \
    -H "X-Haiphen-Sig: ${SIG}" \
    -d "${BODY}")

  HTTP_CODE=$(echo "$RESP" | tail -1)
  BODY_RESP=$(echo "$RESP" | sed '$d')

  if [[ "$HTTP_CODE" == "200" ]]; then
    log "Digest sent successfully: ${BODY_RESP}"
  else
    log "ERROR: Digest send failed (HTTP ${HTTP_CODE}): ${BODY_RESP}"
    exit 1
  fi
fi

log "Done"
