import { NormalizedTradesJson } from "./ingest";

export type TelemetryContractSelector = {
  mode: "auto" | "manual";
  contract_name?: string | null;
  symbol?: string | null;
};

export type TelemetryThresholds = {
  entry_threshold: number;
  exit_threshold: number;
  neutral_band: number;
  weights: Record<string, number>;
};

export type TelemetryConfig = {
  contract_selector: TelemetryContractSelector;
  thresholds: TelemetryThresholds;
};

export type TelemetrySignal = {
  signal_type: "entry" | "exit" | "neutral";
  score: number;
  summary: string;
  contract_name: string;
  symbol?: string | null;
  metrics: Record<string, unknown>;
};

const DEFAULT_WEIGHTS: Record<string, number> = {
  Delta: 0.3,
  Gamma: 0.2,
  Theta: 0.15,
  Vega: 0.15,
  "IV Skew": 0.1,
  "Liquidity Ratios": 0.1,
};

export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  contract_selector: { mode: "auto" },
  thresholds: {
    entry_threshold: 0.55,
    exit_threshold: 0.55,
    neutral_band: 0.2,
    weights: { ...DEFAULT_WEIGHTS },
  },
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getMetricAbs(item: Record<string, any>): number | null {
  const candidates = [
    item.metric_abs,
    item.abs_individual_pnl,
    item.metric_raw,
    item.individual_pnl,
  ];
  for (const c of candidates) {
    const n = toNumber(c);
    if (n != null) return Math.abs(n);
  }
  return null;
}

function kpiItems(group: any): any[] {
  if (!group) return [];
  if (Array.isArray(group.items)) return group.items;
  const hi = Array.isArray(group.hi) ? group.hi : [];
  const lo = Array.isArray(group.lo) ? group.lo : [];
  return [...hi, ...lo];
}

function normalizeConfig(input: any): TelemetryConfig {
  const cfg: TelemetryConfig = JSON.parse(JSON.stringify(DEFAULT_TELEMETRY_CONFIG));

  if (isObj(input?.contract_selector)) {
    const mode = String(input.contract_selector.mode || "").toLowerCase();
    cfg.contract_selector.mode = mode === "manual" ? "manual" : "auto";
    if (input.contract_selector.contract_name) {
      cfg.contract_selector.contract_name = String(input.contract_selector.contract_name);
    }
    if (input.contract_selector.symbol) {
      cfg.contract_selector.symbol = String(input.contract_selector.symbol);
    }
  }

  if (isObj(input?.thresholds)) {
    const t = input.thresholds as Record<string, unknown>;
    const entry = toNumber(t.entry_threshold);
    const exit = toNumber(t.exit_threshold);
    const neutral = toNumber(t.neutral_band);
    if (entry != null) cfg.thresholds.entry_threshold = entry;
    if (exit != null) cfg.thresholds.exit_threshold = exit;
    if (neutral != null) cfg.thresholds.neutral_band = neutral;

    if (isObj(t.weights)) {
      const w: Record<string, number> = {};
      for (const [k, v] of Object.entries(t.weights)) {
        const n = toNumber(v);
        if (n != null) w[String(k)] = n;
      }
      if (Object.keys(w).length) cfg.thresholds.weights = w;
    }
  }

  return cfg;
}

export function mergeTelemetryConfig(input: any): TelemetryConfig {
  return normalizeConfig(input);
}

