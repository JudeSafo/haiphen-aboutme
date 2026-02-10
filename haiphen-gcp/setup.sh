#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Haiphen GCP Free-Tier Failover — One-Time Project Setup
#
# Prerequisites:
#   - gcloud CLI installed & authenticated (`gcloud auth login`)
#   - A billing account linked (free tier still needs billing enabled)
#   - The following env vars exported (or you'll be prompted):
#       JWT_SECRET, INTERNAL_TOKEN, API_KEY_PEPPER,
#       STRIPE_SECRET_KEY, SENDGRID_API_KEY, ADMIN_TOKEN
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-haiphen-failover}"
REGION="us-central1"  # required for free-tier Firestore & Cloud Functions

echo "==> Creating GCP project: $PROJECT_ID"
gcloud projects create "$PROJECT_ID" --name="Haiphen Failover" 2>/dev/null || echo "    (project already exists)"
gcloud config set project "$PROJECT_ID"

# ---------------------------------------------------------------------------
# 1. Enable required APIs
# ---------------------------------------------------------------------------
echo "==> Enabling APIs..."
gcloud services enable \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  firestore.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# ---------------------------------------------------------------------------
# 2. Create Firestore database (Native mode, us-central1 for free tier)
# ---------------------------------------------------------------------------
echo "==> Creating Firestore database..."
gcloud firestore databases create --location="$REGION" 2>/dev/null || echo "    (Firestore already exists)"

# ---------------------------------------------------------------------------
# 3. Store shared secrets in Secret Manager
# ---------------------------------------------------------------------------
echo "==> Storing secrets in Secret Manager..."

store_secret() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "    WARNING: $name is empty — skipping. Set it later with:"
    echo "      echo -n 'VALUE' | gcloud secrets create $name --data-file=-"
    return
  fi
  # Create or add a new version
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=-
    echo "    $name: added new version"
  else
    echo -n "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic
    echo "    $name: created"
  fi
}

store_secret "JWT_SECRET"       "${JWT_SECRET:-}"
store_secret "INTERNAL_TOKEN"   "${INTERNAL_TOKEN:-}"
store_secret "API_KEY_PEPPER"   "${API_KEY_PEPPER:-}"
store_secret "STRIPE_SECRET_KEY" "${STRIPE_SECRET_KEY:-}"
store_secret "SENDGRID_API_KEY" "${SENDGRID_API_KEY:-}"
store_secret "ADMIN_TOKEN"      "${ADMIN_TOKEN:-}"

# ---------------------------------------------------------------------------
# 4. Create a service account for Cloud Functions / Cloud Run
# ---------------------------------------------------------------------------
SA_NAME="haiphen-worker"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "==> Creating service account: $SA_NAME"
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Haiphen Worker SA" 2>/dev/null || echo "    (already exists)"

# Grant Firestore access
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/datastore.user" \
  --condition=None --quiet

# Grant Secret Manager access
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None --quiet

echo "    SA: $SA_EMAIL"

# ---------------------------------------------------------------------------
# 5. Create Cloud Scheduler job for D1→Firestore sync
# ---------------------------------------------------------------------------
echo "==> Creating Cloud Scheduler job (d1-firestore-sync)..."
# This targets the sync Cloud Function — will be created after deploy.
# For now, create a placeholder; update the URI after deploying the function.
gcloud scheduler jobs create http "d1-firestore-sync" \
  --location="$REGION" \
  --schedule="0 2 * * *" \
  --uri="https://$REGION-$PROJECT_ID.cloudfunctions.net/haiphen-sync" \
  --http-method=POST \
  --oidc-service-account-email="$SA_EMAIL" \
  --oidc-token-audience="https://$REGION-$PROJECT_ID.cloudfunctions.net/haiphen-sync" \
  --time-zone="UTC" \
  --description="Daily D1→Firestore sync (2am UTC)" \
  2>/dev/null || echo "    (job already exists — update URI after function deploy)"

# ---------------------------------------------------------------------------
# 6. Print summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
echo "  GCP Project Setup Complete"
echo "============================================"
echo "  Project:    $PROJECT_ID"
echo "  Region:     $REGION"
echo "  Firestore:  Native mode (us-central1)"
echo "  SA:         $SA_EMAIL"
echo "  Scheduler:  d1-firestore-sync (daily 2am UTC)"
echo ""
echo "  Next steps:"
echo "    1. Deploy haiphen-sync Cloud Function"
echo "    2. Deploy scaffold service Cloud Functions"
echo "    3. Register GCP URLs in watchdog:"
echo "       curl -X POST https://watchdog.haiphen.io/v1/watchdog/gcp-url \\"
echo "         -H 'Authorization: Bearer \$ADMIN_TOKEN' \\"
echo "         -d '{\"worker\":\"haiphen-secure\",\"url\":\"haiphen-secure-xxx.run.app\"}'"
echo ""
