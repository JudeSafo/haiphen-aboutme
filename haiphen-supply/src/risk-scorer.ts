// risk-scorer.ts — Multi-factor weighted risk scoring for supply chain intelligence

export interface SupplierData {
  supplier_id: string;
  name: string;
  country: string | null;
  region: string | null;
  tier: number;
  categories: string[];
  financial_score: number;
  geopolitical_score: number;
  delivery_score: number;
  single_source: boolean;
}

export interface RiskBreakdown {
  financial: { score: number; weight: number; weighted: number; factors: string[] };
  geopolitical: { score: number; weight: number; weighted: number; factors: string[] };
  delivery: { score: number; weight: number; weighted: number; factors: string[] };
  single_source: { score: number; weight: number; weighted: number; factors: string[] };
}

export interface RiskAlert {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  supplier_id: string;
  supplier_name: string;
  title: string;
  description: string;
}

export interface RiskResult {
  overall_score: number;
  risk_level: "critical" | "high" | "medium" | "low" | "minimal";
  breakdown: RiskBreakdown;
  alerts: RiskAlert[];
  recommendations: string[];
}

// Weights: financial 30%, geopolitical 25%, delivery 25%, single-source 20%
const WEIGHTS = {
  financial: 0.30,
  geopolitical: 0.25,
  delivery: 0.25,
  single_source: 0.20,
};

// High-risk countries/regions for geopolitical scoring
const HIGH_RISK_REGIONS = new Set(["Eastern Europe", "Central Asia", "Middle East", "Sub-Saharan Africa"]);
const SANCTIONED_COUNTRIES = new Set(["RU", "BY", "KP", "IR", "SY", "CU", "VE"]);

