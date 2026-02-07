#!/usr/bin/env bash
set -euo pipefail

# Send a SendGrid dynamic template email with dynamic_template_data loaded from a JSON file.
#
# Requirements:
#   - jq, curl
#   - env: SENDGRID_API_KEY, TEMPLATE_ID
#
# Usage:
#   ./scripts/sendgrid_send_template.sh \
#     --to "patrick@example.com" \
#     --to-name "Patrick" \
#     --data "./scripts/sendgrid_data.patrick.json" \
#     --from "pi@haiphenai.com" \
#     --from-name "Haiphen" \
#     --subject "Haiphen Cohort — kickoff scheduled" \
#     [--dry-run] [--verbose]

LOG="[sendgrid]"
log() { printf '%s %s\n' "$LOG" "$*" >&2; }
die() { printf '%s %s\n' "${LOG}[fatal]" "$*" >&2; exit 1; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"; }

trim() {
  local s="${1:-}"
  # trim leading/trailing whitespace
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

is_email() {
  # pragmatic check (not RFC-perfect)
  [[ "${1:-}" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

SENDGRID_API_KEY="${SENDGRID_API_KEY:-}"

# ---- Template IDs ----
# We keep two distinct template IDs: one for outreach, one for followup.
# You can override either with env vars:
#   OUTREACH_TEMPLATE_ID, FOLLOWUP_TEMPLATE_ID
#
# Back-compat:
#   TEMPLATE_ID (legacy) is treated as *outreach* only.

DEFAULT_OUTREACH_TEMPLATE_ID="d-a8edfa651d524c089df93a7e1bfa78c1"
DEFAULT_FOLLOWUP_TEMPLATE_ID="d-a7ad1350799b4196800e3e1b418206c3"

# Legacy env var (maps to outreach only)
TEMPLATE_ID="${TEMPLATE_ID:-}"

# Allow explicit overrides; otherwise fallback to legacy TEMPLATE_ID; otherwise fallback to baked defaults.
OUTREACH_TEMPLATE_ID="${OUTREACH_TEMPLATE_ID:-${TEMPLATE_ID:-$DEFAULT_OUTREACH_TEMPLATE_ID}}"
FOLLOWUP_TEMPLATE_ID="${FOLLOWUP_TEMPLATE_ID:-$DEFAULT_FOLLOWUP_TEMPLATE_ID}"

TO_EMAIL=""
TO_NAME=""
DATA_FILE=""
FROM_EMAIL=""
FROM_NAME=""
SUBJECT=""
EMAIL_KIND="outreach"
DRY_RUN="0"
VERBOSE="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) TO_EMAIL="${2:-}"; shift 2;;
    --to-name) TO_NAME="${2:-}"; shift 2;;
    --data) DATA_FILE="${2:-}"; shift 2;;
    --from) FROM_EMAIL="${2:-}"; shift 2;;
    --from-name) FROM_NAME="${2:-}"; shift 2;;
    --subject) SUBJECT="${2:-}"; shift 2;;
    --dry-run) DRY_RUN="1"; shift 1;;
    --verbose) VERBOSE="1"; shift 1;;
    -h|--help) sed -n '1,140p' "$0"; exit 0;;
    --kind) EMAIL_KIND="${2:-}"; shift 2;;    
    *) die "unknown arg: $1";;
  esac
done

need_cmd jq
need_cmd curl
need_cmd date

EMAIL_KIND="$(trim "$EMAIL_KIND")"
case "$EMAIL_KIND" in
  outreach|followup) ;;
  *) die "invalid --kind '$EMAIL_KIND' (expected: outreach|followup)";;
esac

# Guardrail: if the two template IDs are the same, that's almost certainly a misconfig.
if [[ "$OUTREACH_TEMPLATE_ID" == "$FOLLOWUP_TEMPLATE_ID" ]]; then
  die "misconfigured template ids: OUTREACH_TEMPLATE_ID == FOLLOWUP_TEMPLATE_ID == '$OUTREACH_TEMPLATE_ID' (set OUTREACH_TEMPLATE_ID to '$DEFAULT_OUTREACH_TEMPLATE_ID')"
fi

# Choose template id by kind
if [[ "$EMAIL_KIND" == "followup" ]]; then
  TEMPLATE_ID="$FOLLOWUP_TEMPLATE_ID"
else
  TEMPLATE_ID="$OUTREACH_TEMPLATE_ID"
fi

[[ -n "$SENDGRID_API_KEY" ]] || die "SENDGRID_API_KEY is not set"
[[ -n "$TEMPLATE_ID" ]] || die "TEMPLATE_ID is not set"
[[ -n "$DATA_FILE" ]] || die "--data is required"
[[ -f "$DATA_FILE" ]] || die "data file not found: $DATA_FILE"

