// haiphen-graph/src/index.ts — Semantic Knowledge Graph service (D1-backed, v2.0.0)

import {
  upsertEntities,
  createEdges,
  queryGraph,
  listEntities,
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
} from "./graph-query";
import type { EntityInput, EdgeInput } from "./graph-query";

/* ---------- environment ---------- */

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  INTERNAL_TOKEN?: string;
  QUOTA_API_URL?: string;
};

/* ---------- shared helpers ---------- */

function uuid(): string {
  return crypto.randomUUID();
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io,https://auth.haiphen.io")
    .split(",").map(s => s.trim());
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) allowed.push(origin);
  const o = allowed.includes(origin) ? origin : "https://haiphen.io";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}

function corsOptions(req: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req, env) });
}

function okJson(data: unknown, rid: string, h?: Record<string, string>): Response {
  const headers = new Headers({ "Content-Type": "application/json", ...(h ?? {}) });
  headers.set("X-Request-Id", rid);
  return new Response(JSON.stringify(data, null, 2), { status: 200, headers });
}

function errJson(code: string, msg: string, rid: string, status: number, h?: Record<string, string>): Response {
  const headers = new Headers({ "Content-Type": "application/json", ...(h ?? {}) });
  headers.set("X-Request-Id", rid);
  return new Response(
    JSON.stringify({ error: { code, message: msg, request_id: rid } }, null, 2),
    { status, headers },
  );
}

/* ---------- JWT verification ---------- */

function base64UrlToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function verifyJwt(token: string, secret: string): Promise<{ sub: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [hB64, pB64, sB64] = parts;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(sB64),
    new TextEncoder().encode(`${hB64}.${pB64}`),
  );
  if (!ok) throw new Error("Invalid signature");
  const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(pB64)));
  if (claims.aud && claims.aud !== "haiphen-auth") throw new Error("Invalid audience");
  if (typeof claims.exp === "number" && claims.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired");
  if (!claims.sub) throw new Error("Missing sub");
  return { sub: claims.sub };
}

async function authUser(req: Request, env: Env, rid: string): Promise<{ user_login: string }> {
  const cookie = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)auth=([^;]+)/)?.[1];
  if (cookie) {
    const u = await verifyJwt(cookie, env.JWT_SECRET);
    return { user_login: u.sub };
  }
  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) {
    const u = await verifyJwt(bearer, env.JWT_SECRET);
    return { user_login: u.sub };
  }
  throw errJson("unauthorized", "Unauthorized", rid, 401);
}

/* ---------- daily quota check ---------- */

