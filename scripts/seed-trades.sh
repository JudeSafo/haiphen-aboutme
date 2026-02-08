#!/usr/bin/env bash
# seed-trades.sh — Migrate trades.json into D1 trades_snapshots + trades_kpis tables
# Usage: ./scripts/seed-trades.sh [--local|--remote]
set -euo pipefail

TARGET="${1:---local}"
TRADES_FILE="docs/assets/trades/trades.json"
SEED_SQL="/tmp/seed-trades.sql"

if [ ! -f "$TRADES_FILE" ]; then
  echo "Error: $TRADES_FILE not found. Run from repo root." >&2
  exit 1
fi

command -v jq >/dev/null 2>&1 || { echo "Error: jq is required. Install via 'brew install jq'" >&2; exit 1; }

echo "-- Auto-generated trades seed data" > "$SEED_SQL"
echo "-- Source: $TRADES_FILE" >> "$SEED_SQL"
echo "" >> "$SEED_SQL"

# Extract snapshot metadata
DATE=$(jq -r '.date' "$TRADES_FILE")
HEADLINE=$(jq -r '.headline' "$TRADES_FILE" | sed "s/'/''/g")
SUMMARY=$(jq -r '.summary' "$TRADES_FILE" | sed "s/'/''/g")
UPDATED=$(jq -r '.updated_at' "$TRADES_FILE")

echo "INSERT OR REPLACE INTO trades_snapshots (date, headline, summary, updated_at)" >> "$SEED_SQL"
echo "VALUES ('$DATE', '$HEADLINE', '$SUMMARY', '$UPDATED');" >> "$SEED_SQL"
echo "" >> "$SEED_SQL"

# Extract KPI rows
ROW_COUNT=$(jq '.rows | length' "$TRADES_FILE")
echo "-- $ROW_COUNT KPI rows" >> "$SEED_SQL"

for i in $(seq 0 $(( ROW_COUNT - 1 ))); do
  KPI=$(jq -r ".rows[$i].kpi" "$TRADES_FILE" | sed "s/'/''/g")
  VALUE_TEXT=$(jq -r ".rows[$i].value" "$TRADES_FILE" | sed "s/'/''/g")

  # Parse numeric value
  CLEANED=$(echo "$VALUE_TEXT" | sed 's/[,$%]//g' | sed 's/s$//')
  if echo "$CLEANED" | grep -qE '^-?[0-9]+\.?[0-9]*$'; then
    VALUE_NUM="$CLEANED"
  else
    VALUE_NUM="NULL"
  fi

  # Determine value kind
  if echo "$VALUE_TEXT" | grep -qE '^\$'; then
    KIND="currency"
  elif echo "$VALUE_TEXT" | grep -qE '%$'; then
    KIND="percent"
  elif echo "$VALUE_TEXT" | grep -qE 's$'; then
    KIND="duration"
  else
    KIND="number"
  fi

  echo "INSERT OR REPLACE INTO trades_kpis (snapshot_date, kpi, value_text, value_num, value_kind, sort_order)" >> "$SEED_SQL"
  echo "VALUES ('$DATE', '$KPI', '$VALUE_TEXT', $VALUE_NUM, '$KIND', $i);" >> "$SEED_SQL"
done

echo "" >> "$SEED_SQL"
echo "-- Seed complete" >> "$SEED_SQL"

echo "Generated $SEED_SQL with snapshot + $ROW_COUNT KPIs"

if [ "$TARGET" = "--local" ]; then
  echo "Applying to local D1..."
  npx wrangler d1 execute haiphen_api --local --file="$SEED_SQL"
elif [ "$TARGET" = "--remote" ]; then
  echo "Applying to REMOTE D1..."
  npx wrangler d1 execute haiphen_api --remote --file="$SEED_SQL"
else
  echo "Usage: $0 [--local|--remote]"
  echo "SQL file generated at: $SEED_SQL"
fi

echo "Done."
