// synthesizer.ts — Deterministic structured synthesizer for prospect investigations
//
// Replaces the Claude API call with a pure, synchronous abstraction funnel:
//   Raw findings → Threat Primitives → Impact Primitives → Rendered output
//
// Every stage is deterministic — same input always produces the same output.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThreatPrimitive =
  | "credential_compromise"
  | "data_corruption"
  | "protocol_exposure"
  | "execution_disruption"
  | "settlement_failure"
  | "supply_dependency"
  | "cascade_propagation"
  | "regulatory_gap"
  | "technology_obsolescence"
  | "operational_fragility";

export type ImpactPrimitive =
  | "financial_loss"
  | "regulatory_exposure"
  | "client_data_breach"
  | "operational_disruption"
  | "reputational_damage";

export interface ClassifiedThreat {
  primitive: ThreatPrimitive;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  affinityMatches: number;
}

export interface ScoredImpact {
  primitive: ImpactPrimitive;
  score: number;
  label: string;
}

export interface DataGap {
  type: "data_gap" | "relationship_gap" | "coverage_gap";
  description: string;
  suggestion: string;
  service?: string;
}

export interface SynthesisResult {
  summary: string;
  impact: string;
  recommendations: string[];
  threats: ClassifiedThreat[];
  impacts: ScoredImpact[];
  data_gaps?: DataGap[];
}

// ---------------------------------------------------------------------------
// Threat classifiers — regex patterns + service affinity
// ---------------------------------------------------------------------------

interface ThreatClassifier {
  primitive: ThreatPrimitive;
  patterns: RegExp[];
  serviceAffinity: string[];
}

const THREAT_CLASSIFIERS: ThreatClassifier[] = [
  {
    primitive: "credential_compromise",
    patterns: [/\bauth/i, /\bcredential/i, /\btoken/i, /\bsession/i, /\boauth/i, /\bprivileg/i, /\bpassword/i, /\baccess.?control/i],
    serviceAffinity: ["secure", "causal"],
  },
  {
    primitive: "data_corruption",
    patterns: [/\bdata.?feed/i, /\bprice.?manipul/i, /\bNAV.?error/i, /\bquote.?integrity/i, /\bdata.?integrity/i, /\bcorrupt/i, /\btamper/i],
    serviceAffinity: ["network", "risk"],
  },
  {
    primitive: "protocol_exposure",
    patterns: [/\bFIX\b/, /\bWebSocket/i, /\bAPI.?gateway/i, /\bModbus/i, /\bMQTT/i, /\bOPC.?UA/i, /\bprotocol/i, /\bendpoint.?expos/i],
    serviceAffinity: ["network"],
  },
  {
    primitive: "execution_disruption",
    patterns: [/\border.?loss/i, /\bfill.?delay/i, /\bqueue.?stall/i, /\bmatching.?engine/i, /\bexecut/i, /\blatency/i, /\btimeout/i],
    serviceAffinity: ["risk", "causal"],
  },
  {
    primitive: "settlement_failure",
    patterns: [/\bsettlement/i, /\bclearing/i, /\breconcil/i, /\bposition.?drift/i, /\bT\+\d/i, /\bfail.?to.?deliver/i],
    serviceAffinity: ["risk", "causal"],
  },
  {
    primitive: "supply_dependency",
    patterns: [/\bvendor/i, /\bthird.?party/i, /\bsingle.?source/i, /\bSaaS/i, /\bsupply.?chain/i, /\bdependen/i, /\boutsourc/i],
    serviceAffinity: ["supply", "graph"],
  },
  {
    primitive: "cascade_propagation",
    patterns: [/\bcascade/i, /\bpropagat/i, /\bdownstream/i, /\bmulti.?system/i, /\bchain.?reaction/i, /\bdomino/i, /\bsystemic/i],
    serviceAffinity: ["causal", "graph"],
  },
  {
    primitive: "regulatory_gap",
    patterns: [/\bSEC\b/, /\bfiling/i, /\benforcement/i, /\bcompliance/i, /\bfine\b/i, /\bpenalt/i, /\b8-K\b/, /\bregulat/i],
    serviceAffinity: ["risk", "causal"],
  },
  {
    primitive: "technology_obsolescence",
    patterns: [/\blegacy/i, /\bTLS 1\.[01]/, /\bdeprecated/i, /\bend.of.life/i, /\bunsupported/i, /\bexpir/i, /\boutdated/i],
    serviceAffinity: ["secure", "network"],
  },
  {
    primitive: "operational_fragility",
    patterns: [/\boutage/i, /\bdowntime/i, /\blatency/i, /\bresponse.time/i, /\bfailover/i, /\bsingle.point/i, /\btimeout/i],
    serviceAffinity: ["network", "causal"],
  },
];

