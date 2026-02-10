// haiphen-risk/src/stress-test.ts — Scenario-based stress testing engine

import type { PortfolioAsset } from "./monte-carlo";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * A single stress scenario with per-sector or global shocks.
 */
export interface StressScenario {
  /** Human-readable name. */
  name: string;
  /** Description of the scenario. */
  description: string;
  /** Global portfolio shock multiplier (applied to all assets). */
  global_shock: number;
  /** Optional per-keyword overrides: if asset name contains the key,
   *  apply this multiplier *instead* of the global shock. */
  sector_shocks: Record<string, number>;
  /** Estimated probability of this scenario. */
  probability: number;
}

/**
 * Result of stress-testing a portfolio against one scenario.
 */
export interface StressResult {
  scenario_name: string;
  description: string;
  probability: number;
  /** Dollar impact on total portfolio. */
  portfolio_impact: number;
  /** Percentage impact on total portfolio. */
  portfolio_impact_pct: number;
  /** Per-asset impacts. */
  asset_impacts: {
    name: string;
    shock_applied: number;
    value_before: number;
    value_after: number;
    impact: number;
  }[];
}

/* ------------------------------------------------------------------ */
/*  Predefined scenarios                                              */
/* ------------------------------------------------------------------ */

export const PREDEFINED_SCENARIOS: StressScenario[] = [
  {
    name: "Market Crash (-30%)",
    description: "Broad market sell-off with equity drawdown of 30%, bonds partially offset, commodities mixed.",
    global_shock: -0.30,
    sector_shocks: {
      bond: -0.05,
      treasury: -0.02,
      gold: 0.10,
      cash: 0.0,
    },
    probability: 0.03,
  },
  {
    name: "Interest Rate Spike (+3%)",
    description: "Central bank raises rates by 300bp; bonds and rate-sensitive equities suffer, financials benefit.",
    global_shock: -0.10,
    sector_shocks: {
      bond: -0.20,
      treasury: -0.15,
      reit: -0.25,
      bank: 0.05,
      financial: 0.05,
      cash: 0.03,
    },
    probability: 0.10,
  },
  {
    name: "Sector Rotation",
    description: "Capital flows from growth/tech to value/cyclicals; mixed impact depending on portfolio tilt.",
    global_shock: -0.05,
    sector_shocks: {
      tech: -0.20,
      growth: -0.18,
      software: -0.15,
      energy: 0.12,
      industrial: 0.08,
      value: 0.10,
      healthcare: 0.03,
    },
    probability: 0.15,
  },
  {
    name: "Liquidity Crisis",
    description: "Credit markets freeze; illiquid assets see severe haircuts, flight to quality.",
    global_shock: -0.15,
    sector_shocks: {
      "high-yield": -0.35,
      "small-cap": -0.30,
      "emerging": -0.25,
      "private": -0.40,
      treasury: 0.05,
      gold: 0.08,
      cash: 0.0,
    },
    probability: 0.05,
  },
];

/* ------------------------------------------------------------------ */
/*  Stress testing logic                                              */
/* ------------------------------------------------------------------ */

/**
 * Determine which shock to apply to a given asset.
 *
 * If any keyword in `sector_shocks` appears as a substring (case-insensitive)
 * in the asset name, use that sector shock.  If multiple keywords match,
 * use the one with the largest absolute shock.  Otherwise fall back to
 * the global shock.
 */
function resolveShock(assetName: string, scenario: StressScenario): number {
  const lower = assetName.toLowerCase();
  let bestShock: number | null = null;

  for (const [keyword, shock] of Object.entries(scenario.sector_shocks)) {
    if (lower.includes(keyword.toLowerCase())) {
      if (bestShock === null || Math.abs(shock) > Math.abs(bestShock)) {
        bestShock = shock;
      }
    }
  }

  return bestShock !== null ? bestShock : scenario.global_shock;
}

/**
 * Run stress tests on a portfolio against a list of scenarios.
 *
 * For each scenario, each asset's value is shocked by the applicable
 * multiplier, and the aggregate portfolio impact is computed.
 *
 * @param portfolio The portfolio assets.
 * @param scenarios Optional custom scenarios; defaults to PREDEFINED_SCENARIOS.
 * @returns Array of StressResult, one per scenario.
 */
export function runStressTest(
  portfolio: PortfolioAsset[],
  scenarios?: StressScenario[],
): StressResult[] {
  const scenarioList = scenarios ?? PREDEFINED_SCENARIOS;
  const totalValue = portfolio.reduce((s, a) => s + a.current_value, 0);

  return scenarioList.map((scenario) => {
    const assetImpacts: StressResult["asset_impacts"] = [];
    let totalImpact = 0;

    for (const asset of portfolio) {
      const shock = resolveShock(asset.name, scenario);
      const valueBefore = asset.current_value;
      const valueAfter = valueBefore * (1 + shock);
      const impact = valueAfter - valueBefore;

      totalImpact += impact;

      assetImpacts.push({
        name: asset.name,
        shock_applied: shock,
        value_before: valueBefore,
        value_after: Math.round(valueAfter * 100) / 100,
        impact: Math.round(impact * 100) / 100,
      });
    }

    return {
      scenario_name: scenario.name,
      description: scenario.description,
      probability: scenario.probability,
      portfolio_impact: Math.round(totalImpact * 100) / 100,
      portfolio_impact_pct: totalValue > 0
        ? Math.round((totalImpact / totalValue) * 10000) / 10000
        : 0,
      asset_impacts: assetImpacts,
    };
  });
}
