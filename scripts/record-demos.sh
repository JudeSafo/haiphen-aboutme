#!/usr/bin/env bash
# record-demos.sh — Record CLI demo GIFs using VHS (charmbracelet/vhs)
#
# Prerequisites:
#   brew install vhs    (or go install github.com/charmbracelet/vhs@latest)
#   brew install ffmpeg (for post-processing)
#
# Usage:
#   ./scripts/record-demos.sh          # record all demos
#   ./scripts/record-demos.sh login    # record just cli-login
set -euo pipefail
cd "$(dirname "$0")/.."

DEMOS_DIR="scripts/demos"
OUTPUT_DIR="docs/assets/demos"
MOCK_SCRIPT="$DEMOS_DIR/mock-haiphen.sh"
# Check prerequisites
if ! command -v vhs &>/dev/null; then
  echo "ERROR: vhs not found. Install with: brew install vhs"
  exit 1
fi

if [[ ! -x "$MOCK_SCRIPT" ]]; then
  echo "ERROR: Mock script not found or not executable: $MOCK_SCRIPT"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Create a temp directory with mock haiphen binary on PATH
MOCK_BIN="$(mktemp -d)"
trap 'rm -rf "$MOCK_BIN"' EXIT
ln -s "$(pwd)/$MOCK_SCRIPT" "$MOCK_BIN/haiphen"


# All tape files
TAPES=(
  cli-login
  cli-secure
  cli-network
  cli-graph
  cli-risk
  cli-causal
  cli-supply
  cli-workflow
)

# Filter to specific tape if argument given
if [[ $# -gt 0 ]]; then
  TAPES=()
  for arg in "$@"; do
    tape="cli-${arg#cli-}"
    if [[ -f "$DEMOS_DIR/$tape.tape" ]]; then
      TAPES+=("$tape")
    else
      echo "WARNING: Tape file not found: $DEMOS_DIR/$tape.tape"
    fi
  done
fi

if [[ ${#TAPES[@]} -eq 0 ]]; then
  echo "No tapes to record."
  exit 0
fi

echo "Recording ${#TAPES[@]} demo(s)..."
echo "Mock haiphen: $MOCK_BIN/haiphen"
echo ""

for tape in "${TAPES[@]}"; do
  tape_file="$DEMOS_DIR/$tape.tape"
  output_file="$OUTPUT_DIR/$tape.gif"

  # Replace DEMO_DIR placeholder with actual mock binary path
  patched_tape="$(mktemp)"
  sed "s|DEMO_DIR|$MOCK_BIN|g" "$tape_file" > "$patched_tape"

  echo "  [$tape] Recording..."
  if vhs "$patched_tape" 2>/dev/null; then
    rm -f "$patched_tape"

    # Post-process: optimize GIF size (target < 3MB)
    if command -v ffmpeg &>/dev/null && [[ -f "$output_file" ]]; then
      size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null || echo "0")
      size_kb=$((size / 1024))
      echo "  [$tape] Done — ${size_kb}KB ($output_file)"

      # If over 3MB, re-encode with lower quality
      if [[ $size -gt 3145728 ]]; then
        echo "  [$tape] Over 3MB, optimizing..."
        temp_file="${output_file%.gif}_opt.gif"
        ffmpeg -y -i "$output_file" \
          -vf "fps=10,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \
          "$temp_file" 2>/dev/null && mv "$temp_file" "$output_file"
        new_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null || echo "0")
        new_size_kb=$((new_size / 1024))
        echo "  [$tape] Optimized to ${new_size_kb}KB"
      fi
    else
      echo "  [$tape] Done ($output_file)"
    fi
  else
    rm -f "$patched_tape"
    echo "  [$tape] FAILED"
  fi
done

echo ""
echo "All demos recorded to $OUTPUT_DIR/"
