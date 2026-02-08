#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Pushes local HTML templates to existing SendGrid dynamic
# templates as new active versions.
#
# This updates the email HTML (e.g. branded headers) without
# changing the template IDs used by the worker.
#
# Usage:
#   export SENDGRID_API_KEY="SG.xxxxx"
#   ./scripts/update-sendgrid-templates.sh           # update all 6
#   ./scripts/update-sendgrid-templates.sh --dry-run  # show what would be pushed
#   ./scripts/update-sendgrid-templates.sh --template purchase  # update one
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TPL_DIR="$REPO_ROOT/haiphen-contact/templates"
API="https://api.sendgrid.com/v3"

DRY_RUN=0
SINGLE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift;;
    --template) SINGLE="$2"; shift 2;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--template NAME]"
      echo "Templates: digest, purchase, onboarding, trial, usage, subscription"
      exit 0;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

[[ -n "${SENDGRID_API_KEY:-}" ]] || { echo "ERROR: export SENDGRID_API_KEY first" >&2; exit 1; }
command -v python3 >/dev/null || { echo "ERROR: python3 required for JSON escaping" >&2; exit 1; }

# Template registry: name -> template_id, html_file, subject_line
declare -A TPL_IDS=(
  [digest]="d-efaaa1771c9d477c850cb67db2753d47"
  [purchase]="d-0fedc516b07e431ca14ab19296a5f9e0"
  [onboarding]="d-69b112ac1d3a4c6ca96efc7449bdd54d"
  [trial]="d-3b24950902734a30b6255a5695b5634f"
  [usage]="d-88f4602240c34b938a8229a875b45e13"
  [subscription]="d-5d33c72cf8be4fcf90a6102f7c3f5cf9"
)

declare -A TPL_FILES=(
  [digest]="$TPL_DIR/daily-digest.html"
  [purchase]="$TPL_DIR/purchase-confirmation.html"
  [onboarding]="$TPL_DIR/service-onboarding.html"
  [trial]="$TPL_DIR/trial-expiring.html"
  [usage]="$TPL_DIR/usage-alert.html"
  [subscription]="$TPL_DIR/subscription-change.html"
)

declare -A TPL_SUBJECTS=(
  [digest]="Haiphen Daily — {{date_label}}"
  [purchase]="Haiphen — purchase confirmation for {{service_name}}"
  [onboarding]="Haiphen — your {{service_name}} service is ready"
  [trial]="Haiphen — your {{service_name}} trial expires in {{days_remaining}} day(s)"
  [usage]="Haiphen — {{service_name}} usage at {{usage_pct}}%"
  [subscription]="Haiphen — subscription updated"
)

ALL_NAMES=("digest" "purchase" "onboarding" "trial" "usage" "subscription")

update_template() {
  local name="$1"
  local template_id="${TPL_IDS[$name]}"
  local html_file="${TPL_FILES[$name]}"
  local subject="${TPL_SUBJECTS[$name]}"

  if [[ ! -f "$html_file" ]]; then
    echo "[$name] SKIP — HTML file not found: $html_file" >&2
    return 1
  fi

  local char_count
  char_count=$(wc -c < "$html_file" | tr -d ' ')
  echo "[$name] template=$template_id  file=$html_file (${char_count} bytes)"

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[$name] dry-run — would push ${char_count} bytes to SendGrid"
    return 0
  fi

  # JSON-escape the HTML content
  local html_escaped
  html_escaped=$(python3 -c "
import json, sys
with open('${html_file}', 'r') as f:
    print(json.dumps(f.read()))
")

  # Create a new active version (SendGrid keeps version history)
  local version_name
  version_name="v-$(date +%Y%m%d-%H%M%S)"

  local resp
  resp=$(curl -sS -w "\n%{http_code}" \
    -X POST "$API/templates/${template_id}/versions" \
    -H "Authorization: Bearer $SENDGRID_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"template_id\": \"${template_id}\",
      \"active\": 1,
      \"name\": \"${version_name}\",
      \"subject\": \"${subject}\",
      \"html_content\": ${html_escaped},
      \"editor\": \"code\"
    }")

  local http_code
  http_code=$(echo "$resp" | tail -1)
  local body
  body=$(echo "$resp" | sed '$d')

  if [[ "$http_code" == "201" || "$http_code" == "200" ]]; then
    local version_id
    version_id=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','?'))" 2>/dev/null || echo "?")
    echo "[$name] OK — version=${version_name} id=${version_id} (active)"
  else
    echo "[$name] FAILED http=$http_code" >&2
    echo "$body" >&2
    return 1
  fi
}

# Determine which templates to update
if [[ -n "$SINGLE" ]]; then
  if [[ -z "${TPL_IDS[$SINGLE]+x}" ]]; then
    echo "ERROR: unknown template '$SINGLE'. Use: ${ALL_NAMES[*]}" >&2
    exit 1
  fi
  TARGETS=("$SINGLE")
else
  TARGETS=("${ALL_NAMES[@]}")
fi

echo ""
echo "Pushing local HTML templates to SendGrid..."
echo "============================================="
echo ""

UPDATED=0
FAILED=0
for t in "${TARGETS[@]}"; do
  if update_template "$t"; then
    UPDATED=$((UPDATED + 1))
  else
    FAILED=$((FAILED + 1))
  fi
  echo ""
done

echo "============================================="
echo "Done: $UPDATED updated, $FAILED failed"
echo ""
if [[ "$DRY_RUN" == "0" && "$UPDATED" -gt 0 ]]; then
  echo "Test with:"
  echo "  ./scripts/test-daily-digest.sh --all"
  echo ""
fi
