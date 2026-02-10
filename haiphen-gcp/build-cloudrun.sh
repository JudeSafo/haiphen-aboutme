#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# build-cloudrun.sh — Assemble a Cloud Run service from shared + worker code
#
# Usage: ./build-cloudrun.sh <service>   e.g. ./build-cloudrun.sh api
#
# Copies shared Firestore adapters and the original CF Worker source into the
# Cloud Run project, installs dependencies, and compiles TypeScript.
# ---------------------------------------------------------------------------
set -euo pipefail

SERVICE="${1:?Usage: $0 <service>  (e.g. api, auth, checkout)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GCP_DIR="$ROOT/haiphen-gcp"
CR_DIR="$GCP_DIR/cloudrun/haiphen-${SERVICE}"
SRC_DIR="$CR_DIR/src"
SERVICE_SRC="$ROOT/haiphen-${SERVICE}/src"

echo "==> Building haiphen-${SERVICE} Cloud Run service"

# Ensure directories exist
mkdir -p "$SRC_DIR/shared" "$SRC_DIR/worker"

# Copy shared adapters
echo "    Copying shared Firestore adapters..."
cp "$GCP_DIR/shared/types.ts"                "$SRC_DIR/shared/"
cp "$GCP_DIR/shared/firestore-d1.ts"         "$SRC_DIR/shared/"
cp "$GCP_DIR/shared/firestore-kv.ts"         "$SRC_DIR/shared/"
cp "$GCP_DIR/shared/firestore-rate-limiter.ts" "$SRC_DIR/shared/"
cp "$GCP_DIR/shared/firestore-quota.ts"      "$SRC_DIR/shared/"
cp "$GCP_DIR/shared/firestore-status-do.ts"  "$SRC_DIR/shared/"

# Copy worker source into src/worker/
echo "    Copying haiphen-${SERVICE} worker source..."
if [ "$SERVICE" = "auth" ]; then
  # Auth is JavaScript — copy as-is
  for f in "$SERVICE_SRC"/*.js; do
    [ -f "$f" ] && cp "$f" "$SRC_DIR/worker/"
  done
else
  # TypeScript services — copy all .ts (including index.ts)
  for f in "$SERVICE_SRC"/*.ts; do
    [ -f "$f" ] && cp "$f" "$SRC_DIR/worker/"
  done
fi

# Always overwrite globals.d.ts with the comprehensive CF type shims
echo "    Writing CF Worker type shims..."
cp "$GCP_DIR/shared/cf-globals.d.ts" "$SRC_DIR/worker/globals.d.ts"

# Install dependencies
if [ ! -d "$CR_DIR/node_modules" ]; then
  echo "    Installing dependencies..."
  (cd "$CR_DIR" && npm install 2>/dev/null)
fi

# Compile
echo "    Compiling TypeScript..."
(cd "$CR_DIR" && npx tsc)

echo "==> Built haiphen-${SERVICE} Cloud Run → ${CR_DIR}/dist/"