# ---- derive defaults from the JSON when CLI args are omitted ----
# Supported JSON shapes (any will work):
#   - { "to": { "email": "...", "name": "..." } }
#   - { "recipient": { "email": "...", "name": "..." } }
#   - { "from": { "email": "...", "name": "..." } }
#   - { "sender": { "email": "...", "org": "..." } }   # your current file
#   - { "subject": "..." }
VIDEO_INTRO_URL="${VIDEO_INTRO_URL:-https://drive.google.com/file/d/1pjF73rMSsbIJbgS0dOyFL0eX1vbCJm2Z/preview}"
DEFAULT_TO_EMAIL="$(jq -r '(.to.email // .recipient.email // .to_email // .recipient_email // empty)' "$DATA_FILE")"
DEFAULT_TO_NAME="$(jq -r '(.to.name // .recipient.name // .to_name // .recipient_name // .name // empty)' "$DATA_FILE")"

DEFAULT_FROM_EMAIL="$(jq -r '(.from.email // .sender.email // .from_email // empty)' "$DATA_FILE")"
DEFAULT_FROM_NAME="$(jq -r '(.from.name // .sender.org // .from_name // empty)' "$DATA_FILE")"

DEFAULT_SUBJECT="$(jq -r '(.subject // empty)' "$DATA_FILE")"

# If no --subject was provided:
# - followup: prefer the followup default (ignore JSON's outreach subject)
# - outreach: prefer JSON subject, else fallback
if [[ -z "${SUBJECT:-}" ]]; then
  if [[ "$EMAIL_KIND" == "followup" ]]; then
    SUBJECT="Demo Follow Up — Next steps"
  else
    SUBJECT="$DEFAULT_SUBJECT"
    SUBJECT="$(trim "$SUBJECT")"
    if [[ -z "$SUBJECT" ]]; then
      SUBJECT="Onboarding + Demo Discussion"
    fi
  fi
fi

# Apply defaults only when CLI args were not provided
TO_EMAIL="${TO_EMAIL:-$DEFAULT_TO_EMAIL}"
TO_NAME="${TO_NAME:-$DEFAULT_TO_NAME}"
FROM_EMAIL="${FROM_EMAIL:-$DEFAULT_FROM_EMAIL}"
FROM_NAME="${FROM_NAME:-$DEFAULT_FROM_NAME}"
SUBJECT="${SUBJECT:-$DEFAULT_SUBJECT}"

# Sanitize
TO_EMAIL="$(trim "$TO_EMAIL")"
FROM_EMAIL="$(trim "$FROM_EMAIL")"
TO_NAME="$(trim "$TO_NAME")"
FROM_NAME="$(trim "$FROM_NAME")"
SUBJECT="$(trim "$SUBJECT")"

# Validate
[[ -n "$TO_EMAIL" ]]   || die "missing recipient email: pass --to or set .to.email (or .recipient.email) in $DATA_FILE"
[[ -n "$FROM_EMAIL" ]] || die "missing from email: pass --from or set .from.email / .sender.email in $DATA_FILE"
[[ -n "$FROM_NAME" ]]  || die "missing from name: pass --from-name or set .from.name / .sender.org in $DATA_FILE"

is_email "$TO_EMAIL"   || die "invalid recipient email: '$TO_EMAIL' (check whitespace / format)"
is_email "$FROM_EMAIL" || die "invalid from email: '$FROM_EMAIL' (check sender identity / format)"

# After defaulting, enforce required values
[[ -n "$TO_EMAIL" ]] || die "missing recipient email: pass --to or set .to.email (or .recipient.email) in $DATA_FILE"
[[ -n "$FROM_EMAIL" ]] || die "missing from email: pass --from or set .from.email / .sender.email in $DATA_FILE"
[[ -n "$FROM_NAME" ]] || die "missing from name: pass --from-name or set .from.name / .sender.org in $DATA_FILE"

jq -e . "$DATA_FILE" >/dev/null || die "invalid JSON in: $DATA_FILE"

auth_hdr=(-H "Authorization: Bearer $SENDGRID_API_KEY")

