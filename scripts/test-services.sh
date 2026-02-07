#!/usr/bin/env bash
# scripts/test-services.sh — Smoke-test all 6 scaffold services
#
# Prerequisites:
#   1. Each service must have .dev.vars with JWT_SECRET=dev-test-secret
#   2. npm install in each service directory
#   3. Start each service on its assigned port:
#      cd haiphen-secure  && npx wrangler dev --port 8790 &
#      cd haiphen-network && npx wrangler dev --port 8791 &
#      cd haiphen-graph   && npx wrangler dev --port 8792 &
#      cd haiphen-risk    && npx wrangler dev --port 8793 &
#      cd haiphen-causal  && npx wrangler dev --port 8794 &
#      cd haiphen-supply  && npx wrangler dev --port 8795 &
#
# Usage:
#   bash scripts/test-services.sh           # test all
#   bash scripts/test-services.sh secure    # test one

set -euo pipefail

# --- Generate a test JWT signed with dev-test-secret ---
generate_test_jwt() {
  local secret="dev-test-secret"
  local header
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=' | tr '+/' '-_' | tr -d '\n')
  local now
  now=$(date +%s)
  local exp=$((now + 3600))
  local payload
  payload=$(printf '{"sub":"test-user","aud":"haiphen-auth","iat":%d,"exp":%d,"jti":"test-jti-001"}' "$now" "$exp" | base64 | tr -d '=' | tr '+/' '-_' | tr -d '\n')
  local sig
  sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | base64 | tr -d '=' | tr '+/' '-_' | tr -d '\n')
  printf '%s.%s.%s' "$header" "$payload" "$sig"
}

JWT=$(generate_test_jwt)

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0

# --- Test helper ---
test_endpoint() {
  local label="$1"
  local method="$2"
  local url="$3"
  local expect_status="$4"
  local body="${5:-}"

  local args=(-s -o /dev/null -w '%{http_code}' -X "$method")
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  # Add auth header for authenticated endpoints
  if [[ "$label" == *"(auth)"* ]]; then
    args+=(-H "Authorization: Bearer $JWT")
  fi

  local status
  status=$(curl "${args[@]}" "$url" 2>/dev/null) || status="000"

  if [ "$status" = "$expect_status" ]; then
    echo -e "  ${GREEN}PASS${NC} $label → $status"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $label → got $status, expected $expect_status"
    FAIL=$((FAIL + 1))
  fi
}

test_service_running() {
  local port="$1"
  curl -s -o /dev/null -w '%{http_code}' "http://localhost:$port/v1/health" 2>/dev/null || echo "000"
}

# --- Service definitions ---
declare -A SERVICES
SERVICES=(
  [secure]=8790
  [network]=8791
  [graph]=8792
  [risk]=8793
  [causal]=8794
  [supply]=8795
)

FILTER="${1:-all}"

# --- Tests ---

test_secure() {
  local port=8790
  echo -e "\n${YELLOW}=== haiphen-secure :$port ===${NC}"
  local running
  running=$(test_service_running $port)
  if [ "$running" = "000" ]; then
    echo -e "  ${RED}SKIP${NC} Service not running on port $port"
    SKIP=$((SKIP + 3))
    return
  fi
  test_endpoint "GET /v1/health" GET "http://localhost:$port/v1/health" "200"
  test_endpoint "GET /v1/secure/status" GET "http://localhost:$port/v1/secure/status" "200"
  test_endpoint "POST /v1/secure/scan (auth)" POST "http://localhost:$port/v1/secure/scan" "200" '{"target":"192.168.1.0/24","type":"vulnerability"}'
  test_endpoint "GET /v1/secure/scans (auth)" GET "http://localhost:$port/v1/secure/scans" "200"
  test_endpoint "POST /v1/secure/scan (no auth)" POST "http://localhost:$port/v1/secure/scan" "401" '{"target":"test"}'
}

test_network() {
  local port=8791
  echo -e "\n${YELLOW}=== haiphen-network :$port ===${NC}"
  local running
  running=$(test_service_running $port)
  if [ "$running" = "000" ]; then
    echo -e "  ${RED}SKIP${NC} Service not running on port $port"
    SKIP=$((SKIP + 3))
    return
  fi
  test_endpoint "GET /v1/health" GET "http://localhost:$port/v1/health" "200"
  test_endpoint "GET /v1/network/protocols" GET "http://localhost:$port/v1/network/protocols" "200"
  test_endpoint "POST /v1/network/trace (auth)" POST "http://localhost:$port/v1/network/trace" "200" '{"target":"10.0.0.1","protocol":"modbus"}'
  test_endpoint "GET /v1/network/traces (auth)" GET "http://localhost:$port/v1/network/traces" "200"
  test_endpoint "POST /v1/network/trace (no auth)" POST "http://localhost:$port/v1/network/trace" "401" '{"target":"test"}'
}

