#!/usr/bin/env bash
set -euo pipefail

# Send test emails using SendGrid dynamic templates.
#
# Usage:
#   export SENDGRID_API_KEY="SG.xxxxx"
#   ./scripts/test-daily-digest.sh                    # send daily digest only
#   ./scripts/test-daily-digest.sh --all              # send ALL 6 templates
#   ./scripts/test-daily-digest.sh --template purchase # send one by name
#   ./scripts/test-daily-digest.sh --to you@email.com # override recipient
#   ./scripts/test-daily-digest.sh --dry-run           # print payloads only
#
# Template names: digest, purchase, onboarding, trial, usage, subscription

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TPL_DIR="$REPO_ROOT/haiphen-contact/templates"

FROM_EMAIL="jude@haiphen.io"
FROM_NAME="Haiphen"
TO_EMAIL="jude@haiphen.io"
DRY_RUN=0
SEND_ALL=0
TEMPLATE_NAME=""

# Template registry: name -> template_id, data_file, subject
declare -A TPL_IDS=(
  [digest]="d-efaaa1771c9d477c850cb67db2753d47"
  [purchase]="d-0fedc516b07e431ca14ab19296a5f9e0"
  [onboarding]="d-69b112ac1d3a4c6ca96efc7449bdd54d"
  [trial]="d-3b24950902734a30b6255a5695b5634f"
  [usage]="d-88f4602240c34b938a8229a875b45e13"
  [subscription]="d-5d33c72cf8be4fcf90a6102f7c3f5cf9"
)

declare -A TPL_DATA=(
  [digest]="$TPL_DIR/daily-digest-test-data.json"
  [purchase]="$TPL_DIR/purchase-confirmation-test-data.json"
  [onboarding]="$TPL_DIR/service-onboarding-test-data.json"
  [trial]="$TPL_DIR/trial-expiring-test-data.json"
  [usage]="$TPL_DIR/usage-alert-test-data.json"
  [subscription]="$TPL_DIR/subscription-change-test-data.json"
)

declare -A TPL_SUBJECTS=(
  [digest]="Haiphen Daily — 2026-02-08 (test)"
  [purchase]="Purchase Confirmed (test)"
  [onboarding]="Your Service Is Ready (test)"
  [trial]="Trial Ending Soon (test)"
  [usage]="Usage Alert (test)"
  [subscription]="Subscription Updated (test)"
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) TO_EMAIL="$2"; shift 2;;
    --dry-run) DRY_RUN=1; shift;;
    --all) SEND_ALL=1; shift;;
    --template) TEMPLATE_NAME="$2"; shift 2;;
    -h|--help)
      echo "Usage: $0 [--all] [--template NAME] [--to EMAIL] [--dry-run]"
      echo "Templates: digest, purchase, onboarding, trial, usage, subscription"
      exit 0;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

[[ -n "${SENDGRID_API_KEY:-}" ]] || { echo "ERROR: export SENDGRID_API_KEY first" >&2; exit 1; }
command -v jq >/dev/null || { echo "ERROR: jq required" >&2; exit 1; }

send_template() {
  local name="$1"
  local template_id="${TPL_IDS[$name]}"
  local data_file="${TPL_DATA[$name]}"
  local subject="${TPL_SUBJECTS[$name]}"

  if [[ ! -f "$data_file" ]]; then
    echo "[$name] SKIP — data file not found: $data_file" >&2
    return 1
  fi

  local payload
  payload="$(jq -n \
    --arg template_id "$template_id" \
    --arg from_email "$FROM_EMAIL" \
    --arg from_name "$FROM_NAME" \
    --arg to_email "$TO_EMAIL" \
    --arg subject "$subject" \
    --slurpfile data "$data_file" \
    '{
      from: { email: $from_email, name: $from_name },
      template_id: $template_id,
      personalizations: [{
        to: [{ email: $to_email }],
        subject: $subject,
        dynamic_template_data: $data[0]
      }]
    }')"

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[$name] dry-run payload:"
    echo "$payload" | jq .
    return 0
  fi

  echo "[$name] sending template=$template_id to=$TO_EMAIL"

  local http_code
  http_code="$(curl -sS -o /tmp/sg-test-resp.json -w "%{http_code}" \
    -X POST "https://api.sendgrid.com/v3/mail/send" \
    -H "Authorization: Bearer $SENDGRID_API_KEY" \
    -H "Content-Type: application/json" \
    --data-binary "$payload")"

  if [[ "$http_code" == "202" ]]; then
    echo "[$name] accepted (202)"
  else
    echo "[$name] FAILED http=$http_code" >&2
    cat /tmp/sg-test-resp.json >&2 2>/dev/null || true
    return 1
  fi
}

# Determine which templates to send
if [[ "$SEND_ALL" == "1" ]]; then
  TEMPLATES=("digest" "purchase" "onboarding" "trial" "usage" "subscription")
elif [[ -n "$TEMPLATE_NAME" ]]; then
  if [[ -z "${TPL_IDS[$TEMPLATE_NAME]+x}" ]]; then
    echo "ERROR: unknown template '$TEMPLATE_NAME'. Use: digest, purchase, onboarding, trial, usage, subscription" >&2
    exit 1
  fi
  TEMPLATES=("$TEMPLATE_NAME")
else
  TEMPLATES=("digest")
fi

SENT=0
FAILED=0
for t in "${TEMPLATES[@]}"; do
  if send_template "$t"; then
    SENT=$((SENT + 1))
  else
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Done: $SENT sent, $FAILED failed (to=$TO_EMAIL)"
