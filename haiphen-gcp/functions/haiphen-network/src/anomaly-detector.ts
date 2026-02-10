// anomaly-detector.ts — Post-processing anomaly detection on trace data

import type { DecodedPacket, TraceSummary } from "./protocol-analyzer";

export interface AnomalyReport {
  total_anomalies: number;
  severity_breakdown: { critical: number; high: number; medium: number; low: number };
  risk_level: "critical" | "high" | "medium" | "low" | "none";
  recommendations: string[];
}

export function generateAnomalyReport(summary: TraceSummary): AnomalyReport {
  const severity = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const anomaly of summary.anomalies) {
    const key = anomaly.severity as keyof typeof severity;
    if (key in severity) severity[key]++;
  }

  const riskLevel = severity.critical > 0 ? "critical"
    : severity.high > 0 ? "high"
    : severity.medium > 0 ? "medium"
    : severity.low > 0 ? "low"
    : "none";

  const recommendations: string[] = [];

  // Generate recommendations based on anomaly types
  const anomalyTypes = new Set(summary.anomalies.map(a => a.type));

  if (anomalyTypes.has("unknown_function_code")) {
    recommendations.push("Unknown function codes detected. Verify authorized operations and implement function code filtering at the network level.");
  }
  if (anomalyTypes.has("oversized_payload")) {
    recommendations.push("Oversized payloads detected. This may indicate buffer overflow attempts. Enable payload size limits on industrial firewalls.");
  }
  if (anomalyTypes.has("rapid_polling")) {
    recommendations.push("Rapid polling detected. This may indicate reconnaissance or denial-of-service. Implement rate limiting on PLC communication.");
  }
  if (anomalyTypes.has("timing_jitter")) {
    recommendations.push("Unusual timing patterns detected. This may indicate network congestion or man-in-the-middle activity. Monitor network latency baselines.");
  }

  if (summary.anomaly_count === 0) {
    recommendations.push("No anomalies detected in this trace. Continue monitoring for baseline deviations.");
  }

  return {
    total_anomalies: summary.anomaly_count,
    severity_breakdown: severity,
    risk_level: riskLevel,
    recommendations,
  };
}