preflight() {
  # 1) Template exists for this key
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" \
    "${auth_hdr[@]}" \
    "https://api.sendgrid.com/v3/templates/${TEMPLATE_ID}")" || true
  if [[ "$code" != "200" ]]; then
    log "template preflight failed: template_id=$TEMPLATE_ID http=$code"
    log "available dynamic templates for this key:"
    curl -sS "${auth_hdr[@]}" \
      "https://api.sendgrid.com/v3/templates?generations=dynamic&page_size=200" \
      | jq -r '.result[]? | "  \(.id)\t\(.name)"' >&2 || true
    die "template_id is not accessible by this API key"
  fi

  # 2) Warn if sender identity not verified (common silent failure / drops)
  # This endpoint lists verified senders (if you use Single Sender Verification).
  # If you use domain auth, this may be empty; it's still a useful hint.
  local verified_count
  verified_count="$(curl -sS "${auth_hdr[@]}" "https://api.sendgrid.com/v3/verified_senders" \
    | jq -r '.result | length' 2>/dev/null || echo "0")"
  if [[ "$verified_count" == "0" ]]; then
    log "note: /verified_senders is empty. If mail doesn't arrive, verify From domain/sender in SendGrid UI."
  fi
}

preflight

# ---- meeting.calendar_url enrichment (computed from JSON) ----
# Rules:
# - If .meeting.calendar_url is missing/empty, compute it.
# - Supports:
#   - .meeting.start_iso (e.g. "2026-01-25T14:00:00-08:00" or "2026-01-25T22:00:00Z")
#   - .meeting.start_local (e.g. "2026-01-25 14:00:00")
#   - .meeting.when_human (e.g. "Sun, Jan 25, 2026 · 2:00 PM (America/Pacific)")
# - Requires: .meeting.duration_minutes, .meeting.timezone
# - Uses .meeting.join_url for details/location if present.
urlencode() {
  # URL-encode a string using jq (no python/perl)
  jq -rn --arg s "${1:-}" '$s|@uri'
}

build_calendar_url_from_json() {
  local f="$1"

  local when_human duration tz join title
  when_human="$(jq -r '.meeting.when_human // empty' "$f")"
  duration="$(jq -r '.meeting.duration_minutes // empty' "$f")"
  tz="$(jq -r '.meeting.timezone // empty' "$f")"
  join="$(jq -r '.meeting.join_url // empty' "$f")"
  title="$(jq -r '(.meeting.title // .cohort.name // "Haiphen Cohort Kickoff")' "$f")"

  when_human="$(trim "$when_human")"
  duration="$(trim "$duration")"
  tz="$(trim "$tz")"
  join="$(trim "$join")"
  title="$(trim "$title")"

  [[ -n "$when_human" ]] || die "missing .meeting.when_human in $f"
  [[ -n "$duration" ]] || die "missing .meeting.duration_minutes in $f"
  [[ "$duration" =~ ^[0-9]+$ ]] || die "invalid .meeting.duration_minutes='$duration' in $f"
  [[ -n "$tz" ]] || die "missing .meeting.timezone in $f"
  [[ -n "$join" ]] || die "missing .meeting.join_url in $f"

  # Parse: "Thur, Jan 29, 2026 · 3:30 PM (America/Pacific)"
  # Robust handling:
  # - ignore weekday token (anything before first comma)
  # - accept "·" or "-"
  # - extract tz from "(...)"
  local date_part time_part tz_part
  date_part="$(printf '%s' "$when_human" | sed -E 's/^[^,]+,[[:space:]]*//; s/[[:space:]]*[·-].*$//')"
  time_part="$(printf '%s' "$when_human" | sed -E 's/^.*[·-][[:space:]]*//; s/[[:space:]]*\(.*$//')"
  tz_part="$(printf '%s' "$when_human" | sed -nE 's/^.*\(([^)]+)\).*$/\1/p')"

  date_part="$(trim "$date_part")"
  time_part="$(trim "$time_part")"
  tz_part="$(trim "$tz_part")"

  # Prefer explicit meeting.timezone, but if when_human contains one, ensure they match.
  if [[ -n "$tz_part" && "$tz_part" != "$tz" ]]; then
    log "warning: .meeting.timezone='$tz' differs from when_human tz='${tz_part}'. using .meeting.timezone"
  fi

  # macOS/BSD date parsing. This assumes English month names.
  # Start: YYYYMMDDTHHMMSS
  # Compute in the meeting timezone (NOT the machine timezone) and avoid "current seconds".
  local start_epoch end_epoch start end
  start_epoch="$(
    TZ="$tz" date -j -f "%b %d, %Y %I:%M %p" \
      "${date_part} ${time_part}" "+%s" 2>/dev/null
  )" || die "failed to parse meeting.when_human='$when_human' (expected like 'Jan 29, 2026 · 3:30 PM (...)')"

  end_epoch="$(( start_epoch + duration * 60 ))"

  start="$(TZ="$tz" date -r "$start_epoch" "+%Y%m%dT%H%M00" 2>/dev/null)" \
    || die "failed to format start time (epoch=$start_epoch tz=$tz)"
  end="$(TZ="$tz" date -r "$end_epoch" "+%Y%m%dT%H%M00" 2>/dev/null)" \
    || die "failed to format end time (epoch=$end_epoch tz=$tz)"

  # Build Google Calendar link. Use /calendar/render?action=TEMPLATE format (matches your existing URLs).
  local base="https://calendar.google.com/calendar/render"
  local q_action q_text q_dates q_details q_location q_ctz

  q_action="action=TEMPLATE"
  q_text="text=$(urlencode "$title")"
  q_dates="dates=${start}%2F${end}"
  q_details="details=$(urlencode "Join: $join")"
  q_location="location=$(urlencode "$join")"
  q_ctz="ctz=$(urlencode "$tz")"

  printf '%s?%s&%s&%s&%s&%s&%s\n' \
    "$base" "$q_action" "$q_text" "$q_dates" "$q_details" "$q_location" "$q_ctz"
}

