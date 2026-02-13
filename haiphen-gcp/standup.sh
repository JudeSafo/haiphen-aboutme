#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# standup.sh — Rebuild and redeploy all Haiphen GCP failover services
#
# Inverse of teardown.sh. Deploys:
#   - 6 scaffold Cloud Functions (secure, network, graph, risk, causal, supply)
#   - 3 core Cloud Functions (auth-fn, api, checkout)
#   - 1 sync Cloud Function
#   - Registers all 9 service URLs with the watchdog WATCHDOG_KV
#
# Usage:
#   ./standup.sh                    # Full build + deploy
#   ./standup.sh --dry-run          # Preview commands without executing
#   ./standup.sh --skip-build       # Deploy only (assumes prior build)
#   ./standup.sh --dry-run --skip-build
# ---------------------------------------------------------------------------
set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT_ID="united-lane-361102"
REGION="us-central1"
CF_ACCOUNT_ID="307a5117867a624064b8ec44fb1bac76"
WATCHDOG_KV_ID="00fe28f01adf415c811a42e5248d7b6b"
WATCHDOG_URL="https://haiphen-watchdog.pi-307.workers.dev"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GCP_DIR="$ROOT/haiphen-gcp"

SCAFFOLD_SERVICES=(secure network graph risk causal supply)
CORE_SERVICES=(auth api checkout)

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
DRY_RUN=false
SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --skip-build) SKIP_BUILD=true ;;
    *) echo "Unknown flag: $arg"; echo "Usage: $0 [--dry-run] [--skip-build]"; exit 1 ;;
  esac
done

if $DRY_RUN; then
  echo "=== DRY RUN — no commands will be executed ==="
  echo ""
fi

