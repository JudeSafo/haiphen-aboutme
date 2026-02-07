import { describe, it, expect } from "vitest";
import { generateAnomalyReport } from "../anomaly-detector";
import type { TraceSummary } from "../protocol-analyzer";

describe("Anomaly Detector", () => {
  const baseSummary = (overrides: Partial<TraceSummary> = {}): TraceSummary => ({
    packet_count: 10,
    session_count: 2,
    anomaly_count: 0,
    duration_ms: 1000,
    protocols_seen: ["modbus"],
    function_codes_seen: [3, 4],
    sessions: [],
    anomalies: [],
    ...overrides,
  });

  it("should report no anomalies for clean trace", () => {
    const report = generateAnomalyReport(baseSummary());
    expect(report.total_anomalies).toBe(0);
    expect(report.risk_level).toBe("none");
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("should report critical risk level for critical anomalies", () => {
    const report = generateAnomalyReport(baseSummary({
      anomaly_count: 1,
      anomalies: [{ type: "oversized_payload", detail: "Too large", severity: "critical", packet_seq: 0, timestamp_ms: 1000 }],
    }));
    expect(report.risk_level).toBe("critical");
    expect(report.severity_breakdown.critical).toBe(1);
  });

  it("should generate appropriate recommendations for each anomaly type", () => {
    const report = generateAnomalyReport(baseSummary({
      anomaly_count: 4,
      anomalies: [
        { type: "unknown_function_code", detail: "", severity: "high", packet_seq: 0, timestamp_ms: 1000 },
        { type: "oversized_payload", detail: "", severity: "critical", packet_seq: 1, timestamp_ms: 1100 },
        { type: "rapid_polling", detail: "", severity: "medium", packet_seq: 2, timestamp_ms: 1200 },
        { type: "timing_jitter", detail: "", severity: "low", packet_seq: 3, timestamp_ms: 1300 },
      ],
    }));
    expect(report.recommendations.length).toBe(4);
    expect(report.recommendations.some(r => r.includes("function code"))).toBe(true);
    expect(report.recommendations.some(r => r.includes("payload"))).toBe(true);
    expect(report.recommendations.some(r => r.includes("polling"))).toBe(true);
    expect(report.recommendations.some(r => r.includes("timing"))).toBe(true);
  });
});
