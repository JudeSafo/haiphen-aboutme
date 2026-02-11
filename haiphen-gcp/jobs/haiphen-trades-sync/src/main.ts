import { Client } from "pg";
import { createHmac } from "crypto";

// ---- Environment ----
const DATABASE_URL = process.env.DATABASE_URL || "";
const HAIPHEN_API_URL = (process.env.HAIPHEN_API_URL || "https://api.haiphen.io").replace(/\/$/, "");
const SNAPSHOT_ENDPOINT = process.env.SNAPSHOT_ENDPOINT || "/v1/internal/trades/snapshot";
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || "";
const SIGNING_SECRET = process.env.SIGNING_SECRET || "";

const MV_KPI_TABLE = process.env.MV_KPI_TABLE || "utils_statistics.daily_trade_kpis_mv";
const MV_SERIES_TABLE = process.env.MV_SERIES_TABLE || "utils_statistics.daily_trade_series_mv";
const MV_EXTREMES_TABLE = process.env.MV_EXTREMES_TABLE || "utils_statistics.daily_trade_extremes_mv";
const MV_PORTFOLIO_TABLE = process.env.MV_PORTFOLIO_TABLE || "utils_statistics.daily_trade_portfolio_mv";

function todayYYYYMMDD(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function hmacSign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
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
    // 1) KPI rows
    const kpiRes = await pg.query(
      `SELECT kpi_name AS kpi, display_value AS value FROM ${MV_KPI_TABLE} WHERE report_date = $1 ORDER BY sort_order ASC`,
      [date]
    );
    const rows = kpiRes.rows.map((r: any) => ({ kpi: r.kpi, value: r.value }));
    console.log(`[trades-sync] KPIs: ${rows.length} rows`);

    // 2) Series points
    const seriesRes = await pg.query(
      `SELECT kpi_name, ts, value, source FROM ${MV_SERIES_TABLE} WHERE report_date = $1 ORDER BY kpi_name, ts ASC`,
      [date]
    );
    const seriesByKpi: Record<string, Array<{ t: string; v: number; src?: string }>> = {};
    for (const r of seriesRes.rows) {
      const kpi = r.kpi_name;
      if (!seriesByKpi[kpi]) seriesByKpi[kpi] = [];
      const pt: { t: string; v: number; src?: string } = { t: r.ts, v: Number(r.value) };
      if (r.source) pt.src = r.source;
      seriesByKpi[kpi].push(pt);
    }
    console.log(`[trades-sync] Series: ${seriesRes.rows.length} points across ${Object.keys(seriesByKpi).length} KPIs`);

    // 3) Extremes
    const extremesRes = await pg.query(
      `SELECT kpi_name, side, rank, trade_id, symbol, contract_name,
              metric_raw, metric_abs, individual_pnl, abs_individual_pnl,
              percent_change, cost_basis, qty,
              bid_price, ask_price, mid_price, mid_ts,
              mid_mark_pnl, liquidity_drag
       FROM ${MV_EXTREMES_TABLE}
       WHERE report_date = $1
       ORDER BY kpi_name, side, rank ASC`,
      [date]
    );
    const byKpi: Record<string, { hi: any[]; lo: any[] }> = {};
    for (const r of extremesRes.rows) {
      const kpi = r.kpi_name;
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

    // 4) Portfolio assets
    const portfolioRes = await pg.query(
      `SELECT trade_id, symbol, contract_name FROM ${MV_PORTFOLIO_TABLE} WHERE report_date = $1 ORDER BY trade_id DESC`,
      [date]
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
      summary: "",
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
