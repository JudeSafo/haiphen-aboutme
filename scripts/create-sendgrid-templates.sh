#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Creates 5 SendGrid dynamic templates from local HTML files
# and prints the template IDs for use as Wrangler secrets.
#
# Usage:
#   export SENDGRID_API_KEY="SG.xxxxx"
#   bash scripts/create-sendgrid-templates.sh
# ─────────────────────────────────────────────────────────────

if [ -z "${SENDGRID_API_KEY:-}" ]; then
  echo "ERROR: SENDGRID_API_KEY is not set." >&2
  exit 1
fi

API="https://api.sendgrid.com/v3"
TEMPLATE_DIR="haiphen-contact/templates"

# Map: env_var_name  display_name  filename  subject_line
TEMPLATES=(
  "PURCHASE_TEMPLATE_ID|Haiphen - Purchase Confirmation|purchase-confirmation.html|Haiphen — purchase confirmation for {{service_name}}"
  "ONBOARDING_TEMPLATE_ID|Haiphen - Service Onboarding|service-onboarding.html|Haiphen — your {{service_name}} service is ready"
  "TRIAL_EXPIRING_TEMPLATE_ID|Haiphen - Trial Expiring|trial-expiring.html|Haiphen — your {{service_name}} trial expires in {{days_remaining}} day(s)"
  "USAGE_ALERT_TEMPLATE_ID|Haiphen - Usage Alert|usage-alert.html|Haiphen — {{service_name}} usage at {{usage_pct}}%"
  "SUBSCRIPTION_CHANGE_TEMPLATE_ID|Haiphen - Subscription Change|subscription-change.html|Haiphen — subscription updated"
)

echo ""
echo "Creating SendGrid dynamic templates..."
echo "======================================="
echo ""

declare -A RESULT_IDS

for entry in "${TEMPLATES[@]}"; do
  IFS='|' read -r env_var display_name filename subject_line <<< "$entry"

  html_file="${TEMPLATE_DIR}/${filename}"
  if [ ! -f "$html_file" ]; then
    echo "SKIP: ${html_file} not found" >&2
    continue
  fi

  echo "→ Creating template: ${display_name}"

  # Step 1: Create the template
  create_resp=$(curl -sS "$API/templates" \
    -X POST \
    -H "Authorization: Bearer $SENDGRID_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${display_name}\",
      \"generation\": \"dynamic\"
    }")

  template_id=$(echo "$create_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)

  if [ -z "$template_id" ]; then
    echo "  ERROR creating template. Response:" >&2
    echo "  $create_resp" >&2
    echo ""
    continue
  fi

  echo "  Template ID: ${template_id}"

  # Step 2: Create an active version with the HTML content
  # Read HTML and JSON-escape it
  html_content=$(python3 -c "
import json, sys
with open('${html_file}', 'r') as f:
    print(json.dumps(f.read()))
")

  version_resp=$(curl -sS "$API/templates/${template_id}/versions" \
    -X POST \
    -H "Authorization: Bearer $SENDGRID_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"template_id\": \"${template_id}\",
      \"active\": 1,
      \"name\": \"v1\",
      \"subject\": \"${subject_line}\",
      \"html_content\": ${html_content},
      \"editor\": \"code\"
    }")

  version_id=$(echo "$version_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)

  if [ -z "$version_id" ]; then
    echo "  WARNING: Version creation may have failed. Response:" >&2
    echo "  $version_resp" >&2
  else
    echo "  Version ID: ${version_id} (active)"
  fi

  RESULT_IDS["$env_var"]="$template_id"
  echo ""
done

echo "======================================="
echo "DONE. Set these as Wrangler secrets on haiphen-contact:"
echo ""
for env_var in PURCHASE_TEMPLATE_ID ONBOARDING_TEMPLATE_ID TRIAL_EXPIRING_TEMPLATE_ID USAGE_ALERT_TEMPLATE_ID SUBSCRIPTION_CHANGE_TEMPLATE_ID; do
  tid="${RESULT_IDS[$env_var]:-NOT_CREATED}"
  echo "  ${env_var}=${tid}"
done
echo ""
echo "To set them:"
echo "  cd haiphen-contact"
for env_var in PURCHASE_TEMPLATE_ID ONBOARDING_TEMPLATE_ID TRIAL_EXPIRING_TEMPLATE_ID USAGE_ALERT_TEMPLATE_ID SUBSCRIPTION_CHANGE_TEMPLATE_ID; do
  tid="${RESULT_IDS[$env_var]:-NOT_CREATED}"
  echo "  npx wrangler secret put ${env_var}  # paste: ${tid}"
done
echo ""
