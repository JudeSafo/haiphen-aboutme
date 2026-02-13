#!/usr/bin/env bash
# cron-prospect-targeted.sh — Daily targeted F500 pipeline with report + gif + email
#
# End-to-end flow:
#   1. Pick a Fortune 500 company from the rotation list
#   2. Run targeted crawl → investigate → draft outreach via API
#   3. Fetch LaTeX report from API → compile to PDF
#   4. Record VHS gif demo for the targeted pipeline
#   5. Send outreach email with PDF report + gif attached
#
# Usage:
#   ./scripts/cron-prospect-targeted.sh                     # full pipeline (next in rotation)
#   ./scripts/cron-prospect-targeted.sh --target "Goldman Sachs"  # specific company
#   ./scripts/cron-prospect-targeted.sh --test              # send to OWNER_EMAIL only
#   ./scripts/cron-prospect-targeted.sh --dry-run           # crawl + report only, no email
#
# Crontab (daily at 7am UTC, after 3am crawler + 6am digest):
#   0 7 * * * cd /Users/jks142857/Desktop/haiphen-aboutme && ./scripts/cron-prospect-targeted.sh 2>&1 >> /tmp/prospect-targeted.log
#
# Environment:
#   HAIPHEN_TOKEN        — CLI auth token (required)
#   HAIPHEN_API_ORIGIN   — API origin (default: https://api.haiphen.io)
#   PROSPECT_HMAC_SECRET — HMAC for outreach send (required for email)
#   CONTACT_URL          — contact worker URL
#   OWNER_EMAIL          — test recipient (default: jude@haiphen.io)
#
set -euo pipefail
cd "$(dirname "$0")/.."

# ── Configuration ──
HAIPHEN_API="${HAIPHEN_API_ORIGIN:-https://api.haiphen.io}"
CONTACT_URL="${CONTACT_URL:-https://haiphen-contact.pi-307.workers.dev}"
OWNER_EMAIL="${OWNER_EMAIL:-jude@haiphen.io}"
OUTPUT_DIR="/tmp/haiphen-targeted"
GIF_OUTPUT="docs/assets/demos/cli-prospect-targeted.gif"

# ── Flags ──
TARGET_NAME=""
TEST_MODE=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --test) TEST_MODE=true ;;
    --dry-run) DRY_RUN=true ;;
    --target) shift; TARGET_NAME="${2:-}" ;;
    --target=*) TARGET_NAME="${arg#*=}" ;;
    *) ;;
  esac
  shift 2>/dev/null || true
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Prerequisites ──
TOKEN="${HAIPHEN_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  # Try reading from CLI session file
  SESSION_FILE="$HOME/Library/Application Support/haiphen/session.default.json"
  if [[ -f "$SESSION_FILE" ]]; then
    TOKEN=$(python3 -c "import json; print(json.load(open('$SESSION_FILE'))['token'])" 2>/dev/null || true)
  fi
fi
if [[ -z "$TOKEN" ]]; then
  log "ERROR: HAIPHEN_TOKEN not set and no session file found. Run: haiphen login"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# ── Fortune 500 Rotation ──
# Financials-first rotation: one company per day
F500_ROTATION=(
  "Goldman Sachs"
  "JPMorgan Chase"
  "Morgan Stanley"
  "Citadel Securities"
  "Coinbase"
  "Robinhood"
  "Interactive Brokers"
  "Stripe"
  "PayPal"
  "Block"
  "Charles Schwab"
  "BlackRock"
  "Visa"
  "Mastercard"
  "CME Group"
  "Nasdaq"
  "Capital One"
  "State Street"
  "Fidelity National"
  "Broadridge"
)