// ---------------------------------------------------------------------------
// Threat → Impact weight matrix
// ---------------------------------------------------------------------------

const THREAT_IMPACT_MATRIX: Record<ThreatPrimitive, Record<ImpactPrimitive, number>> = {
  credential_compromise:  { financial_loss: 0.4, regulatory_exposure: 0.8, client_data_breach: 0.9, operational_disruption: 0.3, reputational_damage: 0.6 },
  data_corruption:        { financial_loss: 0.9, regulatory_exposure: 0.5, client_data_breach: 0.3, operational_disruption: 0.6, reputational_damage: 0.4 },
  protocol_exposure:      { financial_loss: 0.3, regulatory_exposure: 0.4, client_data_breach: 0.7, operational_disruption: 0.8, reputational_damage: 0.3 },
  execution_disruption:   { financial_loss: 0.9, regulatory_exposure: 0.3, client_data_breach: 0.1, operational_disruption: 0.7, reputational_damage: 0.5 },
  settlement_failure:     { financial_loss: 0.8, regulatory_exposure: 0.9, client_data_breach: 0.2, operational_disruption: 0.5, reputational_damage: 0.8 },
  supply_dependency:      { financial_loss: 0.5, regulatory_exposure: 0.3, client_data_breach: 0.2, operational_disruption: 0.9, reputational_damage: 0.4 },
  cascade_propagation:    { financial_loss: 0.6, regulatory_exposure: 0.4, client_data_breach: 0.3, operational_disruption: 0.9, reputational_damage: 0.7 },
  regulatory_gap:         { financial_loss: 0.7, regulatory_exposure: 1.0, client_data_breach: 0.2, operational_disruption: 0.4, reputational_damage: 0.8 },
  technology_obsolescence:{ financial_loss: 0.5, regulatory_exposure: 0.6, client_data_breach: 0.4, operational_disruption: 0.7, reputational_damage: 0.3 },
  operational_fragility:  { financial_loss: 0.8, regulatory_exposure: 0.3, client_data_breach: 0.1, operational_disruption: 1.0, reputational_damage: 0.6 },
};

// ---------------------------------------------------------------------------
// Impact labels (human-readable)
// ---------------------------------------------------------------------------

const IMPACT_LABELS: Record<ImpactPrimitive, string> = {
  financial_loss: "Financial Loss",
  regulatory_exposure: "Regulatory Exposure",
  client_data_breach: "Client Data Breach",
  operational_disruption: "Operational Disruption",
  reputational_damage: "Reputational Damage",
};

// ---------------------------------------------------------------------------
// Recommendation templates (one per threat primitive)
// ---------------------------------------------------------------------------

const RECOMMENDATION_TEMPLATES: Record<ThreatPrimitive, string> = {
  credential_compromise: "Rotate exposed credentials, enforce MFA on all privileged accounts, and audit session token lifetimes.",
  data_corruption: "Validate data feed integrity checksums, implement real-time price deviation alerts, and add reconciliation checks.",
  protocol_exposure: "Restrict protocol endpoints to allowlisted IPs, enforce TLS 1.3, and audit API gateway configurations.",
  execution_disruption: "Add order execution health checks, implement circuit breakers on matching engine paths, and monitor fill latencies.",
  settlement_failure: "Verify settlement cycle compliance (T+1/T+2), reconcile positions pre- and post-settlement, and escalate to clearing ops.",
  supply_dependency: "Map single-source dependencies, establish vendor SLAs with penalty clauses, and identify backup providers.",
  cascade_propagation: "Implement blast-radius isolation between systems, add circuit breakers at service boundaries, and run cascade failure simulations.",
  regulatory_gap: "Review SEC filing obligations, engage compliance counsel, and implement automated regulatory monitoring for material events.",
  technology_obsolescence: "Upgrade TLS to 1.3, rotate expiring certificates, replace deprecated dependencies, and establish a technology lifecycle management program.",
  operational_fragility: "Implement redundant infrastructure paths, add health-check monitoring with automated failover, and conduct chaos engineering exercises.",
};

