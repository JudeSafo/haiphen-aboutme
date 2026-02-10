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
cp "$GCP_DIR/shared/types.ts"          "$SRC_DIR/shared/"
cp "$GCP_DIR/shared/firestore-d1.ts"   "$SRC_DIR/shared/"
cp "$GCP_DIR/shared/firestore-kv.ts"   "$SRC_DIR/shared/"

# Copy service business logic (all .ts except index.ts and __tests__)
echo "    Copying ${SERVICE} business logic..."
for f in "$SERVICE_SRC"/*.ts; do
  fname="$(basename "$f")"
  if [ "$fname" != "index.ts" ] && [ "$fname" != "*.ts" ]; then
    cp "$f" "$SRC_DIR/"
  fi
done

# Install deps if needed
if [ ! -d "$FUNC_DIR/node_modules" ]; then
  echo "    Installing dependencies..."
  (cd "$FUNC_DIR" && npm install --omit=dev 2>/dev/null)
fi

# Compile
echo "    Compiling TypeScript..."
(cd "$FUNC_DIR" && npx tsc)

echo "==> Built haiphen-${SERVICE} → ${FUNC_DIR}/dist/"