enrich_data_json() {
  # Overwrite meeting.calendar_url deterministically from other meeting fields.
  local in="$1"
  local out="$2"
  local cal_url
  cal_url="$(build_calendar_url_from_json "$in")"

  jq --arg cal "$cal_url" '
    .meeting = (.meeting // {}) |
    .meeting.calendar_url = $cal
  ' "$in" >"$out"
}

ENRICHED_DATA_FILE="$(mktemp)"
trap 'rm -f "$ENRICHED_DATA_FILE"' EXIT

enrich_data_json "$DATA_FILE" "$ENRICHED_DATA_FILE"

if [[ "$VERBOSE" == "1" ]]; then
  log "using enriched data json: $ENRICHED_DATA_FILE"
  jq '.meeting.calendar_url? // empty' "$ENRICHED_DATA_FILE" >&2 || true
fi

PAYLOAD="$(jq -n \
  --arg template_id "$TEMPLATE_ID" \
  --arg from_email "$FROM_EMAIL" \
  --arg from_name "$FROM_NAME" \
  --arg to_email "$TO_EMAIL" \
  --arg to_name "$TO_NAME" \
  --arg subject "$SUBJECT" \
  --arg email_kind "$EMAIL_KIND" \
  --arg video_intro_url "$VIDEO_INTRO_URL" \
  --slurpfile dyn "$ENRICHED_DATA_FILE" \
  '
  {
    from: { email: $from_email, name: $from_name },
    personalizations: [
      {
        to: [
          ( { email: $to_email } + (if ($to_name|length)>0 then {name:$to_name} else {} end) )
        ],
        dynamic_template_data:
          (
            $dyn[0]
            # Ensure runtime metadata is consistent regardless of what’s in the JSON file:
            + {
                subject: $subject,
                email_kind: $email_kind,
                video_intro_url: $video_intro_url,
                to: { email: $to_email, name: $to_name },
                from: { email: $from_email, name: $from_name }
              }
            + (if ($to_name|length)>0 then {name:$to_name} else {} end)
          )
      }
    ],
    template_id: $template_id,
    categories: [ "haiphen_" + $email_kind ],
    custom_args: { email_kind: $email_kind }
  }
  + (if ($subject|length)>0 then {subject:$subject} else {} end)
  ')"

if [[ "$DRY_RUN" == "1" ]]; then
  log "dry-run enabled; not sending"
  echo "$PAYLOAD" | jq .
  exit 0
fi

log "sending template_id=$TEMPLATE_ID to=$TO_EMAIL from=$FROM_EMAIL"

# Always capture headers so you get X-Message-Id, and errors if any.
RESP_HEADERS="$(mktemp)"
RESP_BODY="$(mktemp)"
HTTP_CODE="$(curl -sS -D "$RESP_HEADERS" -o "$RESP_BODY" -w "%{http_code}" \
  -X POST "https://api.sendgrid.com/v3/mail/send" \
  "${auth_hdr[@]}" \
  -H "Content-Type: application/json" \
  --data-binary "$PAYLOAD")" || die "curl failed"

if [[ "$VERBOSE" == "1" ]]; then
  echo "----- response headers -----"
  cat "$RESP_HEADERS"
  echo "----- response body -----"
  cat "$RESP_BODY"
fi

# SendGrid returns 202 on accepted
if [[ "$HTTP_CODE" != "202" ]]; then
  log "send failed http=$HTTP_CODE"
  cat "$RESP_BODY" >&2 || true
  die "sendgrid rejected the request"
fi

MSG_ID="$(grep -i '^x-message-id:' "$RESP_HEADERS" | awk '{print $2}' | tr -d '\r' || true)"
log "accepted (http=202) x-message-id=${MSG_ID:-"(none)"}"

rm -f "$RESP_HEADERS" "$RESP_BODY"