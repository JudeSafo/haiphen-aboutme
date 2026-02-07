// dag-builder.ts — Build directed acyclic graph from timestamped events

export interface CausalEvent {
  event_id: string;
  event_type: string;
  source: string;
  description: string | null;
  severity: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface DagNode {
  event_id: string;
  event_type: string;
  source: string;
  timestamp: string;
  severity: string;
  in_degree: number;
  out_degree: number;
  is_root: boolean;
  is_leaf: boolean;
  depth: number;
}

export interface DagEdge {
  from: string;
  to: string;
  relationship: string;
  confidence: number;
  time_delta_ms: number;
}

export interface Dag {
  nodes: DagNode[];
  edges: DagEdge[];
}

// Causal rule pairs: event type A can cause event type B
const CAUSAL_RULES: Array<{ cause: string; effect: string; relationship: string; base_confidence: number }> = [
  { cause: "firmware_update", effect: "restart", relationship: "triggers", base_confidence: 0.9 },
  { cause: "firmware_update", effect: "config_change", relationship: "triggers", base_confidence: 0.85 },
  { cause: "firmware_update", effect: "service_degradation", relationship: "may_cause", base_confidence: 0.6 },
  { cause: "config_change", effect: "restart", relationship: "triggers", base_confidence: 0.7 },
  { cause: "config_change", effect: "alert", relationship: "triggers", base_confidence: 0.8 },
  { cause: "config_change", effect: "service_degradation", relationship: "may_cause", base_confidence: 0.5 },
  { cause: "network_change", effect: "connectivity_loss", relationship: "triggers", base_confidence: 0.85 },
  { cause: "network_change", effect: "alert", relationship: "triggers", base_confidence: 0.7 },
  { cause: "connectivity_loss", effect: "alert", relationship: "triggers", base_confidence: 0.9 },
  { cause: "connectivity_loss", effect: "service_degradation", relationship: "causes", base_confidence: 0.8 },
  { cause: "power_event", effect: "restart", relationship: "triggers", base_confidence: 0.95 },
  { cause: "power_event", effect: "connectivity_loss", relationship: "causes", base_confidence: 0.8 },
  { cause: "security_event", effect: "alert", relationship: "triggers", base_confidence: 0.95 },
  { cause: "security_event", effect: "config_change", relationship: "may_cause", base_confidence: 0.4 },
  { cause: "resource_exhaustion", effect: "service_degradation", relationship: "causes", base_confidence: 0.85 },
  { cause: "resource_exhaustion", effect: "restart", relationship: "may_cause", base_confidence: 0.6 },
  { cause: "restart", effect: "alert", relationship: "triggers", base_confidence: 0.7 },
  { cause: "service_degradation", effect: "alert", relationship: "triggers", base_confidence: 0.85 },
  { cause: "alert", effect: "config_change", relationship: "may_trigger", base_confidence: 0.3 },
];

export function buildDag(events: CausalEvent[], windowHours: number): Dag {
  const windowMs = windowHours * 3600 * 1000;

  // Sort events by timestamp
  const sorted = [...events].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const edges: DagEdge[] = [];
  const nodeMap = new Map<string, DagNode>();

  // Initialize nodes
  for (const ev of sorted) {
    nodeMap.set(ev.event_id, {
      event_id: ev.event_id,
      event_type: ev.event_type,
      source: ev.source,
      timestamp: ev.timestamp,
      severity: ev.severity,
      in_degree: 0,
      out_degree: 0,
      is_root: true,
      is_leaf: true,
      depth: 0,
    });
  }

  // Build edges based on causal rules + temporal proximity
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const cause = sorted[i];
      const effect = sorted[j];
      const timeDelta = new Date(effect.timestamp).getTime() - new Date(cause.timestamp).getTime();

      // Only consider events within the time window
      if (timeDelta > windowMs) break;
      if (timeDelta < 0) continue;

      // Check causal rules
      const rule = CAUSAL_RULES.find(r =>
        r.cause === cause.event_type && r.effect === effect.event_type
      );

      if (rule) {
        // Confidence decays with time distance
        const timeDecay = 1 - (timeDelta / windowMs) * 0.5;
        // Same source boosts confidence
        const sourceBoost = cause.source === effect.source ? 1.1 : 1.0;
        const confidence = Math.min(1, rule.base_confidence * timeDecay * sourceBoost);

        if (confidence > 0.2) {
          edges.push({
            from: cause.event_id,
            to: effect.event_id,
            relationship: rule.relationship,
            confidence,
            time_delta_ms: timeDelta,
          });

          const causeNode = nodeMap.get(cause.event_id)!;
          const effectNode = nodeMap.get(effect.event_id)!;
          causeNode.out_degree++;
          causeNode.is_leaf = false;
          effectNode.in_degree++;
          effectNode.is_root = false;
        }
      }
    }
  }

  // Compute depths via BFS from roots
  const nodes = Array.from(nodeMap.values());
  const roots = nodes.filter(n => n.is_root);
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = roots.map(r => ({ id: r.event_id, depth: 0 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodeMap.get(id)!;
    node.depth = depth;

    for (const edge of edges) {
      if (edge.from === id && !visited.has(edge.to)) {
        queue.push({ id: edge.to, depth: depth + 1 });
      }
    }
  }

  return { nodes, edges };
}
