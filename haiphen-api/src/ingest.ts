// haiphen-api/src/ingest.ts
import { json } from "./crypto";

export type NormalizedTradesJson = {
  date: string;
  updated_at: string;
  headline: string;
  summary: string;
  rows: Array<{ kpi: string; value: string }>;
  overlay: {
    seriesByKpi: Record<string, Array<{ t: string; v: number; src?: string }>>;
    extremes: {
      byKpi?: Record<string, { hi?: unknown[]; lo?: unknown[]; items?: unknown[] }>;
      legacyKpi?: string;
      source?: string;
    };
    portfolioAssets: Array<{ trade_id: number; symbol: string | null; contract_name: string }>;
  };
  source?: string;
};

// ---- normalizeTradesJson (ADD THIS; do not remove existing code) ----

function _isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function _asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function _mustString(v: unknown, field: string): string {
  const s = _asString(v).trim();
  if (!s) throw new Error(`normalizeTradesJson: missing/invalid ${field}`);
  return s;
}

/**
 * Normalize inbound trades.json into the stable shape expected by D1 ingestion.
 */
export function normalizeTradesJson(payload: unknown): NormalizedTradesJson {
  if (!_isObj(payload)) throw new Error("normalizeTradesJson: payload must be an object");

  const date = _mustString(payload.date, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("normalizeTradesJson: date must be YYYY-MM-DD");
  }

  const updated_at = _asString(payload.updated_at).trim() || new Date().toISOString();
  const headline = _asString(payload.headline).trim() || `Haiphen metrics for ${date}`;
  const summary = _asString(payload.summary).trim() || "";

  const rawRows = Array.isArray((payload as any).rows)
    ? (payload as any).rows
    : Array.isArray((payload as any).kpis)
      ? (payload as any).kpis
      : [];

  const rows: Array<{ kpi: string; value: string }> = [];
  for (const r of rawRows) {
    if (!_isObj(r)) continue;
    const kpi = (_asString((r as any).kpi) || _asString((r as any).name) || _asString((r as any).label)).trim();
    const value = _asString((r as any).value ?? (r as any).val ?? (r as any).text).trim();
    if (!kpi) continue;
    rows.push({ kpi, value });
  }

  const overlayRaw = _isObj((payload as any).overlay) ? (payload as any).overlay : {};

  const seriesByKpiRaw =
    (_isObj((overlayRaw as any).seriesByKpi) ? (overlayRaw as any).seriesByKpi :
     _isObj((overlayRaw as any).series) ? (overlayRaw as any).series :
     {}) as Record<string, any>;

  const seriesByKpi: Record<string, Array<{ t: string; v: number; src?: string }>> = {};
  for (const [kpi, pts] of Object.entries(seriesByKpiRaw ?? {})) {
    if (!Array.isArray(pts)) continue;
    const normPts: Array<{ t: string; v: number; src?: string }> = [];

    for (const p of pts) {
      if (!_isObj(p)) continue;
      const t = _asString((p as any).t ?? (p as any).time ?? (p as any).ts).trim();
      const vRaw = (p as any).v ?? (p as any).value;
      const v = typeof vRaw === "number" ? vRaw : Number(vRaw);
      if (!t || !Number.isFinite(v)) continue;
      const src = _asString((p as any).src).trim() || undefined;
      normPts.push(src ? { t, v, src } : { t, v });
    }

    if (normPts.length) seriesByKpi[kpi] = normPts;
  }

  const extremesRaw = _isObj((overlayRaw as any).extremes) ? (overlayRaw as any).extremes : {};
  const byKpi = _isObj((extremesRaw as any).byKpi) ? (extremesRaw as any).byKpi : undefined;

  const extremes = {
    byKpi: byKpi as Record<string, { hi?: unknown[]; lo?: unknown[]; items?: unknown[] }> | undefined,
    legacyKpi: _asString((extremesRaw as any).legacyKpi).trim() || undefined,
    source: _asString((extremesRaw as any).source).trim() || undefined
  };

  const assetsRaw = Array.isArray((overlayRaw as any).portfolioAssets)
    ? (overlayRaw as any).portfolioAssets
    : Array.isArray((overlayRaw as any).assets)
      ? (overlayRaw as any).assets
      : [];

  const portfolioAssets: Array<{ trade_id: number; symbol: string | null; contract_name: string }> = [];
  for (const a of assetsRaw) {
    if (!_isObj(a)) continue;

    const tradeIdRaw = (a as any).trade_id ?? (a as any).tradeId ?? (a as any).id;
    const trade_id = typeof tradeIdRaw === "number" ? Math.trunc(tradeIdRaw) : Math.trunc(Number(tradeIdRaw));

    const contract_name = _asString((a as any).contract_name ?? (a as any).contractName ?? (a as any).contract).trim();
    const symbol = _asString((a as any).symbol).trim() || null;

    if (!Number.isFinite(trade_id) || !contract_name) continue;
    portfolioAssets.push({ trade_id, symbol, contract_name });
  }

  const source = _asString((payload as any).source).trim() || undefined;

  return {
    date,
    updated_at,
    headline,
    summary,
    rows,
    overlay: { seriesByKpi, extremes, portfolioAssets },
    source
  };
}

function parseNumericValue(raw: string): { value_num: number | null; value_kind: "number" | "percent" | "text" } {
  const s = String(raw ?? "").trim();
  if (!s) return { value_num: null, value_kind: "text" };

  // percent
  if (/%$/.test(s)) {
    const n = Number(s.replace(/[%+,]/g, "").trim());
    return Number.isFinite(n) ? { value_num: n, value_kind: "percent" } : { value_num: null, value_kind: "text" };
  }

  // plain number-ish (allow commas, leading +/-, decimals)
  const numish = s.replace(/,/g, "").trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(numish)) {
    const n = Number(numish);
    return Number.isFinite(n) ? { value_num: n, value_kind: "number" } : { value_num: null, value_kind: "text" };
  }

  return { value_num: null, value_kind: "text" };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}

