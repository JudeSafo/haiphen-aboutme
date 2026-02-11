# Haiphen CLI — E2E Test Runbook

End-to-end testing instructions for the broker integration pipeline, telemetry webhooks, and D1 data flow.

Each step includes a **checkpoint** — the exact output or condition to verify before proceeding.

---

## Prerequisites

| Requirement | Check |
|---|---|
| Go 1.24+ | `go version` shows `go1.24` or higher |
| Alpaca paper account | Sign up free at [alpaca.markets](https://alpaca.markets) |
| Paper API key + secret | Dashboard > Settings > API Keys (paper environment) |
| GitHub account | For `haiphen login` OAuth flow |

---

## Unit Tests (run first)

```bash
cd haiphen-cli
go test ./internal/broker/ ./internal/pipeline/ ./internal/brokerstore/ ./internal/tui/ -v -count=1
```

**Checkpoint:** All tests PASS (38 tests across 4 packages). If any fail, fix before proceeding.

---

## Phase 1: Build & Auth

### Step 1.1 — Build CLI

```bash
cd haiphen-cli
make build
```

**Checkpoint:** Binary produced at `./haiphen`, exit code 0.

```bash
./haiphen --help
```

**Checkpoint:** Shows `Available Commands:` including `broker`, `prospect`, `metrics`, etc.

### Step 1.2 — Authenticate

```bash
./haiphen login
```

Browser opens for GitHub OAuth. Authorize the app.

**Checkpoint:**
```
Logged in. Token expires at: 2026-02-...
```

### Step 1.3 — Verify auth status

```bash
./haiphen status
```

**Checkpoint:** All three lines present:
```
LoggedIn: true
User: github|<your_id> (<your_email>)
Entitled: true
```

If `Entitled: false`, you need an active subscription or free-tier allocation.

---

## Phase 2: Broker Connection

### Step 2.1 — Initialize broker

```bash
./haiphen broker init
```

Interactive prompts:
1. Disclaimer — type `y` and press Enter
2. Select broker — choose `Alpaca`
3. API Key ID — paste your paper key
4. API Secret — paste your paper secret (hidden input)

**Checkpoint:**
```
Account verified:
  ID:            ********-****-****-****-**********xx
  Buying Power:  $200,000.00
  Status:        ACTIVE

Broker connection saved.
```

If you see `SAFETY VIOLATION: account is not a paper trading account`, your key is from the live environment — switch to the paper dashboard.

### Step 2.2 — Verify server-side registration

```bash
./haiphen broker status
```

**Checkpoint:** Shows account balance, buying power, equity, and day trade count. No errors.

### Step 2.3 — Verify encrypted local credentials

```bash
file ~/Library/Application\ Support/haiphen/broker.default.alpaca.enc
```

**Checkpoint:** Output says `data` (binary), NOT readable JSON. This proves AES-256-GCM encryption is working.

---

## Phase 3: Trading

### Step 3.1 — Submit a market buy

```bash
./haiphen broker trade --symbol AAPL --qty 5 --side buy --type market --yes
```

**Checkpoint:** Order ID printed, no errors. If market is closed (after 4 PM ET), the order will be `accepted` and fill at next market open.

### Step 3.2 — Verify fill

```bash
./haiphen broker orders --status closed
```

**Checkpoint:** Table shows AAPL buy order with status `filled`. If market was closed, check `--status open` instead and wait for market open.

### Step 3.3 — Check positions

```bash
./haiphen broker positions
```

**Checkpoint:** Shows AAPL with qty=5 (or pending if market closed). Entry price, current price, and unrealized P&L visible.

### Step 3.4 — Submit a limit sell

```bash
./haiphen broker trade --symbol AAPL --qty 2 --side sell --type limit --limit-price 250.00 --yes
```

**Checkpoint:** Order accepted. Shows in `./haiphen broker orders --status open` as a pending limit sell.

---

## Phase 4: Safety Rails

### Step 4.1 — Max quantity rejection

```bash
./haiphen broker trade --symbol AAPL --qty 2000 --side buy --type market
```

**Checkpoint:** Error message:
```
quantity 2000 exceeds max order quantity of 1000
```

### Step 4.2 — Invalid side rejection

```bash
./haiphen broker trade --symbol AAPL --qty 5 --side short --type market
```

**Checkpoint:** Error message:
```
invalid side "short": must be 'buy' or 'sell'
```

### Step 4.3 — Invalid order type rejection

```bash
./haiphen broker trade --symbol AAPL --qty 5 --side buy --type trailing_stop
```

**Checkpoint:** Error message:
```
invalid order type "trailing_stop"
```

### Step 4.4 — View safety config

```bash
./haiphen broker config
```

**Checkpoint:** Shows max order qty (1000), max order value ($50,000), daily loss limit ($10,000), confirm orders (true).

---

## Phase 5: Pipeline Sync

### Step 5.1 — Sync KPIs

```bash
./haiphen broker sync
```

**Checkpoint:**
```
Synced 7 KPIs for alpaca
```

### Step 5.2 — Verify trades API

Open in browser or curl:
```
https://api.haiphen.io/v1/trades/latest
```

**Checkpoint:** JSON response with `date`, `rows` (KPIs), and `overlay` data. The response should include data (may or may not show paper:alpaca source data depending on pipeline merge timing).

---

## Phase 6: WebSocket Streaming

### Step 6.1 — Start watcher

In Terminal 1:
```bash
./haiphen broker watch
```

**Checkpoint:** Connection message shown, waiting for events.

### Step 6.2 — Trigger an event

In Terminal 2:
```bash
./haiphen broker trade --symbol MSFT --qty 3 --side buy --type market --yes
```

**Checkpoint (Terminal 1):** Live trade update event shows MSFT order activity. Press `Ctrl+C` to stop the watcher.

---

## Phase 7: Kill Switch & Cleanup

### Step 7.1 — Cancel all orders

```bash
./haiphen broker halt --yes
```

**Checkpoint:** Shows count of cancelled orders (or "no open orders to cancel").

```bash
./haiphen broker orders --status open
```

**Checkpoint:** Empty list — no open orders.

### Step 7.2 — Disconnect broker

```bash
./haiphen broker disconnect
```

**Checkpoint:**
```
Broker disconnected.
```

Verify credentials removed:
```bash
./haiphen broker status
# Error: no broker credentials found for alpaca
```

Verify local file deleted:
```bash
ls ~/Library/Application\ Support/haiphen/broker.default.alpaca.enc
# ls: No such file or directory
```

---

## Phase 8: Security Verification

### Step 8.1 — Paper-only URL audit

```bash
grep -r "alpaca.markets" internal/broker/
```

**Checkpoint:** Every match contains `paper-api.alpaca.markets`. Zero matches for `api.alpaca.markets` without `paper-` prefix.

### Step 8.2 — D1 encryption audit

```bash
cd ../haiphen-api
npx wrangler d1 execute haiphen_api --remote \
  --command "SELECT user_id, broker, account_id FROM broker_connections LIMIT 5"
```

**Checkpoint:** `account_id` column contains base64 ciphertext (long encoded string), NOT a plaintext UUID like `abcd-1234-...`.

### Step 8.3 — Sync log audit

```bash
npx wrangler d1 execute haiphen_api --remote \
  --command "SELECT * FROM broker_sync_log ORDER BY created_at DESC LIMIT 10"
```

**Checkpoint:** Shows sync records with `status = 'success'` and `records_count` matching your sync calls.

### Step 8.4 — Rate limiting test

```bash
# Extract token from session file
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/Library/Application Support/haiphen/session.default.json'))['access_token'])")

# Rapid-fire 70 requests
for i in $(seq 1 70); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    https://api.haiphen.io/v1/broker/connections/alpaca
done | sort | uniq -c
```

**Checkpoint:** You should see ~60 responses with `200` (or `404` if disconnected) and ~10 responses with `429` (rate limited).

---

## Phase 9: Webhook E2E (optional — requires API key)

### Step 9.1 — Register webhook

```bash
curl -X POST https://api.haiphen.io/v1/webhooks \
  -H "Authorization: Bearer <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-endpoint.com/hook","events":["metrics.published"]}'
```

**Checkpoint:** `201` response with webhook ID.

### Step 9.2 — Trigger publish

```bash
curl -X POST https://api.haiphen.io/v1/admin/publish \
  -H "X-Admin-Token: <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-02-11","event":"metrics.published"}'
```

**Checkpoint:** Your webhook endpoint receives the payload. Verify via your endpoint's logs.

---

## Cleanup

```bash
./haiphen broker disconnect   # remove credentials + D1 record
./haiphen logout               # clear session
rm -f haiphen                  # remove local binary
```

---

## Summary Checklist

| Phase | Step | Status |
|---|---|---|
| 1 | Build CLI | [ ] |
| 1 | Login + status | [ ] |
| 2 | Broker init | [ ] |
| 2 | Server registration | [ ] |
| 2 | Encrypted credentials | [ ] |
| 3 | Market buy | [ ] |
| 3 | Verify fill | [ ] |
| 3 | Positions | [ ] |
| 3 | Limit sell | [ ] |
| 4 | Safety: max qty | [ ] |
| 4 | Safety: invalid side | [ ] |
| 4 | Safety: invalid type | [ ] |
| 5 | Sync KPIs | [ ] |
| 5 | Trades API | [ ] |
| 6 | WebSocket watch | [ ] |
| 7 | Halt all orders | [ ] |
| 7 | Disconnect | [ ] |
| 8 | Paper-only audit | [ ] |
| 8 | D1 encryption audit | [ ] |
| 8 | Rate limit test | [ ] |
| 9 | Webhook (optional) | [ ] |
