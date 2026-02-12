import { Client } from "pg";
import { createHmac } from "crypto";

// ---- Environment ----
const DATABASE_URL = process.env.DATABASE_URL || "";
const HAIPHEN_API_URL = (process.env.HAIPHEN_API_URL || "https://api.haiphen.io").replace(/\/$/, "");
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || "";
const SIGNING_SECRET = process.env.SIGNING_SECRET || "";
const MV_REPORT_TABLE = process.env.MV_REPORT_TABLE || "utils_statistics.daily_trade_summary_mv";

function todayYYYYMMDD(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function hmacSign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

async function main() {
  if (!DATABASE_URL) {
    console.error("[report-sync] DATABASE_URL is required");
    process.exit(1);
  }
  if (!INTERNAL_TOKEN) {
    console.error("[report-sync] INTERNAL_TOKEN is required");
    process.exit(1);
  }

  const date = todayYYYYMMDD();
  console.log(`[report-sync] Starting sync for ${date}`);

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();
  console.log("[report-sync] Connected to Postgres");

  try {
    // Query the daily trade summary MV for today
    const res = await pg.query(
      `SELECT
        report_date,
        total_pnl, win_rate, winners, losers, total_closed, zero_pnl,
        avg_win, avg_loss, total_entries, total_exits,
        p25_hold_secs, p50_hold_secs, p75_hold_secs, p90_hold_secs,
        avg_submit_ms, p90_submit_ms, avg_entry_slippage, avg_exit_slippage,
        total_calcs, all_passed, va_pass_rate, pass_liq, pass_edge,
        total_attenuated, attenuation_breakdown, deprecation_audit
      FROM ${MV_REPORT_TABLE}
      WHERE report_date = $1
      LIMIT 1`,
      [date]
    );

    if (res.rows.length === 0) {
      console.log(`[report-sync] No report row for ${date}, skipping`);
      return;
    }

    const row = res.rows[0];
    console.log(`[report-sync] Found report for ${date}`);

    // Build payload matching sendTradingReport() expected fields
    const payload = {
      report_date: date,
      total_pnl: Number(row.total_pnl ?? 0),
      win_rate: Number(row.win_rate ?? 0),
      winners: Number(row.winners ?? 0),
      losers: Number(row.losers ?? 0),
      total_closed: Number(row.total_closed ?? 0),
      zero_pnl: Number(row.zero_pnl ?? 0),
      avg_win: Number(row.avg_win ?? 0),
      avg_loss: Number(row.avg_loss ?? 0),
      total_entries: Number(row.total_entries ?? 0),
      total_exits: Number(row.total_exits ?? 0),
      p25_hold_secs: Number(row.p25_hold_secs ?? 0),
      p50_hold_secs: Number(row.p50_hold_secs ?? 0),
      p75_hold_secs: Number(row.p75_hold_secs ?? 0),
      p90_hold_secs: Number(row.p90_hold_secs ?? 0),
      avg_submit_ms: Number(row.avg_submit_ms ?? 0),
      p90_submit_ms: Number(row.p90_submit_ms ?? 0),
      avg_entry_slippage: Number(row.avg_entry_slippage ?? 0),
      avg_exit_slippage: Number(row.avg_exit_slippage ?? 0),
      total_calcs: Number(row.total_calcs ?? 0),
      all_passed: Number(row.all_passed ?? 0),
      va_pass_rate: Number(row.va_pass_rate ?? 0),
      pass_liq: Number(row.pass_liq ?? 0),
      pass_edge: Number(row.pass_edge ?? 0),
      total_attenuated: Number(row.total_attenuated ?? 0),
      attenuation_breakdown: row.attenuation_breakdown ?? {},
      deprecation_audit: row.deprecation_audit ?? {},
      source: "gke-report-sync",
      synced_at: new Date().toISOString(),
    };

    // POST to haiphen-api with HMAC signature
    const url = `${HAIPHEN_API_URL}/v1/internal/trading-report`;
    console.log(`[report-sync] POSTing to ${url}`);

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
      console.error(`[report-sync] API error: HTTP ${resp.status}`, respBody);
      process.exit(1);
    }

    console.log(`[report-sync] Success: ${respBody}`);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error("[report-sync] Fatal error:", err);
  process.exit(1);
});
