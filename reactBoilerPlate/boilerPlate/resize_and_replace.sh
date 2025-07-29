#!/usr/bin/env bash
# resize_and_replace.sh — Generate your 1×/2×/3× icons *and* remap all legacy splash/app-icon assets
#
# Usage:
#   ./resize_and_replace.sh [SOURCE_IMAGE]
#   Defaults to ./assets/images/robot_haiphen.png
#
# Requirements:
#   • macOS / bash
#   • brew-installed ImageMagick (“brew install imagemagick”)
#
# What it does:
#   • Emits robot_haiphen@1x {.png}, @2x, @3x in assets/images/
#   • Finds legacy splash/app-icon files in assets/images/, backs them up to .bak,
#     then overwrites them with your logo resized to their exact dimensions.

set -euo pipefail

# ——————————————————————————————————————————————————————————————
# 1) Ensure we have ImageMagick
# ——————————————————————————————————————————————————————————————
if ! command -v magick >/dev/null 2>&1; then
  echo "❌ ERROR: ImageMagick not found. Install with: brew install imagemagick" >&2
  exit 1
fi

# ——————————————————————————————————————————————————————————————
# 2) Locate your source logo
# ——————————————————————————————————————————————————————————————
SRC="${1:-assets/images/robot_haiphen.png}"
if [[ ! -f "$SRC" ]]; then
  echo "❌ ERROR: Source '$SRC' not found." >&2
  exit 1
fi

# ——————————————————————————————————————————————————————————————
# 3) Generate the 1× / 2× / 3× variants (for places you already know)
# ——————————————————————————————————————————————————————————————
declare -A DIMS=(
  ["1x"]="163 88"
  ["2x"]="326 176"
  ["3x"]="489 264"
)

echo
echo "🛠  Generating standard @1x/@2x/@3x variants for your new logo…"
for scale in 1x 2x 3x; do
  read -r W H <<< "${DIMS[$scale]}"
  OUT="assets/images/$(basename "${SRC%.*}")@${scale}.png"
  printf " • %s → %4sx%4s\n" "$(basename "$OUT")" "$W" "$H"
  magick "$SRC" -resize "${W}x${H}!" "$OUT"
done

# ——————————————————————————————————————————————————————————————
# 4) Find & replace all legacy splash-logo-*.png and adaptive-icon assets
# ——————————————————————————————————————————————————————————————
LEGACY=(\
  assets/images/splash-logo-*.png \
  assets/images/app-icon-android-adaptive-foreground.png \
  assets/images/app-icon-ios.png \
)

echo
echo "🛠  Now remapping legacy splash/app-icon assets (backup → .bak, overwrite)…"
for PAT in "${LEGACY[@]}"; do
  for FILE in $PAT; do
    [[ -f "$FILE" ]] || continue
    BAK="$FILE.bak"
    # backup once
    if [[ ! -f "$BAK" ]]; then
      cp "$FILE" "$BAK"
      echo " • backed up $(basename "$FILE") → $(basename "$BAK")"
    fi
    # read original dims
    read -r W H < <(magick identify -format "%w %h" "$FILE")
    # overwrite with your logo
    magick "$SRC" -resize "${W}x${H}!" "$FILE"
    echo " • replaced $(basename "$FILE") → ${W}×${H}"
  done
done

echo
echo "✅ All done! You now have:"
echo "   • robot_haiphen@1x/.@2x/.@3x.png"
echo "   • (and all splash-logo-*.png & app-icon… files overwritten with your new logo)"
echo
