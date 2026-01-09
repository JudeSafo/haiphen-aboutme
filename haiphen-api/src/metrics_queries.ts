// haiphen-api/src/metrics_queries.ts
export async function getKpis(env: { DB: D1Database }, date: string) {
  const rows = await env.DB.prepare(`
    SELECT kpi, value_text, value_num, value_kind
    FROM metrics_kpi_values
    WHERE date = ?
    ORDER BY kpi ASC
  `).bind(date).all<{ kpi: string; value_text: string; value_num: number | null; value_kind: string }>();

  return rows.results ?? [];
}

export async function getSeries(env: { DB: D1Database }, date: string, kpi: string, from?: string, to?: string, limit = 500) {
  const lim = Math.min(2000, Math.max(1, limit));

  // build query dynamically but safely
  let sql = `
    SELECT t, v, src
    FROM metrics_series_points
    WHERE date = ? AND kpi = ?
  `;
  const binds: any[] = [date, kpi];

  if (from) { sql += ` AND t >= ?`; binds.push(from); }
  if (to) { sql += ` AND t <= ?`; binds.push(to); }

  sql += ` ORDER BY t ASC LIMIT ?`;
  binds.push(lim);

  const rows = await env.DB.prepare(sql).bind(...binds).all<{ t: string; v: number; src: string | null }>();
  return rows.results ?? [];
}

export async function getExtremes(env: { DB: D1Database }, date: string, kpi: string, side: "hi" | "lo", limit = 10) {
  const lim = Math.min(50, Math.max(1, limit));

  const rows = await env.DB.prepare(`
    SELECT
      rank, trade_id, symbol, contract_name,
      metric_raw, metric_abs, individual_pnl, abs_individual_pnl,
      percent_change, cost_basis, qty,
      bid_price, ask_price, mid_price, mid_ts,
      mid_mark_pnl, liquidity_drag,
      item_json
    FROM metrics_extremes_items
    WHERE date = ? AND kpi = ? AND side = ?
    ORDER BY rank ASC
    LIMIT ?
  `).bind(date, kpi, side, lim).all<any>();

  return (rows.results ?? []).map(r => ({
    ...r,
    item: JSON.parse(r.item_json)
  }));
}

export async function getPortfolioAssets(env: { DB: D1Database }, date: string, symbol?: string, limit = 200) {
  const lim = Math.min(2000, Math.max(1, limit));

  if (symbol) {
    const rows = await env.DB.prepare(`
      SELECT trade_id, symbol, contract_name
      FROM metrics_portfolio_assets
      WHERE date = ? AND symbol = ?
      ORDER BY trade_id DESC
      LIMIT ?
    `).bind(date, symbol, lim).all<any>();
    return rows.results ?? [];
  }

  const rows = await env.DB.prepare(`
    SELECT trade_id, symbol, contract_name
    FROM metrics_portfolio_assets
    WHERE date = ?
    ORDER BY trade_id DESC
    LIMIT ?
  `).bind(date, lim).all<any>();

  return rows.results ?? [];
}