// root-cause.ts — Topological sort, root cause identification, and counterfactual analysis

import type { Dag, DagNode, DagEdge } from "./dag-builder";

export interface RootCause {
  event_id: string;
  event_type: string;
  source: string;
  timestamp: string;
  severity: string;
  confidence: number;
  impact_score: number;
  downstream_count: number;
}

export interface PropagationStep {
  from_event_id: string;
  to_event_id: string;
  relationship: string;
  confidence: number;
  time_delta_ms: number;
  depth: number;
}

export interface Counterfactual {
  removed_event_id: string;
  removed_event_type: string;
  impact_reduction: number;
  prevented_events: number;
  prevented_event_ids: string[];
}

export interface AnalysisResult {
  root_causes: RootCause[];
  propagation_chain: PropagationStep[];
  counterfactuals: Counterfactual[];
  topological_order: string[];
}

export function analyzeRootCauses(dag: Dag): AnalysisResult {
  const topoOrder = topologicalSort(dag);
  const rootCauses = identifyRootCauses(dag);
  const propagation = buildPropagationChain(dag);
  const counterfactuals = computeCounterfactuals(dag);

  return {
    root_causes: rootCauses,
    propagation_chain: propagation,
    counterfactuals,
    topological_order: topoOrder,
  };
}

function topologicalSort(dag: Dag): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of dag.nodes) {
    inDegree.set(node.event_id, 0);
    adjacency.set(node.event_id, []);
  }

  for (const edge of dag.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    adjacency.get(edge.from)?.push(edge.to);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    for (const neighbor of adjacency.get(current) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return order;
}

function identifyRootCauses(dag: Dag): RootCause[] {
  const roots = dag.nodes.filter(n => n.is_root && n.out_degree > 0);

  return roots.map(root => {
    const downstream = countDownstream(dag, root.event_id);
    const avgConfidence = computeAvgOutConfidence(dag, root.event_id);
    const impactScore = Math.min(100, Math.round(downstream * 15 * avgConfidence));

    return {
      event_id: root.event_id,
      event_type: root.event_type,
      source: root.source,
      timestamp: root.timestamp,
      severity: root.severity,
      confidence: avgConfidence,
      impact_score: impactScore,
      downstream_count: downstream,
    };
  }).sort((a, b) => b.impact_score - a.impact_score);
}

function countDownstream(dag: Dag, rootId: string): number {
  const visited = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of dag.edges) {
      if (edge.from === current && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  return visited.size;
}

function computeAvgOutConfidence(dag: Dag, nodeId: string): number {
  const outEdges = dag.edges.filter(e => e.from === nodeId);
  if (outEdges.length === 0) return 0;
  return outEdges.reduce((sum, e) => sum + e.confidence, 0) / outEdges.length;
}

function buildPropagationChain(dag: Dag): PropagationStep[] {
  const chain: PropagationStep[] = [];

  // Sort edges by timestamp of source node
  const nodeTimeMap = new Map(dag.nodes.map(n => [n.event_id, n.depth]));

  const sortedEdges = [...dag.edges].sort((a, b) => {
    const da = nodeTimeMap.get(a.from) || 0;
    const db = nodeTimeMap.get(b.from) || 0;
    return da - db;
  });

  for (const edge of sortedEdges) {
    const fromDepth = nodeTimeMap.get(edge.from) || 0;
    chain.push({
      from_event_id: edge.from,
      to_event_id: edge.to,
      relationship: edge.relationship,
      confidence: edge.confidence,
      time_delta_ms: edge.time_delta_ms,
      depth: fromDepth,
    });
  }

  return chain;
}

function computeCounterfactuals(dag: Dag): Counterfactual[] {
  const counterfactuals: Counterfactual[] = [];

  // For each root cause, compute what happens if we remove it
  const roots = dag.nodes.filter(n => n.is_root && n.out_degree > 0);

  for (const root of roots) {
    const prevented = findPreventedEvents(dag, root.event_id);
    const totalNodes = dag.nodes.length;
    const impactReduction = totalNodes > 1
      ? Math.round((prevented.length / (totalNodes - 1)) * 100) / 100
      : 0;

    counterfactuals.push({
      removed_event_id: root.event_id,
      removed_event_type: root.event_type,
      impact_reduction: impactReduction,
      prevented_events: prevented.length,
      prevented_event_ids: prevented,
    });
  }

  // Also consider high-impact intermediate nodes
  const intermediates = dag.nodes.filter(n => !n.is_root && !n.is_leaf && n.out_degree >= 2);
  for (const node of intermediates) {
    const prevented = findPreventedEvents(dag, node.event_id);
    // Only include if removing this node prevents more events than just its direct children
    if (prevented.length > node.out_degree) {
      const totalNodes = dag.nodes.length;
      const impactReduction = totalNodes > 1
        ? Math.round((prevented.length / (totalNodes - 1)) * 100) / 100
        : 0;

      counterfactuals.push({
        removed_event_id: node.event_id,
        removed_event_type: node.event_type,
        impact_reduction: impactReduction,
        prevented_events: prevented.length,
        prevented_event_ids: prevented,
      });
    }
  }

  return counterfactuals.sort((a, b) => b.impact_reduction - a.impact_reduction);
}

function findPreventedEvents(dag: Dag, removedId: string): string[] {
  // Find all nodes only reachable through the removed node
  const reachableWithout = new Set<string>();
  const allRoots = dag.nodes.filter(n => n.is_root).map(n => n.event_id);

  // BFS from all roots except the removed node, ignoring edges from removed node
  const queue = allRoots.filter(id => id !== removedId);
  const visited = new Set(queue);

  while (queue.length > 0) {
    const current = queue.shift()!;
    reachableWithout.add(current);

    for (const edge of dag.edges) {
      if (edge.from === current && edge.from !== removedId && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  // Prevented events = all nodes not reachable without the removed node (excluding removed itself)
  return dag.nodes
    .filter(n => n.event_id !== removedId && !reachableWithout.has(n.event_id))
    .map(n => n.event_id);
}