export function selectContract(trades: NormalizedTradesJson, cfg: TelemetryConfig): {
  contract_name: string;
  symbol?: string | null;
  metricsByKpi: Record<string, any>;
  maxAbsByKpi: Record<string, number>;
} | null {
  const byKpi = trades.overlay?.extremes?.byKpi || {};
  const maxAbsByKpi: Record<string, number> = {};
  const contracts: Record<string, { contract_name: string; symbol?: string | null; metricsByKpi: Record<string, any> }> = {};

  for (const [kpi, group] of Object.entries(byKpi)) {
    const items = kpiItems(group);
    let maxAbs = 0;
    for (const item of items) {
      if (!isObj(item)) continue;
      const contract = String((item as any).contract_name || "").trim();
      if (!contract) continue;
      const absVal = getMetricAbs(item) ?? 0;
      if (absVal > maxAbs) maxAbs = absVal;

      const existing = contracts[contract] || { contract_name: contract, symbol: (item as any).symbol ?? null, metricsByKpi: {} };
      const existingItem = existing.metricsByKpi[kpi];
      const currentRank = toNumber((item as any).rank) ?? 9999;
      const existingRank = existingItem ? (toNumber(existingItem.rank) ?? 9999) : 9999;
      if (!existingItem || currentRank < existingRank) {
        existing.metricsByKpi[kpi] = item;
      }
      contracts[contract] = existing;
    }
    if (maxAbs > 0) maxAbsByKpi[kpi] = maxAbs;
  }

  const contractList = Object.values(contracts);
  if (!contractList.length) return null;

  if (cfg.contract_selector.mode === "manual") {
    const byName = cfg.contract_selector.contract_name
      ? contracts[cfg.contract_selector.contract_name]
      : null;
    if (byName) {
      return { contract_name: byName.contract_name, symbol: byName.symbol ?? null, metricsByKpi: byName.metricsByKpi, maxAbsByKpi };
    }

    if (cfg.contract_selector.symbol) {
      const symbol = cfg.contract_selector.symbol.toUpperCase();
      const match = contractList.find(c => String(c.symbol || "").toUpperCase() === symbol);
      if (match) {
        return { contract_name: match.contract_name, symbol: match.symbol ?? null, metricsByKpi: match.metricsByKpi, maxAbsByKpi };
      }
    }
  }

  // Auto selection: prefer max abs Daily PnL if available
  const pnlGroup = (byKpi as any)["Daily PnL"];
  if (pnlGroup) {
    let best: any = null;
    let bestAbs = -1;
    for (const item of kpiItems(pnlGroup)) {
      if (!isObj(item)) continue;
      const contract = String((item as any).contract_name || "").trim();
      if (!contract) continue;
      const absVal = getMetricAbs(item) ?? 0;
      if (absVal > bestAbs) {
        bestAbs = absVal;
        best = contracts[contract];
      }
    }
    if (best) {
      return { contract_name: best.contract_name, symbol: best.symbol ?? null, metricsByKpi: best.metricsByKpi, maxAbsByKpi };
    }
  }

  // Fallback: pick contract with highest aggregate metric magnitude
  let top = contractList[0];
  let topScore = -1;
  for (const c of contractList) {
    let sum = 0;
    for (const item of Object.values(c.metricsByKpi)) {
      if (!isObj(item)) continue;
      const absVal = getMetricAbs(item as any) ?? 0;
      sum += absVal;
    }
    if (sum > topScore) {
      topScore = sum;
      top = c;
    }
  }

  return { contract_name: top.contract_name, symbol: top.symbol ?? null, metricsByKpi: top.metricsByKpi, maxAbsByKpi };
}

export function computeTelemetrySignal(trades: NormalizedTradesJson, cfgInput: any): TelemetrySignal {
  const cfg = mergeTelemetryConfig(cfgInput);
  const selected = selectContract(trades, cfg);
  if (!selected) {
    return {
      signal_type: "neutral",
      score: 0,
      summary: "No contract data available for telemetry evaluation.",
      contract_name: "unknown",
      symbol: null,
      metrics: { reason: "no_contracts" },
    };
  }

  const weights = cfg.thresholds.weights || DEFAULT_WEIGHTS;
  const maxAbsByKpi = selected.maxAbsByKpi;

  let score = 0;
  const contributions: Record<string, any> = {};

  for (const [kpi, weightRaw] of Object.entries(weights)) {
    const weight = toNumber(weightRaw) ?? 0;
    if (!weight) continue;
    const item = selected.metricsByKpi[kpi];
    if (!item) continue;

    const side = String((item as any).side || "hi").toLowerCase();
    const sign = side === "lo" ? -1 : 1;
    const absVal = getMetricAbs(item as any) ?? 0;
    const denom = maxAbsByKpi[kpi] || absVal || 1;
    const norm = denom ? absVal / denom : 0;
    const rank = toNumber((item as any).rank) ?? 1;
    const rankWeight = rank > 0 ? 1 / rank : 1;

    const contrib = weight * sign * norm * rankWeight;
    score += contrib;

    contributions[kpi] = {
      weight,
      side,
      rank,
      absVal,
      maxAbs: denom,
      norm,
      contrib,
    };
  }

  const entryT = cfg.thresholds.entry_threshold;
  const exitT = cfg.thresholds.exit_threshold;

  let signal: "entry" | "exit" | "neutral" = "neutral";
  if (score >= entryT) signal = "entry";
  else if (score <= -exitT) signal = "exit";

  const term = signal === "entry" ? "pricing into" : signal === "exit" ? "pricing into" : "neutral";
  const summary = signal === "neutral"
    ? `${selected.contract_name} is neutral; no actionable edge detected.`
    : `${selected.contract_name} is ${term} a favorable position for ${signal}.`;

  return {
    signal_type: signal,
    score: Number(score.toFixed(4)),
    summary,
    contract_name: selected.contract_name,
    symbol: selected.symbol ?? null,
    metrics: {
      contract: selected.contract_name,
      symbol: selected.symbol ?? null,
      weights,
      contributions,
      thresholds: cfg.thresholds,
    },
  };
}
