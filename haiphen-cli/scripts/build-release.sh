#!/usr/bin/env bash
set -euo pipefail

# Build cross-platform release binaries for haiphen CLI.
# Usage: ./scripts/build-release.sh [version]
#   version  defaults to git describe or "dev"

cd "$(dirname "$0")/.."

VERSION="${1:-$(git describe --tags --always --dirty 2>/dev/null || echo "dev")}"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LDFLAGS="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.date=${DATE}"
DIST="dist"

rm -rf "$DIST"
mkdir -p "$DIST"

platforms=(
  "darwin/arm64"
  "darwin/amd64"
  "linux/amd64"
  "linux/arm64"
)

for platform in "${platforms[@]}"; do
  GOOS="${platform%/*}"
  GOARCH="${platform#*/}"
  outdir="${DIST}/haiphen_${VERSION}_${GOOS}_${GOARCH}"
  mkdir -p "$outdir"

  echo "Building ${GOOS}/${GOARCH}..."
  CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" \
    go build -trimpath -ldflags="$LDFLAGS" -o "${outdir}/haiphen" ./cmd/haiphen

  tar -czf "${outdir}.tar.gz" -C "$DIST" "haiphen_${VERSION}_${GOOS}_${GOARCH}"
  rm -rf "$outdir"
done

echo ""
echo "Generating checksums..."
cd "$DIST"
shasum -a 256 *.tar.gz > checksums.txt
cat checksums.txt

echo ""
echo "Release archives in ${DIST}/"
ls -lh *.tar.gz
