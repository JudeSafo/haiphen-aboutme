# Haiphen CLI — E2E Test Runbook

End-to-end testing instructions for the broker integration pipeline, telemetry webhooks, and D1 data flow.

## Prerequisites

- Go 1.24+
- Alpaca paper trading account (free at [alpaca.markets](https://alpaca.markets))
- Alpaca paper API key + secret from the dashboard (Settings > API Keys, paper environment)
- A valid Haiphen session (`haiphen login`)

## Build CLI

```bash
cd haiphen-cli
make build
# or: go build -o haiphen ./cmd/haiphen
```

## 1. Authentication

```bash
./haiphen login
```

Opens browser for GitHub OAuth. On success:

```
Logged in. Token expires at: 2026-02-18T...
```

Verify:

```bash
./haiphen status
# LoggedIn: true
# User: github|12345 (you@example.com)
# Entitled: true
```

## 2. Broker Init

```bash
./haiphen broker init
```

Interactive flow:
1. Accept disclaimer (`y`)
2. Select `Alpaca` broker
3. Paste paper API key ID
4. Paste paper API secret
5. Wait for account probe

Expected output:

```
Account verified:
  ID:            ********-****-****-****-**********12
  Buying Power:  $200,000.00
  Status:        ACTIVE

Broker connection saved.
```

## 3. Verify Server Registration

```bash
./haiphen broker status
```

Calls `GET /v1/broker/connections/alpaca` — verifies server-side D1 record exists and account_id is encrypted at rest.

## 4. Submit a Trade

```bash
./haiphen broker trade --symbol AAPL --qty 5 --side buy --type market --yes
```

Expected: order submitted, order ID printed. The `--yes` flag skips the confirmation prompt.

## 5. Verify Fill

Wait a few seconds, then:

```bash
./haiphen broker orders --status closed
```

Should show the AAPL market buy as `filled`.

## 6. Check Positions

```bash
./haiphen broker positions
```

Should show AAPL with qty=5.

## 7. Sync to Pipeline

```bash
./haiphen broker sync
```

Calls `POST /v1/broker/sync` with 7 KPIs:
- Portfolio Value, Cash, Buying Power, Unrealized P&L, Open Positions, Exits Closed, Day Trade Count

Expected:

```
Synced 7 KPIs for alpaca
```

## 8. Verify Trades API

```bash
curl -s https://api.haiphen.io/v1/trades/latest | jq '.kpis[] | select(.source == "paper:alpaca")'
```

Should return the 7 KPIs with `source: "paper:alpaca"`.

## 9. WebSocket Streaming

Terminal 1:

```bash
./haiphen broker watch
```

Terminal 2 (submit another trade):

```bash
./haiphen broker trade --symbol MSFT --qty 3 --side buy --type market --yes
```

Terminal 1 should show a live trade update event. Press `Ctrl+C` to stop.

## 10. Safety Rails Verification

### Max quantity (1000 shares):

```bash
./haiphen broker trade --symbol AAPL --qty 2000 --side buy --type market
# Error: quantity 2000 exceeds maximum 1000 shares per order
```

### Max order value ($50,000):

```bash
./haiphen broker trade --symbol BRK.A --qty 1 --side buy --type market
# Error if qty * price > $50,000
```

## 11. Halt All Orders

```bash
./haiphen broker halt --yes
```

Cancels all open orders. Verify:

```bash
./haiphen broker orders --status open
# (empty)
```

## 12. Disconnect

```bash
./haiphen broker disconnect
```

Removes local encrypted credentials and server-side D1 record.

Verify:

```bash
./haiphen broker status
# Error: no broker connection found
```

## 13. Security Verification

### Paper-only URLs:

```bash
grep -r "alpaca.markets" internal/broker/
# Every match should be paper-api.alpaca.markets — never live
```

### Encrypted credentials on disk:

```bash
file ~/Library/Application\ Support/haiphen/broker.default.alpaca.enc
# Should say "data" (binary), not readable text
```

### Encrypted account_id in D1:

```bash
cd ../haiphen-api
npx wrangler d1 execute haiphen_api --remote \
  --command "SELECT user_id, broker, account_id FROM broker_connections LIMIT 5"
# account_id should be a base64 ciphertext blob, not a plaintext UUID
```

### Rate limiting:

Rapid-fire 70+ requests in a loop:

```bash
TOKEN=$(cat ~/Library/Application\ Support/haiphen/session.default.json | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
for i in $(seq 1 70); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    https://api.haiphen.io/v1/broker/connections/alpaca
done | sort | uniq -c
# Should see 429 responses after ~60 requests (free tier)
```

## D1 Data Verification

```bash
cd ../haiphen-api

# Broker connections
npx wrangler d1 execute haiphen_api --remote \
  --command "SELECT * FROM broker_connections LIMIT 5"

# Sync log
npx wrangler d1 execute haiphen_api --remote \
  --command "SELECT * FROM broker_sync_log ORDER BY created_at DESC LIMIT 10"
```

## Webhook E2E (requires API key with webhooks:write scope)

### Register webhook:

```bash
curl -X POST https://api.haiphen.io/v1/webhooks \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-endpoint.com/hook","events":["metrics.published"]}'
```

### Trigger publish (admin only):

```bash
curl -X POST https://api.haiphen.io/v1/admin/publish \
  -H "X-Admin-Token: <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-02-11","event":"metrics.published"}'
```

Verify your webhook endpoint received the payload.

## Cleanup

```bash
./haiphen broker disconnect   # remove credentials + D1 record
./haiphen logout               # clear session
rm -f haiphen                  # remove local binary
```