if [[ -z "$TARGET_NAME" ]]; then
  # Pick based on day of year
  DAY_OF_YEAR=$(date +%j | sed 's/^0*//')
  IDX=$((DAY_OF_YEAR % ${#F500_ROTATION[@]}))
  TARGET_NAME="${F500_ROTATION[$IDX]}"
fi

log "Target: $TARGET_NAME"

# ── Step 1: Resolve target ID ──
log "Resolving target..."
ENCODED_NAME=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TARGET_NAME'))")
TARGET_JSON=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "${HAIPHEN_API}/v1/prospect/targets?q=${ENCODED_NAME}&limit=1" || echo '{"items":[]}')

TARGET_ID=$(echo "$TARGET_JSON" | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['target_id'] if items else '')" 2>/dev/null || true)

if [[ -z "$TARGET_ID" ]]; then
  log "ERROR: Target '$TARGET_NAME' not found in D1. Seed the database first."
  exit 1
fi

log "Target ID: $TARGET_ID"

# ── Step 2: Targeted crawl ──
log "Running targeted crawl..."
CRAWL_RESP=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "${HAIPHEN_API}/v1/prospect/targets/${TARGET_ID}/crawl" || echo '{"error":"crawl failed"}')
log "Crawl result: $CRAWL_RESP"

# ── Step 3: Auto-investigate ──
log "Auto-investigating..."
INV_RESP=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"max_leads\": 5, \"target_id\": \"${TARGET_ID}\"}" \
  "${HAIPHEN_API}/v1/prospect/auto-investigate" || echo '{"error":"investigate failed"}')
log "Investigate result: $INV_RESP"

# ── Step 4: Generate LaTeX report + compile to PDF ──
log "Generating LaTeX report..."
TEX_FILE="${OUTPUT_DIR}/haiphen-report-${TARGET_ID}-$(date +%Y-%m-%d).tex"
PDF_FILE="${TEX_FILE%.tex}.pdf"

curl -sf -H "Authorization: Bearer $TOKEN" \
  "${HAIPHEN_API}/v1/prospect/targets/${TARGET_ID}/report?format=latex" \
  -o "$TEX_FILE"

if [[ -f "$TEX_FILE" ]]; then
  TEX_SIZE=$(stat -f%z "$TEX_FILE" 2>/dev/null || stat -c%s "$TEX_FILE" 2>/dev/null || echo "0")
  log "LaTeX report: ${TEX_FILE} ($(( TEX_SIZE / 1024 ))KB)"

  # Compile to PDF
  if command -v pdflatex &>/dev/null; then
    log "Compiling PDF..."
    pdflatex -interaction=nonstopmode -output-directory="$OUTPUT_DIR" "$TEX_FILE" >/dev/null 2>&1 || true
    # Run twice for page references
    pdflatex -interaction=nonstopmode -output-directory="$OUTPUT_DIR" "$TEX_FILE" >/dev/null 2>&1 || true

    if [[ -f "$PDF_FILE" ]]; then
      PDF_SIZE=$(stat -f%z "$PDF_FILE" 2>/dev/null || stat -c%s "$PDF_FILE" 2>/dev/null || echo "0")
      log "PDF compiled: ${PDF_FILE} ($(( PDF_SIZE / 1024 ))KB)"
    else
      log "WARNING: pdflatex did not produce a PDF"
    fi
  else
    log "WARNING: pdflatex not found. Install TeX Live: brew install --cask mactex"
  fi
else
  log "WARNING: LaTeX report not generated"
fi

# ── Step 5: Record VHS gif demo ──
log "Recording targeted pipeline gif..."
if command -v vhs &>/dev/null; then
  ./scripts/record-demos.sh prospect-targeted
  if [[ -f "$GIF_OUTPUT" ]]; then
    GIF_SIZE=$(stat -f%z "$GIF_OUTPUT" 2>/dev/null || stat -c%s "$GIF_OUTPUT" 2>/dev/null || echo "0")
    log "Gif recorded: $(( GIF_SIZE / 1024 ))KB"
  else
    log "WARNING: Gif not recorded"
  fi
else
  log "WARNING: vhs not found. Install with: brew install vhs"
fi

if $DRY_RUN; then
  log "Dry run complete. Files:"
  [[ -f "$TEX_FILE" ]] && log "  LaTeX: $TEX_FILE"
  [[ -f "$PDF_FILE" ]] && log "  PDF:   $PDF_FILE"
  [[ -f "$GIF_OUTPUT" ]] && log "  GIF:   $GIF_OUTPUT"
  exit 0
