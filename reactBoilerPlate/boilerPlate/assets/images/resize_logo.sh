#!/usr/bin/env bash
# resize_logo.sh — Resize a source logo into 1×, 2× and 3× mobile asset sizes using ImageMagick.
#
# Usage:
#   ./resize_logo.sh [INPUT_FILE]
#   Defaults to ./robot_haiphen.png if not provided.
#
# Requirements:
#   • macOS
#   • Homebrew-installed ImageMagick ("brew install imagemagick")
#   • bash (built-in on macOS)
#
# Emits:
#   robot_haiphen@1x.png  (163×88)
#   robot_haiphen@2x.png  (326×176)
#   robot_haiphen@3x.png  (489×264)

set -euo pipefail

# ------------------------------------------------------------------------------
# 1. Ensure ImageMagick is available
# ------------------------------------------------------------------------------
if ! command -v magick >/dev/null 2>&1; then
  echo "❌ ERROR: ImageMagick not found. Install via: brew install imagemagick" >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 2. Source image (default to robot_haiphen.png if none given)
# ------------------------------------------------------------------------------
SRC="${1:-robot_haiphen.png}"
if [[ ! -f "$SRC" ]]; then
  echo "❌ ERROR: Source file '$SRC' not found." >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 3. Define target dimensions for each scale
# ------------------------------------------------------------------------------
declare -A DIMS=(
  ["1x"]="163 88"
  ["2x"]="326 176"
  ["3x"]="489 264"
)

# ------------------------------------------------------------------------------
# 4. Inspect existing logo.png dims for verification
# ------------------------------------------------------------------------------
echo "🔍 Existing app logo dimensions:"
W=$(magick identify -format "%w" logo.png)
H=$(magick identify -format "%h" logo.png)
echo " • logo.png: ${W}×${H}"
echo

# ------------------------------------------------------------------------------
# 5. Resize into @1x/@2x/@3x
# ------------------------------------------------------------------------------
for scale in 1x 2x 3x; do
  read -r WIDTH HEIGHT <<< "${DIMS[$scale]}"
  OUT="${SRC%.*}@${scale}.png"
  echo "➡️  Generating ${OUT} (${WIDTH}×${HEIGHT})..."
  # Force exact dimensions (may stretch). Swap to the commented block below
  # to preserve aspect ratio + pad transparently.
  magick "$SRC" -resize "${WIDTH}x${HEIGHT}!" "$OUT"
  # magick "$SRC" \
  #   -resize ${WIDTH}x${HEIGHT} \
  #   -background none -gravity center -extent ${WIDTH}x${HEIGHT} \
  #   "$OUT"
done

# ------------------------------------------------------------------------------
# 6. Done — list out exactly the files we just created
# ------------------------------------------------------------------------------
echo
echo "✅ Done! Your resized assets:"
for scale in 1x 2x 3x; do
  echo " • ${SRC%.*}@${scale}.png"
done
