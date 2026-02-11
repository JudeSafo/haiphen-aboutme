# Trades Sync — Handover for Remote Agent

This document describes the GKE → D1 trades pipeline so that a remote AI agent (or engineer) on the GKE cluster can configure and operate the sync job.

## 1. D1 Target Schema

The sync job writes to these D1 tables (all created in migrations 0001/0004):

| Table | Primary Key | Purpose |
|---|---|---|
| `metrics_daily` | `date` (TEXT, YYYY-MM-DD) | Archive row with `rows_json` + `overlay_json` blobs |
| `metrics_kpi_values` | `(date, kpi)` | Normalized KPIs per date |
| `metrics_series_points` | auto | Time-series points (date, kpi, t, v, src) |
| `metrics_extremes_items` | auto | Hi/lo extremes per KPI (18+ numeric fields) |
| `metrics_portfolio_assets` | auto | Portfolio holdings (date, trade_id, symbol, contract_name) |

The API endpoint handles all normalization and D1 upsert logic — the sync job just needs to POST the payload.

## 2. Materialized Views to Query

These PostgreSQL materialized views on the GKE cluster provide the source data:

| ConfigMap Key | MV Table | Columns Used |
|---|---|---|
| `MV_KPI_TABLE` | `utils_statistics.trades_kpi_summary_mv` | `kpi_name, display_value, sort_order, report_date` |
| `MV_SERIES_TABLE` | `utils_statistics.trades_kpi_series_mv` | `kpi_name, ts, value, source, report_date` |
| `MV_EXTREMES_TABLE` | `utils_statistics.trades_contract_extremes_by_kpi_mv` | `kpi_name, side, rank, trade_id, symbol, contract_name, metric_raw, metric_abs, individual_pnl, abs_individual_pnl, percent_change, cost_basis, qty, bid_price, ask_price, mid_price, mid_ts, mid_mark_pnl, liquidity_drag, report_date` |
| `MV_PORTFOLIO_TABLE` | `utils_statistics.trades_portfolio_assets_mv` | `trade_id, symbol, contract_name, report_date` |

All views are filtered by `WHERE report_date = $1` using today's date (YYYY-MM-DD).

## 3. API Contract

### `POST /v1/internal/trades/snapshot`

**Auth:** `X-Internal-Token` header (must match haiphen-api `INTERNAL_TOKEN` secret)

**Request body (JSON):**

```json
{
  "date": "2026-02-11",
  "updated_at": "2026-02-11T14:00:00.000Z",
  "headline": "Haiphen metrics for 2026-02-11",
  "summary": "",
  "rows": [
    { "kpi": "Daily PnL", "value": "$1,234.56" },
    { "kpi": "Win rate", "value": "72.3%" }
  ],
  "overlay": {
    "seriesByKpi": {
      "Daily PnL": [
        { "t": "2026-02-11T09:30:00Z", "v": 500.25 },
        { "t": "2026-02-11T10:00:00Z", "v": 780.50, "src": "live" }
      ]
    },
    "extremes": {
      "byKpi": {
        "Daily PnL": {
          "hi": [{ "trade_id": 101, "symbol": "AAPL", "contract_name": "AAPL 250321C185", "metric_raw": 450.0 }],
          "lo": [{ "trade_id": 102, "symbol": "TSLA", "contract_name": "TSLA 250321P175", "metric_raw": -120.0 }]
        }
      }
    },
    "portfolioAssets": [
      { "trade_id": 101, "symbol": "AAPL", "contract_name": "AAPL 250321C185" }
    ]
  },
  "source": "gke-trades-sync"
}
```

**Success response (200):**

```json
{
  "ok": true,
  "date": "2026-02-11",
  "updated_at": "2026-02-11T14:00:00.000Z",
  "request_id": "abc123"
}
```

**The normalizer is flexible — it accepts these field name variants:**

- `rows` or `kpis` array
- Each row: `kpi`/`name`/`label` for name, `value`/`val`/`text` for value
- `overlay.seriesByKpi` or `overlay.series`
- Series points: `t`/`time`/`ts` for time, `v`/`value` for value
- `overlay.portfolioAssets` or `overlay.assets`

## 4. K8s Deploy Instructions

```bash
# Apply all manifests
kubectl apply -f k8s/trades-sync/

# Verify CronJobs
kubectl get cronjobs -n haiphen | grep trades-sync

# Manual test run
kubectl create job trades-sync-test --from=cronjob/trades-sync-premarket -n haiphen

# Check logs
kubectl logs -n haiphen -l job-name=trades-sync-test --tail=50

# Clean up test job
kubectl delete job trades-sync-test -n haiphen
```

## 5. Data Volume Expectations

Per snapshot (typical trading day):

| Table | Row Count | Notes |
|---|---|---|
| KPIs | 15-25 | One per trading metric |
| Series points | 2,000-6,000 | ~10-15 KPIs x 200-400 time points |
| Extremes | 100-400 | ~10-15 KPIs x hi/lo x 5-10 items |
| Portfolio assets | 50-200 | Active positions |
| **Total** | **~3,000-8,000** | Fits comfortably in D1 batch limits |

The API processes in chunks of 200 D1 statements per batch.

## 6. Build & Push

```bash
cd haiphen-gcp/jobs/haiphen-trades-sync
npm install
npm run build
docker build -t gcr.io/united-lane-361102/haiphen-trades-sync:latest .
docker push gcr.io/united-lane-361102/haiphen-trades-sync:latest
```

## 7. Secrets Setup

Fill `k8s/trades-sync/secret.yaml` with real values before applying:

- `INTERNAL_TOKEN`: Must match the `INTERNAL_TOKEN` secret in haiphen-api (Cloudflare Worker)
- `DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://user:pass@host:5432/dbname`)
- `CLOUDFLARE_API_TOKEN`: Optional, only needed for direct `wrangler d1 execute` fallback

## 8. Fallback: Direct D1 Access

If the API endpoint is unreachable, the container can write directly to D1:

```bash
npm install -g wrangler
export CLOUDFLARE_API_TOKEN="..."

wrangler d1 execute haiphen_api \
  --command "INSERT INTO metrics_daily(date, ...) VALUES (...)" \
  --account-id 307a5117867a624064b8ec44fb1bac76 \
  --database-id 9a26fb67-b6e5-4d5f-8e62-3ecfde5ee8c2
```

The preferred path is always the API endpoint (handles normalization, caching, derived table rebuild).

## 9. Schedule

| CronJob | UTC Schedule | ET Equivalent |
|---|---|---|
| `trades-sync-premarket` | `0 14 * * 1-5` | 9:00 AM ET |
| `trades-sync-midday` | `30 17 * * 1-5` | 12:30 PM ET |
| `trades-sync-postmarket` | `30 21 * * 1-5` | 4:30 PM ET |

Weekdays only. `concurrencyPolicy: Forbid` prevents overlapping runs.
