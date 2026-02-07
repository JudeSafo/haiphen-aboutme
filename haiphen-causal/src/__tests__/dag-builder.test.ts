import { describe, it, expect } from "vitest";
import { buildDag } from "../dag-builder";
import type { CausalEvent } from "../dag-builder";

describe("DAG Builder", () => {
  const makeEvent = (id: string, type: string, ts: string, source = "plc-1"): CausalEvent => ({
    event_id: id,
    event_type: type,
    source,
    description: null,
    severity: "medium",
    timestamp: ts,
    metadata: {},
  });

  describe("buildDag", () => {
    it("should return empty dag for empty events", () => {
      const dag = buildDag([], 24);
      expect(dag.nodes).toHaveLength(0);
      expect(dag.edges).toHaveLength(0);
    });

    it("should create nodes for all events", () => {
      const events = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-01T10:05:00Z"),
      ];
      const dag = buildDag(events, 24);
      expect(dag.nodes).toHaveLength(2);
    });

    it("should create edge when causal rule matches within time window", () => {
      const events = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-01T10:05:00Z"),
      ];
      const dag = buildDag(events, 24);
      expect(dag.edges).toHaveLength(1);
      expect(dag.edges[0].from).toBe("e1");
      expect(dag.edges[0].to).toBe("e2");
      expect(dag.edges[0].relationship).toBe("triggers");
    });

    it("should not create edge when events are outside time window", () => {
      const events = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-03T10:00:00Z"), // 48 hours later
      ];
      const dag = buildDag(events, 1); // 1 hour window
      expect(dag.edges).toHaveLength(0);
    });

    it("should not create edge when no causal rule matches", () => {
      const events = [
        makeEvent("e1", "restart", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "firmware_update", "2024-01-01T10:05:00Z"), // wrong order
      ];
      const dag = buildDag(events, 24);
      // restart -> firmware_update has no causal rule
      // But restart -> alert does exist as a rule, so check specifically
      const edges = dag.edges.filter(e => e.from === "e1" && e.to === "e2");
      expect(edges).toHaveLength(0);
    });

    it("should set root and leaf flags correctly", () => {
      const events = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-01T10:05:00Z"),
        makeEvent("e3", "alert", "2024-01-01T10:06:00Z"),
      ];
      const dag = buildDag(events, 24);

      const e1Node = dag.nodes.find(n => n.event_id === "e1")!;
      const e2Node = dag.nodes.find(n => n.event_id === "e2")!;
      const e3Node = dag.nodes.find(n => n.event_id === "e3")!;

      expect(e1Node.is_root).toBe(true);
      expect(e1Node.is_leaf).toBe(false);

      // e2 is caused by e1 (not root), and causes e3 (not leaf)
      expect(e2Node.is_root).toBe(false);
      expect(e2Node.is_leaf).toBe(false);

      // e3 is caused by e2 (not root), and causes nothing (leaf)
      expect(e3Node.is_root).toBe(false);
      expect(e3Node.is_leaf).toBe(true);
    });

    it("should boost confidence for same-source events", () => {
      const eventsSameSource = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z", "plc-1"),
        makeEvent("e2", "restart", "2024-01-01T10:01:00Z", "plc-1"),
      ];
      const eventsDiffSource = [
        makeEvent("e3", "firmware_update", "2024-01-01T10:00:00Z", "plc-1"),
        makeEvent("e4", "restart", "2024-01-01T10:01:00Z", "plc-2"),
      ];

      const dagSame = buildDag(eventsSameSource, 24);
      const dagDiff = buildDag(eventsDiffSource, 24);

      expect(dagSame.edges[0].confidence).toBeGreaterThan(dagDiff.edges[0].confidence);
    });

    it("should decay confidence with time distance", () => {
      const eventsClose = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-01T10:01:00Z"), // 1 minute later
      ];
      const eventsFar = [
        makeEvent("e3", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e4", "restart", "2024-01-01T20:00:00Z"), // 10 hours later
      ];

      const dagClose = buildDag(eventsClose, 24);
      const dagFar = buildDag(eventsFar, 24);

      expect(dagClose.edges[0].confidence).toBeGreaterThan(dagFar.edges[0].confidence);
    });

    it("should compute depths via BFS", () => {
      const events = [
        makeEvent("e1", "firmware_update", "2024-01-01T10:00:00Z"),
        makeEvent("e2", "restart", "2024-01-01T10:05:00Z"),
        makeEvent("e3", "alert", "2024-01-01T10:06:00Z"),
      ];
      const dag = buildDag(events, 24);

      const e1 = dag.nodes.find(n => n.event_id === "e1")!;
      const e2 = dag.nodes.find(n => n.event_id === "e2")!;
      const e3 = dag.nodes.find(n => n.event_id === "e3")!;

      expect(e1.depth).toBe(0);
      expect(e2.depth).toBe(1);
      expect(e3.depth).toBe(2);
    });
  });
});
