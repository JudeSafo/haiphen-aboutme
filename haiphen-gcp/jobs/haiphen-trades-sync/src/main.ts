import { Client } from "pg";
import { createHmac } from "crypto";

// ---- Environment ----
const DATABASE_URL = process.env.DATABASE_URL || "";
const HAIPHEN_API_URL = (process.env.HAIPHEN_API_URL || "https://api.haiphen.io").replace(/\/$/, "");
const SNAPSHOT_ENDPOINT = process.env.SNAPSHOT_ENDPOINT || "/v1/internal/trades/snapshot";
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || "";
const SIGNING_SECRET = process.env.SIGNING_SECRET || "";

// Actual MV/table names in Postgres
const MV_KPI_TABLE = process.env.MV_KPI_TABLE || "utils_statistics.daily_trade_kpis_mv";
const MV_SERIES_TABLE = process.env.MV_SERIES_TABLE || "utils_statistics.trades_kpi_series_mv";
const MV_EXTREMES_TABLE = process.env.MV_EXTREMES_TABLE || "utils_statistics.trades_contract_extremes_by_kpi_mv";

function todayYYYYMMDD(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function hmacSign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ---- Display formatting helpers ----
function fmtInt(v: number | null): string {
  if (v == null) return "—";
  return Math.round(v).toLocaleString("en-US");
}
function fmtDollar(v: number | null): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-$${formatted}` : `$${formatted}`;
}
function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return (v * 100).toFixed(2) + "%";
}
function fmtDec(v: number | null, digits: number): string {
  if (v == null) return "—";
  return Number(v).toFixed(digits);
}

async function main() {
  if (!DATABASE_URL) {
    console.error("[trades-sync] DATABASE_URL is required");
    process.exit(1);
  }
  if (!INTERNAL_TOKEN) {
    console.error("[trades-sync] INTERNAL_TOKEN is required");
    process.exit(1);
  }

  const date = todayYYYYMMDD();
  console.log(`[trades-sync] Starting sync for ${date}`);

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();
  console.log("[trades-sync] Connected to Postgres");

  try {
    // 1) KPIs — wide format MV, pivot to {kpi, value} rows in code
    const kpiRes = await pg.query(
      `SELECT * FROM ${MV_KPI_TABLE} WHERE day = $1`,
      [date]
    );

    // Supplemental counts not in the KPI MV
    const signalsRes = await pg.query(
      `SELECT COUNT(*)::int AS cnt FROM options_data WHERE fetched_at::date = $1`,
      [date]
    );
    const notifsRes = await pg.query(
      `SELECT COUNT(*)::int AS cnt FROM signal_attenuation_log WHERE created_at::date = $1`,
      [date]
    );
    // Portfolio count
    const portCountRes = await pg.query(
      `SELECT COUNT(*)::int AS cnt FROM alpaca_positions_cache WHERE qty != 0`
    );

    const signalsScanned = signalsRes.rows[0]?.cnt ?? 0;
    const notifsSent = notifsRes.rows[0]?.cnt ?? 0;
    const portfolioCount = portCountRes.rows[0]?.cnt ?? 0;

    const k = kpiRes.rows[0] || {};
    const rows = [
      { kpi: "Signals scanned",      value: fmtInt(signalsScanned) },
      { kpi: "Opportunities flagged", value: fmtInt(k.opportunities_flagged) },
      { kpi: "Notifications sent",    value: fmtInt(notifsSent) },
      { kpi: "Entries opened",        value: fmtInt(k.entries_opened) },
      { kpi: "Exits closed",          value: fmtInt(k.exits_closed) },
      { kpi: "Avg hold time",         value: k.avg_hold_seconds != null ? `${Math.round(k.avg_hold_seconds)}s` : "—" },
      { kpi: "Daily PnL",             value: fmtDollar(k.pnl_day_usd != null ? Number(k.pnl_day_usd) : null) },
      { kpi: "Win rate",              value: fmtPct(k.win_rate != null ? Number(k.win_rate) : null) },
      { kpi: "Max drawdown",          value: fmtPct(k.max_drawdown_pct != null ? Number(k.max_drawdown_pct) : null) },
      { kpi: "Sharpe ratio",          value: fmtDec(k.sharpe_ratio, 2) },
      { kpi: "Delta",                 value: fmtDec(k.delta, 4) },
      { kpi: "Gamma",                 value: fmtDec(k.gamma, 6) },
      { kpi: "Theta",                 value: fmtDec(k.theta, 4) },
      { kpi: "Vega",                  value: fmtDec(k.vega, 4) },
      { kpi: "Rho",                   value: fmtDec(k.rho, 4) },
      { kpi: "Historical Volatility", value: fmtDec(k.historical_volatility, 4) },
      { kpi: "Uncertainty",           value: fmtDec(k.uncertainty, 4) },
      { kpi: "Fair Market Price",     value: fmtDollar(k.fair_market_price != null ? Number(k.fair_market_price) : null) },
      { kpi: "IV Skew",               value: fmtDec(k.iv_skew, 4) },
      { kpi: "Decay Rate",            value: fmtDec(k.decay_rate, 6) },
      { kpi: "Gamma Exposure",        value: fmtDec(k.gamma_exposure, 6) },
      { kpi: "Volume Ratio",          value: fmtDec(k.volume_ratio, 4) },
      { kpi: "OI Ratio",              value: fmtDec(k.oi_ratio, 4) },
      { kpi: "Liquidity Ratios",      value: fmtDec(k.liquidity_ratios, 4) },
      { kpi: "Decay Weight",          value: fmtDec(k.decay_weight, 4) },
      { kpi: "Portfolio",             value: String(portfolioCount) },
    ];
    console.log(`[trades-sync] KPIs: ${rows.length} rows`);

    // Build summary line
    const pnlDisplay = rows.find(r => r.kpi === "Daily PnL")?.value ?? "—";
    const summary = [
      `${fmtInt(signalsScanned)} signals scanned`,
      `${fmtInt(k.opportunities_flagged)} opportunities flagged`,
      `${fmtInt(k.entries_opened)} entries opened`,
      `${fmtInt(k.exits_closed)} exits closed`,
      `${pnlDisplay} pnl`,
    ].join(" • ") + ".";

    // 2) Series points — actual columns: day, bucket_ts, kpi, value, source
    const seriesRes = await pg.query(
      `SELECT kpi, bucket_ts, value, source FROM ${MV_SERIES_TABLE} WHERE day = $1 ORDER BY kpi, bucket_ts ASC`,
      [date]
    );
    const seriesByKpi: Record<string, Array<{ t: string; v: number; src?: string }>> = {};
    for (const r of seriesRes.rows) {
      const kpi = r.kpi;
      if (!seriesByKpi[kpi]) seriesByKpi[kpi] = [];
      const pt: { t: string; v: number; src?: string } = { t: r.bucket_ts, v: Number(r.value) };
      if (r.source) pt.src = r.source;
      seriesByKpi[kpi].push(pt);
    }
    console.log(`[trades-sync] Series: ${seriesRes.rows.length} points across ${Object.keys(seriesByKpi).length} KPIs`);

    // 3) Extremes — actual columns: day, kpi, side, rank, trade_id, symbol, contract_name, ...
    const extremesRes = await pg.query(
      `SELECT kpi, side, rank, trade_id, symbol, contract_name,
              metric_raw, metric_abs, individual_pnl, abs_individual_pnl,
              percent_change, cost_basis, qty,
              bid_price, ask_price, mid_price, mid_ts,
              mid_mark_pnl, liquidity_drag
       FROM ${MV_EXTREMES_TABLE}
       WHERE day = $1
       ORDER BY kpi, side, rank ASC`,
      [date]
    );
    const byKpi: Record<string, { hi: any[]; lo: any[] }> = {};
    for (const r of extremesRes.rows) {
      const kpi = r.kpi;
      if (!byKpi[kpi]) byKpi[kpi] = { hi: [], lo: [] };
      const item = {
        trade_id: r.trade_id,
        symbol: r.symbol,
        contract_name: r.contract_name,
        metric_raw: r.metric_raw,
        metric_abs: r.metric_abs,
        individual_pnl: r.individual_pnl,
        abs_individual_pnl: r.abs_individual_pnl,
        percent_change: r.percent_change,
        cost_basis: r.cost_basis,
        qty: r.qty,
        bid_price: r.bid_price,
        ask_price: r.ask_price,
        mid_price: r.mid_price,
        mid_ts: r.mid_ts,
        mid_mark_pnl: r.mid_mark_pnl,
        liquidity_drag: r.liquidity_drag,
      };
      if (r.side === "hi") byKpi[kpi].hi.push(item);
      else byKpi[kpi].lo.push(item);
    }
    console.log(`[trades-sync] Extremes: ${extremesRes.rows.length} items across ${Object.keys(byKpi).length} KPIs`);

    // 4) Portfolio assets — from alpaca_positions_cache + trades table for trade_id
    const portfolioRes = await pg.query(
      `SELECT DISTINCT ON (p.option_id)
              COALESCE(t.id, p.option_id) AS trade_id,
              regexp_replace(p.symbol, '[0-9].*', '') AS symbol,
              p.symbol AS contract_name
       FROM alpaca_positions_cache p
       LEFT JOIN trades t ON t.option_id = p.option_id
       WHERE p.qty != 0
       ORDER BY p.option_id, t.id DESC`
    );
    const portfolioAssets = portfolioRes.rows.map((r: any) => ({
      trade_id: r.trade_id,
      symbol: r.symbol || null,
      contract_name: r.contract_name,
    }));
    console.log(`[trades-sync] Portfolio: ${portfolioAssets.length} assets`);

    // 5) Assemble payload
    const payload = {
      date,
      updated_at: new Date().toISOString(),
      headline: `Haiphen metrics for ${date}`,
      summary,
      rows,
      overlay: {
        seriesByKpi,
        extremes: { byKpi },
        portfolioAssets,
      },
      source: "gke-trades-sync",
    };

    const totalItems = rows.length + seriesRes.rows.length + extremesRes.rows.length + portfolioAssets.length;
    console.log(`[trades-sync] Payload assembled: ${totalItems} total items`);

    // 6) POST to haiphen-api with HMAC signature
    const url = `${HAIPHEN_API_URL}${SNAPSHOT_ENDPOINT}`;
    console.log(`[trades-sync] POSTing to ${url}`);

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Internal-Token": INTERNAL_TOKEN,
    };

    if (SIGNING_SECRET) {
      headers["X-Signature"] = hmacSign(SIGNING_SECRET, body);
    }

    const resp = await fetch(url, { method: "POST", headers, body });

    const respBody = await resp.text();
    if (!resp.ok) {
      console.error(`[trades-sync] API error: HTTP ${resp.status}`, respBody);
      process.exit(1);
    }

    console.log(`[trades-sync] Success: ${respBody}`);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error("[trades-sync] Fatal error:", err);
  process.exit(1);
});
