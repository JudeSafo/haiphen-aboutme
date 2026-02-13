#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# teardown.sh — Shut down all Haiphen GCP services to eliminate costs
#
# Deletes:
#   - 10 Cloud Functions (gen2)
#   - 1 stale Cloud Run service (haiphen-auth, from earlier failed deploy)
#   - Artifact Registry images matching haiphen-* in gcf-artifacts
#   - 9 WATCHDOG_KV entries (gcp:haiphen-*)
#
# Preserves:
#   - GKE cluster (unrelated), Firestore data, Secret Manager secrets,
#     Cloud Scheduler job (all free/pennies)
#
# Usage:
#   ./teardown.sh              # Execute teardown
#   ./teardown.sh --dry-run    # Preview without deleting anything
# ---------------------------------------------------------------------------
set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT_ID="united-lane-361102"
REGION="us-central1"
CF_ACCOUNT_ID="307a5117867a624064b8ec44fb1bac76"
WATCHDOG_KV_ID="00fe28f01adf415c811a42e5248d7b6b"

# Cloud Functions to delete (gen2)
FUNCTIONS=(
  haiphen-secure
  haiphen-network
  haiphen-graph
  haiphen-risk
  haiphen-causal
  haiphen-supply
  haiphen-auth-fn
  haiphen-api
  haiphen-checkout
  haiphen-sync
)

# Stale Cloud Run services to delete
STALE_CLOUD_RUN=(
  haiphen-auth
)

# WATCHDOG_KV keys to clear (worker names used by the watchdog)
KV_WORKERS=(
  haiphen-api
  haiphen-secure
  haiphen-network
  haiphen-graph
  haiphen-risk
  haiphen-causal
  haiphen-supply
  haiphen-auth
  haiphen-checkout
)

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown flag: $arg"; echo "Usage: $0 [--dry-run]"; exit 1 ;;
  esac
done

if $DRY_RUN; then
  echo "=== DRY RUN — no resources will be deleted ==="
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
# 1. Delete Cloud Functions (gen2)
# ---------------------------------------------------------------------------
echo "==> Deleting ${#FUNCTIONS[@]} Cloud Functions..."
for fn in "${FUNCTIONS[@]}"; do
  echo "    $fn"
  run gcloud functions delete "$fn" \
    --gen2 --region="$REGION" --project="$PROJECT_ID" --quiet 2>/dev/null || \
    echo "    (already deleted or not found)"
done

# ---------------------------------------------------------------------------
# 2. Delete stale Cloud Run services
# ---------------------------------------------------------------------------
echo ""
echo "==> Deleting ${#STALE_CLOUD_RUN[@]} stale Cloud Run service(s)..."
for svc in "${STALE_CLOUD_RUN[@]}"; do
  echo "    $svc"
  run gcloud run services delete "$svc" \
    --region="$REGION" --project="$PROJECT_ID" --quiet 2>/dev/null || \
    echo "    (already deleted or not found)"
done

# ---------------------------------------------------------------------------
# 3. Clean up Artifact Registry images
# ---------------------------------------------------------------------------
echo ""
echo "==> Cleaning Artifact Registry (gcf-artifacts repo)..."
REPO="$REGION-docker.pkg.dev/$PROJECT_ID/gcf-artifacts"

if $DRY_RUN; then
  echo "  [dry-run] Would list and delete haiphen-* images from $REPO"
else
  # List all haiphen-* image repos in gcf-artifacts
  IMAGES=$(gcloud artifacts docker images list "$REPO" \
    --project="$PROJECT_ID" --format='value(IMAGE)' 2>/dev/null | \
    grep 'haiphen' | sort -u || true)

  if [ -n "$IMAGES" ]; then
    while IFS= read -r image; do
      echo "    Deleting image: $image"
      gcloud artifacts docker images delete "$image" \
        --project="$PROJECT_ID" --quiet --delete-tags 2>/dev/null || \
        echo "    (failed to delete $image)"
    done <<< "$IMAGES"
  else
    echo "    No haiphen-* images found"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Clear WATCHDOG_KV entries
# ---------------------------------------------------------------------------
echo ""
echo "==> Clearing ${#KV_WORKERS[@]} WATCHDOG_KV entries..."

if [ -z "${CF_API_TOKEN:-}" ]; then
  echo "    WARNING: CF_API_TOKEN not set — skipping KV cleanup"
  echo "    Export CF_API_TOKEN and re-run, or manually delete keys:"
  for w in "${KV_WORKERS[@]}"; do
    echo "      key: gcp:$w"
  done
else
  for w in "${KV_WORKERS[@]}"; do
    KEY="gcp:$w"
    echo "    Deleting key: $KEY"
    if $DRY_RUN; then
      echo "  [dry-run] DELETE $KEY from WATCHDOG_KV"
    else
      curl -s -X DELETE \
        "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/storage/kv/namespaces/$WATCHDOG_KV_ID/values/$KEY" \
        -H "Authorization: Bearer $CF_API_TOKEN" > /dev/null 2>&1 || \
        echo "    (key not found or already deleted)"
    fi
  done
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
if $DRY_RUN; then
  echo "  DRY RUN COMPLETE — nothing was deleted"
else
  echo "  TEARDOWN COMPLETE"
fi
echo "============================================"
echo "  Cloud Functions deleted: ${#FUNCTIONS[@]}"
echo "  Cloud Run services deleted: ${#STALE_CLOUD_RUN[@]}"
echo "  Artifact images cleaned: gcf-artifacts/haiphen-*"
echo "  KV keys cleared: ${#KV_WORKERS[@]}"
echo ""
echo "  Preserved:"
echo "    - Firestore data (free)"
echo "    - Secret Manager secrets (free at low volume)"
echo "    - Cloud Scheduler job (free tier)"
echo "    - GKE cluster realtime-data (unrelated)"
echo ""
if ! $DRY_RUN; then
  echo "  Verify: gcloud functions list --project=$PROJECT_ID --region=$REGION"
  echo "  Re-deploy: ./standup.sh"
fi