// ---------------------------------------------------------------------------
// Classify threats from pipeline step outputs
// ---------------------------------------------------------------------------

export function classifyThreats(
  steps: Array<{ service: string; score: number | null; findings: string[] }>,
): ClassifiedThreat[] {
  const threats: ClassifiedThreat[] = [];

  for (const classifier of THREAT_CLASSIFIERS) {
    const evidence: string[] = [];
    let affinityMatches = 0;

    for (const step of steps) {
      if (step.score === null) continue;

      const isAffinity = classifier.serviceAffinity.includes(step.service);

      for (const finding of step.findings) {
        for (const pattern of classifier.patterns) {
          if (pattern.test(finding)) {
            evidence.push(finding);
            if (isAffinity) affinityMatches++;
            break; // one match per finding is enough
          }
        }
      }
    }

    if (evidence.length === 0) continue;

    // Confidence: high if 2+ affinity matches, medium if 2+ evidence, low otherwise
    let confidence: "high" | "medium" | "low";
    if (affinityMatches >= 2) {
      confidence = "high";
    } else if (evidence.length >= 2) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    threats.push({
      primitive: classifier.primitive,
      evidence,
      confidence,
      affinityMatches,
    });
  }

  return threats;
}

// ---------------------------------------------------------------------------
// Score impacts from classified threats
// ---------------------------------------------------------------------------

const CONFIDENCE_MULTIPLIER: Record<string, number> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

export function scoreImpacts(
  threats: ClassifiedThreat[],
  aggregateScore: number,
): ScoredImpact[] {
  const impactPrimitives: ImpactPrimitive[] = [
    "financial_loss", "regulatory_exposure", "client_data_breach",
    "operational_disruption", "reputational_damage",
  ];

  const impacts: ScoredImpact[] = [];

  for (const impact of impactPrimitives) {
    let maxWeightedScore = 0;

    for (const threat of threats) {
      const weight = THREAT_IMPACT_MATRIX[threat.primitive][impact];
      const conf = CONFIDENCE_MULTIPLIER[threat.confidence];
      const ws = weight * conf;
      if (ws > maxWeightedScore) maxWeightedScore = ws;
    }

    const score = Math.round(maxWeightedScore * aggregateScore * 100) / 100;
    if (score > 0) {
      impacts.push({ primitive: impact, score, label: IMPACT_LABELS[impact] });
    }
  }

  // Sort descending by score
  impacts.sort((a, b) => b.score - a.score);
  return impacts;
}

// ---------------------------------------------------------------------------
// Score band label
// ---------------------------------------------------------------------------

function scoreBand(score: number): string {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

// ---------------------------------------------------------------------------
// Main synthesize() — pure, deterministic, synchronous
// ---------------------------------------------------------------------------

export function synthesize(
  lead: { entity_name: string; vulnerability_id: string | null; cvss_score: number | null },
  steps: Array<{ service: string; score: number | null; findings: string[] }>,
  aggregateScore: number,
  gaps?: DataGap[],
): SynthesisResult {
  const threats = classifyThreats(steps);
  const impacts = scoreImpacts(threats, aggregateScore);

  // Summary
  const band = scoreBand(aggregateScore);
  const threatList = threats.map(t => t.primitive.replace(/_/g, " ")).join(", ") || "general exposure";
  const summary = `${band}-severity investigation of ${lead.entity_name}. Identified ${threats.length} threat vector${threats.length !== 1 ? "s" : ""}: ${threatList}. Aggregate risk score: ${aggregateScore}/100.`;

  // Impact statement
  const topImpacts = impacts.slice(0, 3);
  const impactParts = topImpacts.map(i => `${i.label} (${i.score.toFixed(1)})`).join(", ");
  const cvssNote = lead.cvss_score != null ? ` CVSS ${lead.cvss_score} amplifies urgency.` : "";
  const impact = topImpacts.length > 0
    ? `Primary business impact: ${impactParts}.${cvssNote}`
    : `No specific business impact identified at current score level.${cvssNote}`;

  // Recommendations — one per classified threat
  const recommendations = threats.map(t => RECOMMENDATION_TEMPLATES[t.primitive]);

  const result: SynthesisResult = { summary, impact, recommendations, threats, impacts };
  if (gaps && gaps.length > 0) {
    result.data_gaps = gaps;
  }
  return result;
}