export function computeRiskScore(suppliers: SupplierData[]): RiskResult {
  if (suppliers.length === 0) {
    return {
      overall_score: 0,
      risk_level: "minimal",
      breakdown: emptyBreakdown(),
      alerts: [],
      recommendations: ["No suppliers provided for assessment."],
    };
  }

  const alerts: RiskAlert[] = [];
  let totalFinancial = 0;
  let totalGeopolitical = 0;
  let totalDelivery = 0;
  let totalSingleSource = 0;

  for (const s of suppliers) {
    // Financial risk (higher score = higher risk, inverted from supplier score)
    const finRisk = 100 - s.financial_score;
    totalFinancial += finRisk;

    if (s.financial_score < 30) {
      alerts.push({
        type: "financial",
        severity: "critical",
        supplier_id: s.supplier_id,
        supplier_name: s.name,
        title: `Critical financial risk: ${s.name}`,
        description: `Financial score ${s.financial_score}/100 indicates severe financial instability.`,
      });
    } else if (s.financial_score < 50) {
      alerts.push({
        type: "financial",
        severity: "high",
        supplier_id: s.supplier_id,
        supplier_name: s.name,
        title: `High financial risk: ${s.name}`,
        description: `Financial score ${s.financial_score}/100 indicates potential financial difficulties.`,
      });
    }

    // Geopolitical risk
    const geoRisk = 100 - s.geopolitical_score;
    totalGeopolitical += geoRisk;

    if (s.country && SANCTIONED_COUNTRIES.has(s.country)) {
      alerts.push({
        type: "geopolitical",
        severity: "critical",
        supplier_id: s.supplier_id,
        supplier_name: s.name,
        title: `Sanctioned country: ${s.name}`,
        description: `Supplier located in sanctioned country (${s.country}). Review compliance requirements.`,
      });
    } else if (s.region && HIGH_RISK_REGIONS.has(s.region)) {
      alerts.push({
        type: "geopolitical",
        severity: "medium",
        supplier_id: s.supplier_id,
        supplier_name: s.name,
        title: `High-risk region: ${s.name}`,
        description: `Supplier located in high-risk region (${s.region}). Monitor geopolitical developments.`,
      });
    }

    // Delivery risk
    const delRisk = 100 - s.delivery_score;
    totalDelivery += delRisk;

    if (s.delivery_score < 40) {
      alerts.push({
        type: "logistics",
        severity: "high",
        supplier_id: s.supplier_id,
        supplier_name: s.name,
        title: `Poor delivery performance: ${s.name}`,
        description: `Delivery score ${s.delivery_score}/100 indicates chronic delivery issues.`,
      });
    }

    // Single source risk
    if (s.single_source) {
      totalSingleSource += 100;
      alerts.push({
        type: "single_source",
        severity: "high",
        supplier_id: s.supplier_id,
        supplier_name: s.name,
        title: `Single-source dependency: ${s.name}`,
        description: `${s.name} is the sole supplier for its product categories. Diversification recommended.`,
      });
    } else {
      totalSingleSource += 20; // baseline risk even with multiple sources
    }
  }

  const n = suppliers.length;
  const financialFactors = suppliers.filter(s => s.financial_score < 50).map(s => `${s.name}: ${s.financial_score}/100`);
  const geoFactors = suppliers.filter(s => s.geopolitical_score < 60).map(s => `${s.name}: ${s.country || "unknown"}`);
  const delFactors = suppliers.filter(s => s.delivery_score < 60).map(s => `${s.name}: ${s.delivery_score}/100`);
  const ssFactors = suppliers.filter(s => s.single_source).map(s => s.name);

  const breakdown: RiskBreakdown = {
    financial: {
      score: Math.round(totalFinancial / n),
      weight: WEIGHTS.financial,
      weighted: Math.round((totalFinancial / n) * WEIGHTS.financial),
      factors: financialFactors.length > 0 ? financialFactors : ["All suppliers financially stable"],
    },
    geopolitical: {
      score: Math.round(totalGeopolitical / n),
      weight: WEIGHTS.geopolitical,
      weighted: Math.round((totalGeopolitical / n) * WEIGHTS.geopolitical),
      factors: geoFactors.length > 0 ? geoFactors : ["No elevated geopolitical risks"],
    },
    delivery: {
      score: Math.round(totalDelivery / n),
      weight: WEIGHTS.delivery,
      weighted: Math.round((totalDelivery / n) * WEIGHTS.delivery),
      factors: delFactors.length > 0 ? delFactors : ["Delivery performance satisfactory"],
    },
    single_source: {
      score: Math.round(totalSingleSource / n),
      weight: WEIGHTS.single_source,
      weighted: Math.round((totalSingleSource / n) * WEIGHTS.single_source),
      factors: ssFactors.length > 0 ? ssFactors : ["No single-source dependencies"],
    },
  };

  const overallScore = Math.round(
    breakdown.financial.weighted +
    breakdown.geopolitical.weighted +
    breakdown.delivery.weighted +
    breakdown.single_source.weighted
  );

  const riskLevel = overallScore >= 75 ? "critical"
    : overallScore >= 55 ? "high"
    : overallScore >= 35 ? "medium"
    : overallScore >= 15 ? "low"
    : "minimal";

  const recommendations = generateRecommendations(suppliers, alerts, overallScore);

  return { overall_score: overallScore, risk_level: riskLevel, breakdown, alerts, recommendations };
}

function emptyBreakdown(): RiskBreakdown {
  return {
    financial: { score: 0, weight: 0.30, weighted: 0, factors: [] },
    geopolitical: { score: 0, weight: 0.25, weighted: 0, factors: [] },
    delivery: { score: 0, weight: 0.25, weighted: 0, factors: [] },
    single_source: { score: 0, weight: 0.20, weighted: 0, factors: [] },
  };
}

function generateRecommendations(suppliers: SupplierData[], alerts: RiskAlert[], overallScore: number): string[] {
  const recs: string[] = [];

  const singleSources = suppliers.filter(s => s.single_source);
  if (singleSources.length > 0) {
    recs.push(`Diversify supply for ${singleSources.map(s => s.name).join(", ")} — identify alternative suppliers in different regions.`);
  }

  const weakFinancial = suppliers.filter(s => s.financial_score < 50);
  if (weakFinancial.length > 0) {
    recs.push(`Conduct financial due diligence on ${weakFinancial.map(s => s.name).join(", ")} — request audited financial statements.`);
  }

  const criticalAlerts = alerts.filter(a => a.severity === "critical");
  if (criticalAlerts.length > 0) {
    recs.push("Address critical alerts immediately — review compliance and contingency plans.");
  }

  if (overallScore > 50) {
    recs.push("Overall risk is elevated. Consider maintaining safety stock and developing backup supplier relationships.");
  }

  if (recs.length === 0) {
    recs.push("Supply chain risk is within acceptable thresholds. Continue regular monitoring.");
  }

  return recs;
}
