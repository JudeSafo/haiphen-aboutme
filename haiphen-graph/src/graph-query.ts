// haiphen-graph/src/graph-query.ts — D1-backed graph query engine

/* ---------- types ---------- */

export interface EntityInput {
  entity_type: string;
  label: string;
  properties?: Record<string, unknown>;
}

export interface EntityRow {
  entity_id: string;
  user_login: string;
  entity_type: string;
  label: string;
  properties_json: string | null;
  fingerprint: string;
  created_at: string;
  updated_at: string;
}

export interface EdgeInput {
  source_id: string;
  target_id: string;
  relationship: string;
  weight?: number;
  properties?: Record<string, unknown>;
}

export interface EdgeRow {
  edge_id: string;
  user_login: string;
  source_id: string;
  target_id: string;
  relationship: string;
  weight: number;
  properties_json: string | null;
  created_at: string;
}

export interface UpsertResult {
  created: number;
  updated: number;
  entities: { entity_id: string; fingerprint: string; action: "created" | "updated" }[];
}

export interface EdgeCreateResult {
  created: number;
  skipped: number;
  edges: { edge_id: string; action: "created" | "skipped" }[];
}

export interface TraversalResult {
  nodes: (EntityRow & { depth: number })[];
  edges: EdgeRow[];
  total_nodes: number;
  total_edges: number;
}

export interface ListResult {
  items: EntityRow[];
  total: number;
  limit: number;
  offset: number;
}

/* ---------- constants ---------- */

const VALID_ENTITY_TYPES = new Set([
  "device", "network", "protocol", "vulnerability", "user",
  "location", "vendor", "service", "firmware", "certificate",
]);

const VALID_RELATIONSHIPS = new Set([
  "connects_to", "runs_on", "exploits", "manages", "located_at",
  "manufactured_by", "depends_on", "communicates_with", "authenticates",
  "monitors", "contains", "upgrades_to",
]);

const MAX_TRAVERSAL_DEPTH = 5;
const MAX_TRAVERSAL_RESULTS = 500;
const MAX_BATCH_SIZE = 200;

/* ---------- helpers ---------- */

function uuid(): string {
  return crypto.randomUUID();
}

