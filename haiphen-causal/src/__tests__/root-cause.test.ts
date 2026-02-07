import { describe, it, expect } from "vitest";
import { analyzeRootCauses } from "../root-cause";
import { buildDag } from "../dag-builder";
import type { CausalEvent } from "../dag-builder";
import type { Dag } from "../dag-builder";

describe("Root Cause Analysis", () => {
  const makeEvent = (id: string, type: string, ts: string, source = "plc-1"): CausalEvent => ({
    event_id: id,
    event_type: type,
    source,
    description: null,
    severity: "medium",
    timestamp: ts,
    metadata: {},
  });

  describe("analyzeRootCauses", () => {
    it("should return empty analysis for empty dag", () => {
      const dag: Dag = { nodes: [], edges: [] };
      const result = analyzeRootCauses(dag);
      expect(result.root_causes).toHaveLength(0);
      expect(result.topological_order).toHaveLength(0);
    });

    it("should identify firmware_update as root cause", () => {
      const events = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-01T10:05:00Z"),
        makeEvent("e3", "alert", "2024-01-01T10:06:00Z"),
      ];
      const dag = buildDag(events, 24);
      const result = analyzeRootCauses(dag);

      expect(result.root_causes.length).toBeGreaterThan(0);
      expect(result.root_causes[0].event_id).toBe("e1");
      expect(result.root_causes[0].event_type).toBe("firmware_update");
    });

    it("should produce valid topological order", () => {
      const events = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-01T10:05:00Z"),
        makeEvent("e3", "alert", "2024-01-01T10:06:00Z"),
      ];
      const dag = buildDag(events, 24);
      const result = analyzeRootCauses(dag);

      // Root cause should come before its effects in topological order
      const e1Idx = result.topological_order.indexOf("e1");
      const e2Idx = result.topological_order.indexOf("e2");
      const e3Idx = result.topological_order.indexOf("e3");

      expect(e1Idx).toBeLessThan(e2Idx);
      expect(e2Idx).toBeLessThan(e3Idx);
    });

    it("should compute downstream count correctly", () => {
      const events = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-01T10:05:00Z"),
        makeEvent("e3", "alert", "2024-01-01T10:06:00Z"),
      ];
      const dag = buildDag(events, 24);
      const result = analyzeRootCauses(dag);

      const rootCause = result.root_causes.find(r => r.event_id === "e1");
      expect(rootCause).toBeDefined();
      expect(rootCause!.downstream_count).toBe(2); // e2 and e3
    });

    it("should generate propagation chain", () => {
      const events = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-01T10:05:00Z"),
        makeEvent("e3", "alert", "2024-01-01T10:06:00Z"),
      ];
      const dag = buildDag(events, 24);
      const result = analyzeRootCauses(dag);

      expect(result.propagation_chain.length).toBeGreaterThan(0);
      // Chain should go e1 -> e2 -> e3
      const firstStep = result.propagation_chain.find(s => s.from_event_id === "e1");
      expect(firstStep).toBeDefined();
    });

    it("should compute counterfactuals", () => {
      const events = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-01T10:05:00Z"),
        makeEvent("e3", "alert", "2024-01-01T10:06:00Z"),
      ];
      const dag = buildDag(events, 24);
      const result = analyzeRootCauses(dag);

      expect(result.counterfactuals.length).toBeGreaterThan(0);
      const rootCounterfactual = result.counterfactuals.find(c => c.removed_event_id === "e1");
      expect(rootCounterfactual).toBeDefined();
      expect(rootCounterfactual!.prevented_events).toBeGreaterThan(0);
    });
  });
});