run() {
  if $DRY_RUN; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

# ---------------------------------------------------------------------------
# Phase 1: Build
# ---------------------------------------------------------------------------
if $SKIP_BUILD; then
  echo "==> Skipping build phase (--skip-build)"
else
  echo "==> Phase 1: Building all services..."
  echo ""

  for svc in "${SCAFFOLD_SERVICES[@]}" "${CORE_SERVICES[@]}"; do
    echo "    Building haiphen-$svc..."
    if $DRY_RUN; then
      echo "  [dry-run] $GCP_DIR/build-function.sh $svc"
    else
      "$GCP_DIR/build-function.sh" "$svc"
    fi
  done

  echo ""
  echo "    All builds complete."
fi

# ---------------------------------------------------------------------------
# Phase 2: Deploy Cloud Functions
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 2: Deploying Cloud Functions..."
echo ""

# 2a. Deploy 6 scaffold services
echo "--- Scaffold services (${#SCAFFOLD_SERVICES[@]}) ---"
for svc in "${SCAFFOLD_SERVICES[@]}"; do
  echo "    Deploying haiphen-$svc..."
  run gcloud functions deploy "haiphen-$svc" \
    --gen2 --runtime=nodejs20 --region="$REGION" \
    --project="$PROJECT_ID" \
    --source="$GCP_DIR/functions/haiphen-$svc" \
    --entry-point=handler \
    --trigger-http --allow-unauthenticated \
    --memory=256Mi --timeout=30s \
    --set-secrets="JWT_SECRET=HAIPHEN_JWT_SECRET:latest,INTERNAL_TOKEN=HAIPHEN_INTERNAL_TOKEN:latest"
done

# 2b. Deploy haiphen-auth-fn
echo ""
echo "--- Core: haiphen-auth-fn ---"
run gcloud functions deploy haiphen-auth-fn \
  --gen2 --runtime=nodejs20 --region="$REGION" \
  --project="$PROJECT_ID" \
  --source="$GCP_DIR/functions/haiphen-auth" \
  --entry-point=handler \
  --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=30s \
  --set-secrets="JWT_SECRET=HAIPHEN_JWT_SECRET:latest,SENDGRID_API_KEY=HAIPHEN_SENDGRID_API_KEY:latest,GITHUB_CLIENT_ID=HAIPHEN_GITHUB_CLIENT_ID:latest,GITHUB_CLIENT_SECRET=HAIPHEN_GITHUB_CLIENT_SECRET:latest,GOOGLE_CLIENT_ID=HAIPHEN_GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=HAIPHEN_GOOGLE_CLIENT_SECRET:latest"

# 2c. Deploy haiphen-api
echo ""
echo "--- Core: haiphen-api ---"
run gcloud functions deploy haiphen-api \
  --gen2 --runtime=nodejs20 --region="$REGION" \
  --project="$PROJECT_ID" \
  --source="$GCP_DIR/functions/haiphen-api" \
  --entry-point=handler \
  --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=30s \
  --set-secrets="JWT_SECRET=HAIPHEN_JWT_SECRET:latest,API_KEY_PEPPER=HAIPHEN_API_KEY_PEPPER:latest,ADMIN_TOKEN=HAIPHEN_ADMIN_TOKEN:latest,INTERNAL_TOKEN=HAIPHEN_INTERNAL_TOKEN:latest"

# 2d. Deploy haiphen-checkout
echo ""
echo "--- Core: haiphen-checkout ---"
run gcloud functions deploy haiphen-checkout \
  --gen2 --runtime=nodejs20 --region="$REGION" \
  --project="$PROJECT_ID" \
  --source="$GCP_DIR/functions/haiphen-checkout" \
  --entry-point=handler \
  --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=30s \
  --set-secrets="JWT_SECRET=HAIPHEN_JWT_SECRET:latest,STRIPE_SECRET_KEY=HAIPHEN_STRIPE_SECRET_KEY:latest"

# 2e. Deploy haiphen-sync
echo ""
echo "--- Sync: haiphen-sync ---"
run gcloud functions deploy haiphen-sync \
  --gen2 --runtime=nodejs20 --region="$REGION" \
  --project="$PROJECT_ID" \
  --source="$GCP_DIR/functions/haiphen-sync" \
  --entry-point=handler \
  --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=60s \
  --set-env-vars="CF_ACCOUNT_ID=$CF_ACCOUNT_ID,CF_D1_DATABASE_ID=9a26fb67-b6e5-4d5f-8e62-3ecfde5ee8c2" \
  --set-secrets="CF_API_TOKEN=HAIPHEN_CF_API_TOKEN:latest"

echo ""
echo "    All ${#SCAFFOLD_SERVICES[@]} scaffold + 3 core + 1 sync = 10 functions deployed."

# ---------------------------------------------------------------------------
# Phase 3: Register GCP URLs with Watchdog
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 3: Registering GCP URLs with watchdog..."

if [ -z "${ADMIN_TOKEN:-}" ]; then
  echo "    WARNING: ADMIN_TOKEN not set — skipping watchdog registration"
  echo "    Export ADMIN_TOKEN and re-run, or register manually."
else
  # Map of gcloud function name → watchdog worker name
  # auth-fn maps to haiphen-auth in the watchdog
  DEPLOY_NAMES=(secure network graph risk causal supply auth-fn api checkout)

  for fn in "${DEPLOY_NAMES[@]}"; do
    # Get the Cloud Run URI backing this function
    if $DRY_RUN; then
      echo "  [dry-run] gcloud functions describe haiphen-$fn --gen2 --region=$REGION --format=value(serviceConfig.uri)"
      URI="https://haiphen-$fn-xxxxx-uc.a.run.app"
    else
      URI=$(gcloud functions describe "haiphen-$fn" \
        --gen2 --region="$REGION" --project="$PROJECT_ID" \
        --format='value(serviceConfig.uri)' 2>/dev/null) || {
        echo "    WARNING: Could not get URI for haiphen-$fn — skipping"
        continue
      }
    fi

    HOSTNAME="${URI#https://}"

    # Map auth-fn → haiphen-auth for watchdog worker name
    WORKER="haiphen-${fn/auth-fn/auth}"

    echo "    $WORKER → $HOSTNAME"
    run curl -s -X POST \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      "$WATCHDOG_URL/v1/watchdog/gcp-url" \
      -d "{\"worker\":\"$WORKER\",\"url\":\"$HOSTNAME\"}"
  done
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
if $DRY_RUN; then
  echo "  DRY RUN COMPLETE — nothing was deployed"
else
  echo "  STANDUP COMPLETE"
fi
echo "============================================"
echo "  Cloud Functions deployed: 10"
echo "    Scaffold: ${SCAFFOLD_SERVICES[*]}"
echo "    Core:     auth-fn, api, checkout"
echo "    Sync:     sync"
echo "  Watchdog KV entries registered: 9"
echo ""
if ! $DRY_RUN; then
  echo "  Verify functions:"
  echo "    gcloud functions list --project=$PROJECT_ID --region=$REGION"
  echo ""
  echo "  Test health endpoints:"
  echo "    for svc in secure network graph risk causal supply api; do"
  echo "      URI=\$(gcloud functions describe haiphen-\$svc --gen2 --region=$REGION --project=$PROJECT_ID --format='value(serviceConfig.uri)')"
  echo "      echo \"\$svc: \$(curl -s \$URI/v1/health)\""
  echo "    done"
  echo ""
  echo "  Teardown later: ./teardown.sh"
fi