async function fingerprint(userLogin: string, entityType: string, label: string): Promise<string> {
  const raw = `${userLogin}:${entityType}:${label}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- upsertEntities ---------- */

export async function upsertEntities(
  db: D1Database,
  userLogin: string,
  entities: EntityInput[],
): Promise<UpsertResult> {
  if (!entities.length) return { created: 0, updated: 0, entities: [] };
  if (entities.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size ${entities.length} exceeds maximum ${MAX_BATCH_SIZE}`);
  }

  const results: UpsertResult = { created: 0, updated: 0, entities: [] };

  // Compute fingerprints for all entities
  const prepared: { input: EntityInput; fp: string; id: string }[] = [];
  for (const e of entities) {
    if (!VALID_ENTITY_TYPES.has(e.entity_type)) {
      throw new Error(`Invalid entity_type: ${e.entity_type}`);
    }
    if (!e.label || typeof e.label !== "string" || e.label.length > 500) {
      throw new Error("label is required and must be <= 500 chars");
    }
    const fp = await fingerprint(userLogin, e.entity_type, e.label);
    prepared.push({ input: e, fp, id: uuid() });
  }

  // Check which fingerprints already exist
  const fpList = prepared.map(p => p.fp);
  const placeholders = fpList.map(() => "?").join(",");
  const existing = await db
    .prepare(`SELECT entity_id, fingerprint FROM graph_entities WHERE fingerprint IN (${placeholders}) AND user_login = ?`)
    .bind(...fpList, userLogin)
    .all<{ entity_id: string; fingerprint: string }>();

  const existingMap = new Map<string, string>();
  for (const row of existing.results ?? []) {
    existingMap.set(row.fingerprint, row.entity_id);
  }

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];

  for (const p of prepared) {
    const propsJson = p.input.properties ? JSON.stringify(p.input.properties) : null;
    const existingId = existingMap.get(p.fp);

    if (existingId) {
      // Update existing entity
      stmts.push(
        db.prepare(
          `UPDATE graph_entities SET label = ?, properties_json = ?, updated_at = ? WHERE entity_id = ? AND user_login = ?`,
        ).bind(p.input.label, propsJson, now, existingId, userLogin),
      );
      results.updated++;
      results.entities.push({ entity_id: existingId, fingerprint: p.fp, action: "updated" });
    } else {
      // Insert new entity
      stmts.push(
        db.prepare(
          `INSERT INTO graph_entities (entity_id, user_login, entity_type, label, properties_json, fingerprint, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(p.id, userLogin, p.input.entity_type, p.input.label, propsJson, p.fp, now, now),
      );
      results.created++;
      results.entities.push({ entity_id: p.id, fingerprint: p.fp, action: "created" });
    }
  }

  // Execute in a batch for atomicity
  if (stmts.length) {
    await db.batch(stmts);
  }

  return results;
}

/* ---------- createEdges ---------- */

export async function createEdges(
  db: D1Database,
  userLogin: string,
  edges: EdgeInput[],
): Promise<EdgeCreateResult> {
  if (!edges.length) return { created: 0, skipped: 0, edges: [] };
  if (edges.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size ${edges.length} exceeds maximum ${MAX_BATCH_SIZE}`);
  }

  const results: EdgeCreateResult = { created: 0, skipped: 0, edges: [] };
  const stmts: D1PreparedStatement[] = [];

  for (const e of edges) {
    if (!VALID_RELATIONSHIPS.has(e.relationship)) {
      throw new Error(`Invalid relationship: ${e.relationship}`);
    }
    if (!e.source_id || !e.target_id) {
      throw new Error("source_id and target_id are required");
    }
    if (e.source_id === e.target_id) {
      throw new Error("Self-referencing edges are not allowed");
    }

    const edgeId = uuid();
    const weight = typeof e.weight === "number" ? e.weight : 1.0;
    const propsJson = e.properties ? JSON.stringify(e.properties) : null;

    // Use INSERT OR IGNORE to handle the unique constraint on (user_login, source_id, target_id, relationship)
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO graph_edges (edge_id, user_login, source_id, target_id, relationship, weight, properties_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(edgeId, userLogin, e.source_id, e.target_id, e.relationship, weight, propsJson),
    );

    results.edges.push({ edge_id: edgeId, action: "created" });
  }

  if (stmts.length) {
    const batchResults = await db.batch(stmts);
    // Check which inserts succeeded vs were ignored
    for (let i = 0; i < batchResults.length; i++) {
      const meta = batchResults[i]?.meta;
      if (meta && meta.changes === 0) {
        results.edges[i].action = "skipped";
        results.skipped++;
      } else {
        results.created++;
      }
    }
  }

  return results;
}

/* ---------- queryGraph (recursive CTE traversal) ---------- */

export async function queryGraph(
  db: D1Database,
  userLogin: string,
  rootId: string,
  depth: number = 2,
  direction: "outbound" | "inbound" | "both" = "outbound",
): Promise<TraversalResult> {
  const clampedDepth = Math.max(1, Math.min(depth, MAX_TRAVERSAL_DEPTH));

  // Build the recursive CTE based on direction
  let joinCondition: string;
  let selectFields: string;
  switch (direction) {
    case "outbound":
      joinCondition = "e.source_id = r.node_id";
      selectFields = "e.target_id";
      break;
    case "inbound":
      joinCondition = "e.target_id = r.node_id";
      selectFields = "e.source_id";
      break;
    case "both":
      // For bidirectional, we traverse in both directions
      joinCondition = "(e.source_id = r.node_id OR e.target_id = r.node_id)";
      selectFields = "CASE WHEN e.source_id = r.node_id THEN e.target_id ELSE e.source_id END";
      break;
  }

  const sql = `
    WITH RECURSIVE reachable(node_id, depth) AS (
      SELECT ?, 0
      UNION ALL
      SELECT ${selectFields}, r.depth + 1
      FROM graph_edges e
      JOIN reachable r ON ${joinCondition}
      WHERE e.user_login = ?
        AND r.depth < ?
    )
    SELECT DISTINCT n.entity_id, n.user_login, n.entity_type, n.label,
           n.properties_json, n.fingerprint, n.created_at, n.updated_at,
           MIN(r.depth) AS depth
    FROM reachable r
    JOIN graph_entities n ON n.entity_id = r.node_id AND n.user_login = ?
    GROUP BY n.entity_id
    ORDER BY depth ASC, n.entity_id ASC
    LIMIT ?
  `;

  const nodeResults = await db
    .prepare(sql)
    .bind(rootId, userLogin, clampedDepth, userLogin, MAX_TRAVERSAL_RESULTS)
    .all<EntityRow & { depth: number }>();

  const nodes = nodeResults.results ?? [];

  if (nodes.length === 0) {
    return { nodes: [], edges: [], total_nodes: 0, total_edges: 0 };
  }

  // Fetch edges between discovered nodes
  const nodeIds = nodes.map(n => n.entity_id);
  const ph = nodeIds.map(() => "?").join(",");
  const edgeSql = `
    SELECT edge_id, user_login, source_id, target_id, relationship, weight, properties_json, created_at
    FROM graph_edges
    WHERE user_login = ?
      AND source_id IN (${ph})
      AND target_id IN (${ph})
    ORDER BY created_at ASC
    LIMIT ?
  `;

  const edgeResults = await db
    .prepare(edgeSql)
    .bind(userLogin, ...nodeIds, ...nodeIds, MAX_TRAVERSAL_RESULTS)
    .all<EdgeRow>();

  const edges = edgeResults.results ?? [];

  return {
    nodes,
    edges,
    total_nodes: nodes.length,
    total_edges: edges.length,
  };
}

/* ---------- listEntities ---------- */

export async function listEntities(
  db: D1Database,
  userLogin: string,
  type?: string | null,
  limit: number = 50,
  offset: number = 0,
): Promise<ListResult> {
  const clampedLimit = Math.max(1, Math.min(limit, 200));
  const clampedOffset = Math.max(0, offset);

  if (type && !VALID_ENTITY_TYPES.has(type)) {
    throw new Error(`Invalid entity_type: ${type}`);
  }

  let countSql: string;
  let listSql: string;
  let binds: unknown[];

  if (type) {
    countSql = `SELECT COUNT(*) as total FROM graph_entities WHERE user_login = ? AND entity_type = ?`;
    listSql = `SELECT entity_id, user_login, entity_type, label, properties_json, fingerprint, created_at, updated_at
               FROM graph_entities WHERE user_login = ? AND entity_type = ?
               ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    binds = [userLogin, type];
  } else {
    countSql = `SELECT COUNT(*) as total FROM graph_entities WHERE user_login = ?`;
    listSql = `SELECT entity_id, user_login, entity_type, label, properties_json, fingerprint, created_at, updated_at
               FROM graph_entities WHERE user_login = ?
               ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    binds = [userLogin];
  }

  const [countResult, listResult] = await db.batch([
    db.prepare(countSql).bind(...binds),
    db.prepare(listSql).bind(...binds, clampedLimit, clampedOffset),
  ]);

  const total = ((countResult.results ?? [])[0] as { total: number } | undefined)?.total ?? 0;
  const items = (listResult.results ?? []) as EntityRow[];

  return { items, total, limit: clampedLimit, offset: clampedOffset };
}

/* ---------- exports for schema endpoint ---------- */

export const ENTITY_TYPES = [...VALID_ENTITY_TYPES];
export const RELATIONSHIP_TYPES = [...VALID_RELATIONSHIPS];
