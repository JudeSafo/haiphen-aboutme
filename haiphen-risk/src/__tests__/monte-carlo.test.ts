import { describe, it, expect } from "vitest";
import { runMonteCarlo } from "../monte-carlo";
import type { PortfolioAsset } from "../monte-carlo";

describe("Monte Carlo Simulation", () => {
  const samplePortfolio: PortfolioAsset[] = [
    { name: "US Equity", weight: 0.6, expected_return: 0.08, volatility: 0.20, current_value: 600000 },
    { name: "Bonds", weight: 0.3, expected_return: 0.04, volatility: 0.05, current_value: 300000 },
    { name: "Gold", weight: 0.1, expected_return: 0.02, volatility: 0.15, current_value: 100000 },
  ];

  it("should return correct number of iterations", () => {
    const result = runMonteCarlo(samplePortfolio, 100, 21, 0.95);
    expect(result.iterations).toBe(100);
    expect(result.simulated_returns.length).toBe(100);
  });

  it("should set correct horizon days", () => {
    const result = runMonteCarlo(samplePortfolio, 50, 10, 0.95);
    expect(result.horizon_days).toBe(10);
  });

  it("should generate per-asset simulations", () => {
    const result = runMonteCarlo(samplePortfolio, 50, 21, 0.95);
    expect(result.asset_simulations.size).toBe(3);
    expect(result.asset_simulations.get("US Equity")!.length).toBe(50);
    expect(result.asset_simulations.get("Bonds")!.length).toBe(50);
    expect(result.asset_simulations.get("Gold")!.length).toBe(50);
  });

  it("should produce returns with reasonable mean (not all zero or NaN)", () => {
    const result = runMonteCarlo(samplePortfolio, 1000, 21, 0.95);
    const mean = result.simulated_returns.reduce((a, b) => a + b, 0) / result.simulated_returns.length;
    expect(Number.isFinite(mean)).toBe(true);
    // Mean should be close to expected return over 21 days (small positive number)
    expect(Math.abs(mean)).toBeLessThan(1); // not absurd
  });

  it("should produce returns with some variance (not deterministic)", () => {
    const result = runMonteCarlo(samplePortfolio, 100, 21, 0.95);
    const unique = new Set(result.simulated_returns.map(r => r.toFixed(6)));
    expect(unique.size).toBeGreaterThan(1); // not all identical
  });

  it("should handle single-asset portfolio", () => {
    const single: PortfolioAsset[] = [
      { name: "Single", weight: 1.0, expected_return: 0.10, volatility: 0.25, current_value: 1000000 },
    ];
    const result = runMonteCarlo(single, 50, 21, 0.95);
    expect(result.simulated_returns.length).toBe(50);
    expect(result.asset_simulations.size).toBe(1);
  });
});
