import { describe, it, expect } from "vitest";
import { computeVaR, computeCVaR, computeMaxDrawdown, computeSharpeRatio, computeAllMetrics } from "../var-engine";

describe("VaR Engine", () => {
  // Known distribution: sorted values from -0.10 to 0.10
  const simulations = [-0.10, -0.08, -0.06, -0.04, -0.02, 0.00, 0.02, 0.04, 0.06, 0.08, 0.10];

  describe("computeVaR", () => {
    it("should return 0 for empty array", () => {
      expect(computeVaR([], 0.95)).toBe(0);
    });

    it("should compute VaR at 95% confidence", () => {
      const var95 = computeVaR(simulations, 0.95);
      // 5% of 11 = index 0 (floor), which is -0.10
      expect(var95).toBeLessThan(0);
    });

    it("should produce more severe VaR at higher confidence", () => {
      const var90 = computeVaR(simulations, 0.90);
      const var99 = computeVaR(simulations, 0.99);
      expect(var99).toBeLessThanOrEqual(var90);
    });
  });

  describe("computeCVaR", () => {
    it("should return 0 for empty array", () => {
      expect(computeCVaR([], 0.95)).toBe(0);
    });

    it("should be more severe (more negative) than VaR", () => {
      const largerSim = Array.from({ length: 1000 }, (_, i) => (i / 1000) * 0.4 - 0.2);
      const var95 = computeVaR(largerSim, 0.95);
      const cvar95 = computeCVaR(largerSim, 0.95);
      expect(cvar95).toBeLessThanOrEqual(var95);
    });
  });

  describe("computeMaxDrawdown", () => {
    it("should return 0 for empty array", () => {
      expect(computeMaxDrawdown([])).toBe(0);
    });

    it("should compute positive drawdown from simulated returns", () => {
      const dd = computeMaxDrawdown(simulations);
      expect(dd).toBeGreaterThan(0);
      expect(dd).toBeLessThanOrEqual(1);
    });

    it("should return higher drawdown for more volatile returns", () => {
      const narrow = [0.01, 0.02, -0.01, 0.03, -0.02];
      const wide = [0.10, -0.20, 0.15, -0.30, 0.05];
      expect(computeMaxDrawdown(wide)).toBeGreaterThan(computeMaxDrawdown(narrow));
    });
  });

  describe("computeSharpeRatio", () => {
    it("should return 0 for empty or single-element array", () => {
      expect(computeSharpeRatio([])).toBe(0);
      expect(computeSharpeRatio([0.05])).toBe(0);
    });

    it("should return finite number for valid inputs", () => {
      const sharpe = computeSharpeRatio(simulations, 0.04, 21);
      expect(Number.isFinite(sharpe)).toBe(true);
    });

    it("should return 0 when all returns are identical", () => {
      const flat = [0.01, 0.01, 0.01, 0.01];
      expect(computeSharpeRatio(flat)).toBe(0);
    });
  });

  describe("computeAllMetrics", () => {
    it("should return all four risk metrics", () => {
      const metrics = computeAllMetrics(simulations, 0.95);
      expect(metrics).toHaveProperty("var_value");
      expect(metrics).toHaveProperty("cvar_value");
      expect(metrics).toHaveProperty("max_drawdown");
      expect(metrics).toHaveProperty("sharpe_ratio");
    });
  });
});
