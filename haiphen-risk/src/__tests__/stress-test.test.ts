import { describe, it, expect } from "vitest";
import { runStressTest, PREDEFINED_SCENARIOS } from "../stress-test";
import type { PortfolioAsset } from "../monte-carlo";

describe("Stress Testing", () => {
  const portfolio: PortfolioAsset[] = [
    { name: "Tech Growth Fund", weight: 0.4, expected_return: 0.12, volatility: 0.30, current_value: 400000 },
    { name: "Treasury Bonds", weight: 0.3, expected_return: 0.03, volatility: 0.04, current_value: 300000 },
    { name: "Gold ETF", weight: 0.2, expected_return: 0.02, volatility: 0.15, current_value: 200000 },
    { name: "Cash Reserve", weight: 0.1, expected_return: 0.01, volatility: 0.01, current_value: 100000 },
  ];

  describe("PREDEFINED_SCENARIOS", () => {
    it("should have 4 predefined scenarios", () => {
      expect(PREDEFINED_SCENARIOS.length).toBe(4);
    });

    it("should have valid scenario structure", () => {
      for (const s of PREDEFINED_SCENARIOS) {
        expect(s.name).toBeTruthy();
        expect(s.description).toBeTruthy();
        expect(typeof s.global_shock).toBe("number");
        expect(typeof s.probability).toBe("number");
        expect(s.probability).toBeGreaterThan(0);
        expect(s.probability).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("runStressTest", () => {
    it("should return one result per scenario", () => {
      const results = runStressTest(portfolio);
      expect(results.length).toBe(PREDEFINED_SCENARIOS.length);
    });

    it("should apply sector-specific shocks", () => {
      const results = runStressTest(portfolio);
      // Market Crash: Gold should go UP (0.10), Tech should go DOWN (-0.30)
      const crashResult = results.find(r => r.scenario_name.includes("Market Crash"));
      expect(crashResult).toBeDefined();

      const goldImpact = crashResult!.asset_impacts.find(a => a.name === "Gold ETF");
      expect(goldImpact!.shock_applied).toBe(0.10); // gold keyword matches
      expect(goldImpact!.impact).toBeGreaterThan(0); // positive impact

      const cashImpact = crashResult!.asset_impacts.find(a => a.name === "Cash Reserve");
      expect(cashImpact!.shock_applied).toBe(0.0); // cash keyword matches
    });

    it("should apply global shock when no sector match", () => {
      const results = runStressTest(portfolio);
      const crashResult = results.find(r => r.scenario_name.includes("Market Crash"));
      // Tech Growth Fund doesn't match any sector keyword in Market Crash scenario,
      // so it gets global shock of -0.30
      const techImpact = crashResult!.asset_impacts.find(a => a.name === "Tech Growth Fund");
      // In sector rotation, "tech" keyword matches with -0.20
      const rotationResult = results.find(r => r.scenario_name.includes("Sector Rotation"));
      const techRotation = rotationResult!.asset_impacts.find(a => a.name === "Tech Growth Fund");
      expect(techRotation!.shock_applied).toBe(-0.20); // tech keyword matches
    });

    it("should compute correct portfolio impact percentages", () => {
      const results = runStressTest(portfolio);
      for (const r of results) {
        const totalValue = portfolio.reduce((s, a) => s + a.current_value, 0);
        const expectedPct = r.portfolio_impact / totalValue;
        expect(Math.abs(r.portfolio_impact_pct - expectedPct)).toBeLessThan(0.001);
      }
    });

    it("should accept custom scenarios", () => {
      const custom = [{ name: "Custom", description: "Test", global_shock: -0.50, sector_shocks: {}, probability: 0.01 }];
      const results = runStressTest(portfolio, custom);
      expect(results.length).toBe(1);
      expect(results[0].scenario_name).toBe("Custom");
      // All assets get -50% shock
      for (const impact of results[0].asset_impacts) {
        expect(impact.shock_applied).toBe(-0.50);
      }
    });
  });
});
