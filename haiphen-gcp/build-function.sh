#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# build-function.sh — Assemble a Cloud Function from shared + service code
#
# Usage: ./build-function.sh <service>   e.g. ./build-function.sh secure
#
# Copies shared adapters + service business logic into the function directory,
# then compiles TypeScript. The resulting directory is ready for gcloud deploy.
# ---------------------------------------------------------------------------
set -euo pipefail

SERVICE="${1:?Usage: $0 <service>  (e.g. secure, network, graph, risk, causal, supply)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GCP_DIR="$ROOT/haiphen-gcp"
FUNC_DIR="$GCP_DIR/functions/haiphen-${SERVICE}"
SRC_DIR="$FUNC_DIR/src"
SERVICE_SRC="$ROOT/haiphen-${SERVICE}/src"

echo "==> Building haiphen-${SERVICE} Cloud Function"

# Ensure function directory exists
mkdir -p "$SRC_DIR/shared"

# Copy shared adapters
echo "    Copying shared adapters..."
cp "$GCP_DIR/shared/types.ts"                  "$SRC_DIR/shared/"
cp "$GCP_DIR/shared/firestore-d1.ts"           "$SRC_DIR/shared/"
cp "$GCP_DIR/shared/firestore-kv.ts"           "$SRC_DIR/shared/"
# Copy DO replacement adapters (used by api, checkout)
for f in "$GCP_DIR/shared"/firestore-rate-limiter.ts "$GCP_DIR/shared"/firestore-quota.ts "$GCP_DIR/shared"/firestore-status-do.ts; do
  [ -f "$f" ] && cp "$f" "$SRC_DIR/shared/"
done

# Copy service source
if [ "$SERVICE" = "auth" ]; then
  # Auth worker is JavaScript — copy into src/worker/ for dynamic import
  echo "    Copying auth worker JS source..."
  mkdir -p "$SRC_DIR/worker"
  cp "$SERVICE_SRC/index.js" "$SRC_DIR/worker/"

elif [ "$SERVICE" = "api" ] || [ "$SERVICE" = "checkout" ]; then
  # Core TS workers — bundled to CJS via esbuild (avoids CF type conflicts)
  echo "    Bundling ${SERVICE} worker with esbuild..."
  mkdir -p "$FUNC_DIR/dist/worker"
  npx esbuild "$SERVICE_SRC/index.ts" --bundle --platform=node --format=cjs \
    --outfile="$FUNC_DIR/dist/worker/index.js"

else
  # Scaffold services — copy business logic TS (all .ts except index.ts and __tests__)
  echo "    Copying ${SERVICE} business logic..."
  for f in "$SERVICE_SRC"/*.ts; do
    fname="$(basename "$f")"
    if [ "$fname" != "index.ts" ] && [ "$fname" != "*.ts" ]; then
      cp "$f" "$SRC_DIR/"
    fi
  done
fi

# Install deps if needed
if [ ! -d "$FUNC_DIR/node_modules" ]; then
  echo "    Installing dependencies..."
  (cd "$FUNC_DIR" && npm install --omit=dev 2>/dev/null)
fi

# Compile Cloud Function wrapper
echo "    Compiling TypeScript..."
(cd "$FUNC_DIR" && npx tsc)

# Copy non-TS worker files that tsc doesn't process (e.g. auth's JS source)
if [ "$SERVICE" = "auth" ]; then
  echo "    Copying JS worker files to dist/worker/ (as .mjs for ESM)..."
  mkdir -p "$FUNC_DIR/dist/worker"
  cp "$SRC_DIR/worker/index.js" "$FUNC_DIR/dist/worker/index.mjs"
fi

echo "==> Built haiphen-${SERVICE} → ${FUNC_DIR}/dist/"
