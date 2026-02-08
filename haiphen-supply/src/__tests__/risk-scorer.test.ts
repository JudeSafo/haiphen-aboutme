import { describe, it, expect } from "vitest";
import { computeRiskScore } from "../risk-scorer";
import type { SupplierData } from "../risk-scorer";

describe("Risk Scorer", () => {
  const makeSupplier = (overrides: Partial<SupplierData> = {}): SupplierData => ({
    supplier_id: "sup-001",
    name: "Acme Corp",
    country: "US",
    region: "North America",
    tier: 1,
    categories: ["electronics"],
    financial_score: 75,
    geopolitical_score: 80,
    delivery_score: 70,
    single_source: false,
    ...overrides,
  });

  describe("computeRiskScore", () => {
    it("should return minimal risk for empty suppliers", () => {
      const result = computeRiskScore([]);
      expect(result.overall_score).toBe(0);
      expect(result.risk_level).toBe("minimal");
      expect(result.alerts).toHaveLength(0);
    });

    it("should compute risk score for healthy suppliers", () => {
      const result = computeRiskScore([
        makeSupplier({ financial_score: 90, geopolitical_score: 90, delivery_score: 90 }),
      ]);
      expect(result.overall_score).toBeLessThan(35); // low to minimal
      expect(["low", "minimal"]).toContain(result.risk_level);
    });

    it("should flag critical financial risk (score < 30)", () => {
      const result = computeRiskScore([
        makeSupplier({ financial_score: 20 }),
      ]);
      const finAlert = result.alerts.find(a => a.type === "financial" && a.severity === "critical");
      expect(finAlert).toBeDefined();
    });

    it("should flag high financial risk (score < 50)", () => {
      const result = computeRiskScore([
        makeSupplier({ financial_score: 40 }),
      ]);
      const finAlert = result.alerts.find(a => a.type === "financial" && a.severity === "high");
      expect(finAlert).toBeDefined();
    });

    it("should flag sanctioned countries", () => {
      const result = computeRiskScore([
        makeSupplier({ country: "RU" }),
      ]);
      const geoAlert = result.alerts.find(a => a.type === "geopolitical" && a.severity === "critical");
      expect(geoAlert).toBeDefined();
      expect(geoAlert!.title).toContain("Sanctioned");
    });

    it("should flag high-risk regions", () => {
      const result = computeRiskScore([
        makeSupplier({ region: "Eastern Europe", country: "UA" }),
      ]);
      const geoAlert = result.alerts.find(a => a.type === "geopolitical" && a.severity === "medium");
      expect(geoAlert).toBeDefined();
    });

    it("should flag poor delivery performance (score < 40)", () => {
      const result = computeRiskScore([
        makeSupplier({ delivery_score: 30 }),
      ]);
      const delAlert = result.alerts.find(a => a.type === "logistics");
      expect(delAlert).toBeDefined();
      expect(delAlert!.severity).toBe("high");
    });

    it("should flag single-source dependencies", () => {
      const result = computeRiskScore([
        makeSupplier({ single_source: true }),
      ]);
      const ssAlert = result.alerts.find(a => a.type === "single_source");
      expect(ssAlert).toBeDefined();
      expect(ssAlert!.severity).toBe("high");
    });

    it("should apply correct weights in breakdown", () => {
      const result = computeRiskScore([makeSupplier()]);
      expect(result.breakdown.financial.weight).toBe(0.30);
      expect(result.breakdown.geopolitical.weight).toBe(0.25);
      expect(result.breakdown.delivery.weight).toBe(0.25);
      expect(result.breakdown.single_source.weight).toBe(0.20);
    });

    it("should classify risk levels correctly", () => {
      // Very risky: all scores low, single source
      const critical = computeRiskScore([
        makeSupplier({ financial_score: 10, geopolitical_score: 10, delivery_score: 10, single_source: true }),
      ]);
      expect(critical.risk_level).toBe("critical");

      // Very safe: all scores high
      const minimal = computeRiskScore([
        makeSupplier({ financial_score: 95, geopolitical_score: 95, delivery_score: 95 }),
      ]);
      expect(["low", "minimal"]).toContain(minimal.risk_level);
    });

    it("should generate recommendations for single-source suppliers", () => {
      const result = computeRiskScore([
        makeSupplier({ single_source: true, name: "Critical Parts Inc" }),
      ]);
      expect(result.recommendations.some(r => r.includes("Critical Parts Inc"))).toBe(true);
    });

    it("should generate recommendations for weak financial suppliers", () => {
      const result = computeRiskScore([
        makeSupplier({ financial_score: 40, name: "Shaky Supplier" }),
      ]);
      expect(result.recommendations.some(r => r.includes("Shaky Supplier"))).toBe(true);
    });

    it("should average scores across multiple suppliers", () => {
      const result = computeRiskScore([
        makeSupplier({ financial_score: 100, supplier_id: "s1", name: "Good" }),
        makeSupplier({ financial_score: 0, supplier_id: "s2", name: "Bad" }),
      ]);
      // Average financial risk = (0 + 100) / 2 = 50
      expect(result.breakdown.financial.score).toBe(50);
    });
  });
});