test_graph() {
  local port=8792
  echo -e "\n${YELLOW}=== haiphen-graph :$port ===${NC}"
  local running
  running=$(test_service_running $port)
  if [ "$running" = "000" ]; then
    echo -e "  ${RED}SKIP${NC} Service not running on port $port"
    SKIP=$((SKIP + 3))
    return
  fi
  test_endpoint "GET /v1/health" GET "http://localhost:$port/v1/health" "200"
  test_endpoint "GET /v1/graph/schema" GET "http://localhost:$port/v1/graph/schema" "200"
  test_endpoint "POST /v1/graph/query (auth)" POST "http://localhost:$port/v1/graph/query" "200" '{"query":"MATCH (n:Device) RETURN n LIMIT 10"}'
  test_endpoint "GET /v1/graph/entities (auth)" GET "http://localhost:$port/v1/graph/entities" "200"
  test_endpoint "POST /v1/graph/query (no auth)" POST "http://localhost:$port/v1/graph/query" "401" '{"query":"test"}'
}

test_risk() {
  local port=8793
  echo -e "\n${YELLOW}=== haiphen-risk :$port ===${NC}"
  local running
  running=$(test_service_running $port)
  if [ "$running" = "000" ]; then
    echo -e "  ${RED}SKIP${NC} Service not running on port $port"
    SKIP=$((SKIP + 3))
    return
  fi
  test_endpoint "GET /v1/health" GET "http://localhost:$port/v1/health" "200"
  test_endpoint "GET /v1/risk/models" GET "http://localhost:$port/v1/risk/models" "200"
  test_endpoint "POST /v1/risk/assess (auth)" POST "http://localhost:$port/v1/risk/assess" "200" '{"scenario":"interest_rate_shock","parameters":{"rate_change":0.02}}'
  test_endpoint "GET /v1/risk/assessments (auth)" GET "http://localhost:$port/v1/risk/assessments" "200"
  test_endpoint "POST /v1/risk/assess (no auth)" POST "http://localhost:$port/v1/risk/assess" "401" '{"scenario":"test"}'
}

test_causal() {
  local port=8794
  echo -e "\n${YELLOW}=== haiphen-causal :$port ===${NC}"
  local running
  running=$(test_service_running $port)
  if [ "$running" = "000" ]; then
    echo -e "  ${RED}SKIP${NC} Service not running on port $port"
    SKIP=$((SKIP + 3))
    return
  fi
  test_endpoint "GET /v1/health" GET "http://localhost:$port/v1/health" "200"
  test_endpoint "POST /v1/causal/analyze (auth)" POST "http://localhost:$port/v1/causal/analyze" "200" '{"events":[{"timestamp":"2026-02-07T10:00:00Z","source":"sensor-1","type":"temperature_spike","value":95}]}'
  test_endpoint "GET /v1/causal/analyses (auth)" GET "http://localhost:$port/v1/causal/analyses" "200"
  test_endpoint "POST /v1/causal/analyze (no auth)" POST "http://localhost:$port/v1/causal/analyze" "401" '{"events":[{"timestamp":"now","source":"x","type":"t","value":1}]}'
}

test_supply() {
  local port=8795
  echo -e "\n${YELLOW}=== haiphen-supply :$port ===${NC}"
  local running
  running=$(test_service_running $port)
  if [ "$running" = "000" ]; then
    echo -e "  ${RED}SKIP${NC} Service not running on port $port"
    SKIP=$((SKIP + 3))
    return
  fi
  test_endpoint "GET /v1/health" GET "http://localhost:$port/v1/health" "200"
  test_endpoint "POST /v1/supply/assess (auth)" POST "http://localhost:$port/v1/supply/assess" "200" '{"supplier":"Acme Corp","depth":2}'
  test_endpoint "GET /v1/supply/suppliers (auth)" GET "http://localhost:$port/v1/supply/suppliers" "200"
  test_endpoint "GET /v1/supply/alerts (auth)" GET "http://localhost:$port/v1/supply/alerts" "200"
  test_endpoint "POST /v1/supply/assess (no auth)" POST "http://localhost:$port/v1/supply/assess" "401" '{"supplier":"test"}'
}

# --- Run ---
echo "============================================"
echo "  Haiphen Scaffold Services Smoke Test"
echo "============================================"
echo "JWT: ${JWT:0:20}..."

if [ "$FILTER" = "all" ]; then
  test_secure
  test_network
  test_graph
  test_risk
  test_causal
  test_supply
else
  "test_$FILTER"
fi

# --- Summary ---
echo ""
echo "============================================"
TOTAL=$((PASS + FAIL + SKIP))
echo -e "  ${GREEN}PASS: $PASS${NC}  ${RED}FAIL: $FAIL${NC}  SKIP: $SKIP  TOTAL: $TOTAL"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
