// haiphen-graph/src/inference.ts — Relationship inference engine

/* ---------- types ---------- */

export interface InferenceEntity {
  entity_id: string;
  entity_type: string;
  label: string;
  properties_json: string | null;
}

export interface InferenceEdge {
  edge_id: string;
  source_id: string;
  target_id: string;
  relationship: string;
  properties_json: string | null;
}

export interface InferredRelationship {
  source_id: string;
  target_id: string;
  relationship: string;
  confidence: number;          // 0.0 - 1.0
  reason: string;
  properties?: Record<string, unknown>;
}

/* ---------- helpers ---------- */

function parseProps(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/**
 * Build an adjacency index: for each entity, which edges connect to/from it
 * keyed by relationship type.
 */
function buildAdjacency(edges: InferenceEdge[]): {
  outbound: Map<string, Map<string, string[]>>;  // entityId -> relationship -> targetId[]
  inbound: Map<string, Map<string, string[]>>;   // entityId -> relationship -> sourceId[]
} {
  const outbound = new Map<string, Map<string, string[]>>();
  const inbound = new Map<string, Map<string, string[]>>();

  for (const e of edges) {
    // outbound
    if (!outbound.has(e.source_id)) outbound.set(e.source_id, new Map());
    const srcMap = outbound.get(e.source_id)!;
    if (!srcMap.has(e.relationship)) srcMap.set(e.relationship, []);
    srcMap.get(e.relationship)!.push(e.target_id);

    // inbound
    if (!inbound.has(e.target_id)) inbound.set(e.target_id, new Map());
    const tgtMap = inbound.get(e.target_id)!;
    if (!tgtMap.has(e.relationship)) tgtMap.set(e.relationship, []);
    tgtMap.get(e.relationship)!.push(e.source_id);
  }

  return { outbound, inbound };
}

/* ---------- inference rules ---------- */

/**
 * Rule 1: similar_firmware
 * If device A runs_on firmware X and device B runs_on firmware X,
 * suggest a "similar_firmware" edge between A and B.
 */
function inferSimilarFirmware(
  entities: InferenceEntity[],
  adjacency: ReturnType<typeof buildAdjacency>,
): InferredRelationship[] {
  const results: InferredRelationship[] = [];
  const entityMap = new Map(entities.map(e => [e.entity_id, e]));

  // Find all firmware entities and their connected devices
  const firmwareEntities = entities.filter(e => e.entity_type === "firmware");

  for (const fw of firmwareEntities) {
    // Find all devices that run_on this firmware (inbound runs_on edges to firmware)
    const inboundRels = adjacency.inbound.get(fw.entity_id);
    const runsOnSources = inboundRels?.get("runs_on") ?? [];

    // Filter to only devices
    const devices = runsOnSources.filter(id => {
      const ent = entityMap.get(id);
      return ent && ent.entity_type === "device";
    });

    // Create pairwise similar_firmware links
    for (let i = 0; i < devices.length; i++) {
      for (let j = i + 1; j < devices.length; j++) {
        results.push({
          source_id: devices[i],
          target_id: devices[j],
          relationship: "similar_firmware",
          confidence: 0.85,
          reason: `Both devices run on firmware "${fw.label}"`,
          properties: { shared_firmware_id: fw.entity_id, shared_firmware_label: fw.label },
        });
      }
    }
  }

  return results;
}

/**
 * Rule 2: potentially_vulnerable
 * If device D runs_on firmware F, and vulnerability V exploits firmware F,
 * suggest a "potentially_vulnerable" link from V to D.
 */
function inferPotentiallyVulnerable(
  entities: InferenceEntity[],
  adjacency: ReturnType<typeof buildAdjacency>,
): InferredRelationship[] {
  const results: InferredRelationship[] = [];
  const entityMap = new Map(entities.map(e => [e.entity_id, e]));

  // Find all firmware entities
  const firmwareEntities = entities.filter(e => e.entity_type === "firmware");

  for (const fw of firmwareEntities) {
    // Devices that runs_on this firmware
    const inboundRels = adjacency.inbound.get(fw.entity_id);
    const deviceIds = (inboundRels?.get("runs_on") ?? []).filter(id => {
      const ent = entityMap.get(id);
      return ent && ent.entity_type === "device";
    });

    // Vulnerabilities that exploit this firmware
    const vulnIds = (inboundRels?.get("exploits") ?? []).filter(id => {
      // exploits edges: source=vulnerability, target=firmware
      // But "exploits" outbound from vuln to firmware means inbound to firmware from vuln
      const ent = entityMap.get(id);
      return ent && ent.entity_type === "vulnerability";
    });

    // Also check outbound exploits from vulnerabilities targeting this firmware
    // exploits can also be modeled as: vulnerability --exploits--> firmware
    // which means outbound from vulnerability, inbound to firmware
    // The inbound check above already covers this case.

    if (deviceIds.length === 0 || vulnIds.length === 0) continue;

    for (const vulnId of vulnIds) {
      const vuln = entityMap.get(vulnId)!;
      const vulnProps = parseProps(vuln.properties_json);

      for (const devId of deviceIds) {
        const dev = entityMap.get(devId)!;
        results.push({
          source_id: vulnId,
          target_id: devId,
          relationship: "potentially_vulnerable",
          confidence: 0.75,
          reason: `Device "${dev.label}" runs firmware "${fw.label}" which is exploited by "${vuln.label}"`,
          properties: {
            firmware_id: fw.entity_id,
            firmware_label: fw.label,
            ...(vulnProps.severity ? { severity: vulnProps.severity } : {}),
            ...(vulnProps.cvss ? { cvss: vulnProps.cvss } : {}),
          },
        });
      }
    }
  }

  return results;
}

/**
 * Rule 3: shared_network
 * If device A connects_to network N and device B connects_to network N,
 * suggest a "shared_network" edge between A and B.
 */
function inferSharedNetwork(
  entities: InferenceEntity[],
  adjacency: ReturnType<typeof buildAdjacency>,
): InferredRelationship[] {
  const results: InferredRelationship[] = [];
  const entityMap = new Map(entities.map(e => [e.entity_id, e]));

  const networkEntities = entities.filter(e => e.entity_type === "network");

  for (const net of networkEntities) {
    // Devices that connects_to this network
    const inboundRels = adjacency.inbound.get(net.entity_id);
    const deviceIds = (inboundRels?.get("connects_to") ?? []).filter(id => {
      const ent = entityMap.get(id);
      return ent && ent.entity_type === "device";
    });

    for (let i = 0; i < deviceIds.length; i++) {
      for (let j = i + 1; j < deviceIds.length; j++) {
        results.push({
          source_id: deviceIds[i],
          target_id: deviceIds[j],
          relationship: "shared_network",
          confidence: 0.90,
          reason: `Both devices connect to network "${net.label}"`,
          properties: { shared_network_id: net.entity_id, shared_network_label: net.label },
        });
      }
    }
  }

  return results;
}

/**
 * Rule 4: vendor_vulnerability_exposure
 * If vendor V manufactured_by device D, and vulnerability exploits D,
 * suggest a "vendor_exposure" link from vulnerability to vendor.
 */
function inferVendorExposure(
  entities: InferenceEntity[],
  adjacency: ReturnType<typeof buildAdjacency>,
): InferredRelationship[] {
  const results: InferredRelationship[] = [];
  const entityMap = new Map(entities.map(e => [e.entity_id, e]));

  // Find devices and their vendors (device --manufactured_by--> vendor)
  const devices = entities.filter(e => e.entity_type === "device");

  for (const dev of devices) {
    const outRels = adjacency.outbound.get(dev.entity_id);
    const vendorIds = outRels?.get("manufactured_by") ?? [];

    // Find vulnerabilities that exploit this device
    const inRels = adjacency.inbound.get(dev.entity_id);
    const vulnIds = (inRels?.get("exploits") ?? []).filter(id => {
      const ent = entityMap.get(id);
      return ent && ent.entity_type === "vulnerability";
    });

    if (vendorIds.length === 0 || vulnIds.length === 0) continue;

    for (const vulnId of vulnIds) {
      const vuln = entityMap.get(vulnId)!;
      for (const vendorId of vendorIds) {
        const vendor = entityMap.get(vendorId);
        if (!vendor) continue;

        results.push({
          source_id: vulnId,
          target_id: vendorId,
          relationship: "vendor_exposure",
          confidence: 0.65,
          reason: `Vulnerability "${vuln.label}" exploits device "${dev.label}" manufactured by "${vendor.label}"`,
          properties: { device_id: dev.entity_id, device_label: dev.label },
        });
      }
    }
  }

  return results;
}

/* ---------- main inference function ---------- */

/**
 * Detect implicit relationships from the given entities and edges.
 * Returns suggested relationships that do not yet exist in the graph,
 * deduplicated by (source_id, target_id, relationship).
 */
export function inferRelationships(
  entities: InferenceEntity[],
  edges: InferenceEdge[],
): InferredRelationship[] {
  if (entities.length === 0) return [];

  const adjacency = buildAdjacency(edges);

  // Run all inference rules
  const allInferred: InferredRelationship[] = [
    ...inferSimilarFirmware(entities, adjacency),
    ...inferPotentiallyVulnerable(entities, adjacency),
    ...inferSharedNetwork(entities, adjacency),
    ...inferVendorExposure(entities, adjacency),
  ];

  // Deduplicate: key = source_id + target_id + relationship
  // Keep the highest-confidence entry for each key
  const deduped = new Map<string, InferredRelationship>();
  for (const rel of allInferred) {
    const key = `${rel.source_id}:${rel.target_id}:${rel.relationship}`;
    const existing = deduped.get(key);
    if (!existing || existing.confidence < rel.confidence) {
      deduped.set(key, rel);
    }
  }

  // Filter out relationships that already exist as explicit edges
  const existingEdgeKeys = new Set(
    edges.map(e => `${e.source_id}:${e.target_id}:${e.relationship}`),
  );

  return [...deduped.values()].filter(
    r => !existingEdgeKeys.has(`${r.source_id}:${r.target_id}:${r.relationship}`),
  );
}