function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  if (n === null) return null;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function upsertMetricsDaily(env: { DB: D1Database }, payload: NormalizedTradesJson): Promise<void> {
  const date = payload.date;

  // 1) Upsert archive row (source of truth)
  await env.DB.prepare(`
    INSERT INTO metrics_daily(date, updated_at, headline, summary, rows_json, overlay_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      updated_at=excluded.updated_at,
      headline=excluded.headline,
      summary=excluded.summary,
      rows_json=excluded.rows_json,
      overlay_json=excluded.overlay_json
  `).bind(
    payload.date,
    payload.updated_at,
    payload.headline,
    payload.summary,
    json(payload.rows),
    json(payload.overlay)
  ).run();

  // 2) Clear derived tables for this date (idempotent refresh)
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM metrics_kpi_values WHERE date = ?`).bind(date),
    env.DB.prepare(`DELETE FROM metrics_series_points WHERE date = ?`).bind(date),
    env.DB.prepare(`DELETE FROM metrics_extremes_items WHERE date = ?`).bind(date),
    env.DB.prepare(`DELETE FROM metrics_portfolio_assets WHERE date = ?`).bind(date),
  ]);

  // 3) Rebuild derived tables (chunked)
  const stmts: D1PreparedStatement[] = [];

  // KPI rows
  for (const r of payload.rows ?? []) {
    const kpi = String(r?.kpi ?? "").trim();
    const value_text = String(r?.value ?? "").trim();
    if (!kpi) continue;

    const parsed = parseNumericValue(value_text);
    stmts.push(
      env.DB.prepare(`
        INSERT INTO metrics_kpi_values(date, kpi, value_text, value_num, value_kind)
        VALUES (?, ?, ?, ?, ?)
      `).bind(date, kpi, value_text, parsed.value_num, parsed.value_kind)
    );
  }

  // Series points
  const sbk = payload.overlay?.seriesByKpi ?? {};
  for (const [kpi, points] of Object.entries(sbk)) {
    if (!kpi || !Array.isArray(points)) continue;
    for (const p of points) {
      const t = strOrNull((p as any)?.t);
      const v = numOrNull((p as any)?.v);
      const src = strOrNull((p as any)?.src);
      if (!t || v === null) continue;

      stmts.push(
        env.DB.prepare(`
          INSERT INTO metrics_series_points(date, kpi, t, v, src)
          VALUES (?, ?, ?, ?, ?)
        `).bind(date, kpi, t, v, src)
      );
    }
  }

  // Extremes items
  const byKpi = payload.overlay?.extremes?.byKpi ?? {};
  for (const [kpi, v] of Object.entries(byKpi)) {
    const obj = asRecord(v);
    if (!kpi || !obj) continue;

    const hi = Array.isArray(obj.hi) ? obj.hi : [];
    const lo = Array.isArray(obj.lo) ? obj.lo : [];

    const insertOne = (side: "hi" | "lo", item: unknown, rank: number) => {
      const rec = asRecord(item) ?? {};
      const trade_id = intOrNull(rec.trade_id);
      const symbol = strOrNull(rec.symbol);
      const contract_name = strOrNull(rec.contract_name) ?? "";
      if (!contract_name) return;

      stmts.push(
        env.DB.prepare(`
          INSERT INTO metrics_extremes_items(
            date, kpi, side, rank,
            trade_id, symbol, contract_name,
            metric_raw, metric_abs,
            individual_pnl, abs_individual_pnl,
            percent_change, cost_basis, qty,
            bid_price, ask_price, mid_price, mid_ts,
            mid_mark_pnl, liquidity_drag,
            item_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          date,
          kpi,
          side,
          rank,
          trade_id,
          symbol,
          contract_name,
          numOrNull(rec.metric_raw),
          numOrNull(rec.metric_abs),
          numOrNull(rec.individual_pnl),
          numOrNull(rec.abs_individual_pnl),
          numOrNull(rec.percent_change),
          numOrNull(rec.cost_basis),
          numOrNull(rec.qty),
          numOrNull(rec.bid_price),
          numOrNull(rec.ask_price),
          numOrNull(rec.mid_price),
          strOrNull(rec.mid_ts),
          numOrNull(rec.mid_mark_pnl),
          numOrNull(rec.liquidity_drag),
          JSON.stringify(item)
        )
      );
    };

    for (let i = 0; i < hi.length; i++) insertOne("hi", hi[i], i + 1);
    for (let i = 0; i < lo.length; i++) insertOne("lo", lo[i], i + 1);
  }

  // Portfolio assets
  for (const a of payload.overlay?.portfolioAssets ?? []) {
    const trade_id = intOrNull((a as any)?.trade_id);
    const contract_name = strOrNull((a as any)?.contract_name);
    const symbol = strOrNull((a as any)?.symbol);
    if (trade_id === null || !contract_name) continue;

    stmts.push(
      env.DB.prepare(`
        INSERT INTO metrics_portfolio_assets(date, trade_id, symbol, contract_name)
        VALUES (?, ?, ?, ?)
      `).bind(date, trade_id, symbol, contract_name)
    );
  }

  const chunkSize = 200;
  for (let i = 0; i < stmts.length; i += chunkSize) {
    await env.DB.batch(stmts.slice(i, i + chunkSize));
  }
}