async function checkQuota(
  env: Env,
  userId: string,
  plan: string,
  sessionHash?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const apiUrl = env.QUOTA_API_URL || "https://api.haiphen.io";
  const token = env.INTERNAL_TOKEN;
  if (!token) return { allowed: true }; // fail-open if not configured

  try {
    const res = await fetch(`${apiUrl}/v1/internal/quota/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": token },
      body: JSON.stringify({ user_id: userId, plan, session_hash: sessionHash }),
    });
    if (!res.ok) return { allowed: true }; // fail-open on error
    const data = await res.json() as { allowed: boolean; reason?: string };
    return data;
  } catch {
    return { allowed: true }; // fail-open if unreachable
  }
}

/* ---------- request body parsing ---------- */

async function parseBody<T>(req: Request, rid: string, cors: Record<string, string>): Promise<T> {
  const ct = req.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) {
    throw errJson("invalid_content_type", "Content-Type must be application/json", rid, 415, cors);
  }
  try {
    return await req.json() as T;
  } catch {
    throw errJson("invalid_json", "Malformed JSON body", rid, 400, cors);
  }
}

/* ---------- route handler ---------- */

async function route(req: Request, env: Env): Promise<Response> {
  const rid = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  // CORS preflight
  if (req.method === "OPTIONS") return corsOptions(req, env);

  // ---- GET /v1/health (public) ----
  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({
      ok: true,
      service: "haiphen-graph",
      time: new Date().toISOString(),
      version: "v2.0.0",
    }, rid, cors);
  }

  // ---- GET /v1/graph/schema (public) ----
  if (req.method === "GET" && url.pathname === "/v1/graph/schema") {
    return okJson({
      entity_types: ENTITY_TYPES,
      relationship_types: RELATIONSHIP_TYPES,
      version: "v2.0.0",
    }, rid, cors);
  }

  // ---- POST /v1/graph/entities (authenticated, bulk upsert) ----
  if (req.method === "POST" && url.pathname === "/v1/graph/entities") {
    let user: { user_login: string };
    try {
      user = await authUser(req, env, rid);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) {
      return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    }

    const body = await parseBody<{ entities?: EntityInput[] }>(req, rid, cors);
    if (!body.entities || !Array.isArray(body.entities) || body.entities.length === 0) {
      return errJson("invalid_request", "Missing or empty entities array", rid, 400, cors);
    }

    // Validate each entity
    for (const ent of body.entities) {
      if (!ent.entity_type || typeof ent.entity_type !== "string") {
        return errJson("invalid_request", "Each entity must have an entity_type", rid, 400, cors);
      }
      if (!ent.label || typeof ent.label !== "string") {
        return errJson("invalid_request", "Each entity must have a label", rid, 400, cors);
      }
    }

    try {
      const result = await upsertEntities(env.DB, user.user_login, body.entities);
      return okJson({
        ingested: body.entities.length,
        created: result.created,
        updated: result.updated,
        entities: result.entities,
        ingested_by: user.user_login,
        timestamp: new Date().toISOString(),
      }, rid, cors);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to upsert entities";
      return errJson("invalid_request", msg, rid, 400, cors);
    }
  }

  // ---- GET /v1/graph/entities (authenticated, paginated list) ----
  if (req.method === "GET" && url.pathname === "/v1/graph/entities") {
    let user: { user_login: string };
    try {
      user = await authUser(req, env, rid);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) {
      return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    }

    const typeFilter = url.searchParams.get("type") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    try {
      const result = await listEntities(env.DB, user.user_login, typeFilter, limit, offset);
      return okJson(result, rid, cors);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to list entities";
      return errJson("invalid_request", msg, rid, 400, cors);
    }
  }

  // ---- POST /v1/graph/edges (authenticated, create relationships) ----
  if (req.method === "POST" && url.pathname === "/v1/graph/edges") {
    let user: { user_login: string };
    try {
      user = await authUser(req, env, rid);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) {
      return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    }

    const body = await parseBody<{ edges?: EdgeInput[] }>(req, rid, cors);
    if (!body.edges || !Array.isArray(body.edges) || body.edges.length === 0) {
      return errJson("invalid_request", "Missing or empty edges array", rid, 400, cors);
    }

    // Validate each edge
    for (const edge of body.edges) {
      if (!edge.source_id || !edge.target_id || !edge.relationship) {
        return errJson("invalid_request", "Each edge must have source_id, target_id, and relationship", rid, 400, cors);
      }
    }

    try {
      const result = await createEdges(env.DB, user.user_login, body.edges);
      return okJson({
        total: body.edges.length,
        created: result.created,
        skipped: result.skipped,
        edges: result.edges,
        created_by: user.user_login,
        timestamp: new Date().toISOString(),
      }, rid, cors);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create edges";
      return errJson("invalid_request", msg, rid, 400, cors);
    }
  }

  // ---- POST /v1/graph/query (authenticated, recursive traversal) ----
  if (req.method === "POST" && url.pathname === "/v1/graph/query") {
    let user: { user_login: string };
    try {
      user = await authUser(req, env, rid);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) {
      return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    }

    const body = await parseBody<{
      root_id?: string;
      depth?: number;
      direction?: "outbound" | "inbound" | "both";
    }>(req, rid, cors);

    if (!body.root_id || typeof body.root_id !== "string") {
      return errJson("invalid_request", "Missing root_id", rid, 400, cors);
    }

    const depth = Math.min(Math.max(body.depth || 2, 1), 5);
    const direction = body.direction || "outbound";

    if (!["outbound", "inbound", "both"].includes(direction)) {
      return errJson("invalid_request", "direction must be outbound, inbound, or both", rid, 400, cors);
    }

    try {
      const result = await queryGraph(env.DB, user.user_login, body.root_id, depth, direction);
      return okJson({
        root_id: body.root_id,
        depth,
        direction,
        queried_by: user.user_login,
        nodes: result.nodes,
        edges: result.edges,
        total_nodes: result.total_nodes,
        total_edges: result.total_edges,
      }, rid, cors);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to query graph";
      return errJson("query_error", msg, rid, 500, cors);
    }
  }

  // ---- fallback ----
  return errJson("not_found", "Not found", rid, 404, cors);
}

/* ---------- worker entry point ---------- */

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e: unknown) {
      if (e instanceof Response) return e;
      return errJson("internal", "Internal error", uuid(), 500);
    }
  },
};