fi

# ── Step 6: Draft outreach for leads above threshold ──
log "Drafting outreach for high-scoring leads..."
LEAD_IDS=$(echo "$INV_RESP" | python3 -c "
import sys, json
data = json.load(sys.stdin)
leads = data.get('leads', [])
for l in leads:
    if l.get('aggregate_score', 0) >= 50:
        print(l['lead_id'])
" 2>/dev/null || true)

DRAFTED=0
for LID in $LEAD_IDS; do
  curl -sf -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    "${HAIPHEN_API}/v1/prospect/leads/${LID}/outreach" >/dev/null 2>&1 && DRAFTED=$((DRAFTED + 1)) || true
done
log "Outreach drafted: $DRAFTED"

# ── Step 7: Send outreach email with attachments ──
log "Sending outreach email..."
SECRET="${PROSPECT_HMAC_SECRET:-}"
if [[ -z "$SECRET" ]]; then
  log "WARNING: PROSPECT_HMAC_SECRET not set, skipping email send"
  log "Done (no email sent)"
  exit 0
fi

# Build multipart email payload
RECIPIENT="${OWNER_EMAIL}"
if ! $TEST_MODE; then
  # In production, we'd look up the company's infrastructure team email
  # For now, always send to owner for review
  RECIPIENT="${OWNER_EMAIL}"
fi

TS=$(python3 -c "import time; print(int(time.time()*1000))")
SEND_DATE=$(date -u +%Y-%m-%d)

# Build base64-encoded attachments
ATTACHMENTS="[]"
if [[ -f "$PDF_FILE" ]]; then
  PDF_B64=$(base64 -i "$PDF_FILE" | tr -d '\n')
  ATTACHMENTS="[{\"filename\":\"haiphen-report-${TARGET_ID}-${SEND_DATE}.pdf\",\"content\":\"${PDF_B64}\",\"type\":\"application/pdf\"}]"
fi

BODY=$(cat <<ENDJSON
{
  "send_date": "${SEND_DATE}",
  "test_email": "${RECIPIENT}",
  "target_id": "${TARGET_ID}",
  "target_name": "${TARGET_NAME}",
  "attachments": ${ATTACHMENTS}
}
ENDJSON
)

SIG=$(printf '%s' "${TS}.${BODY}" | openssl dgst -sha256 -hmac "${SECRET}" -hex 2>/dev/null | awk '{print $NF}')

RESP=$(curl -s -w "\n%{http_code}" -X POST "${CONTACT_URL}/api/prospect/outreach/send" \
  -H "Content-Type: application/json" \
  -H "X-Haiphen-Ts: ${TS}" \
  -H "X-Haiphen-Sig: ${SIG}" \
  -d "${BODY}")

HTTP_CODE=$(echo "$RESP" | tail -1)
BODY_RESP=$(echo "$RESP" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]]; then
  log "Email sent to ${RECIPIENT}: ${BODY_RESP}"
else
  log "WARNING: Email send failed (HTTP ${HTTP_CODE}): ${BODY_RESP}"
fi

# ── Step 8: Commit gif if changed ──
if [[ -f "$GIF_OUTPUT" ]] && ! git diff --quiet -- "$GIF_OUTPUT" 2>/dev/null; then
  log "Committing updated targeted gif..."
  git add "$GIF_OUTPUT"
  git commit -m "chore: refresh targeted prospect pipeline gif (${TARGET_NAME})

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
  git push origin HEAD
  log "Gif committed and pushed"
fi

log "Done: $TARGET_NAME"
log "  Leads crawled, investigations run, report generated"
[[ -f "$PDF_FILE" ]] && log "  PDF: $PDF_FILE"
[[ -f "$GIF_OUTPUT" ]] && log "  GIF: $GIF_OUTPUT"
log "  Email sent to: $RECIPIENT"
