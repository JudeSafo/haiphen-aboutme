// ---------------------------------------------------------------------------
// haiphen-graph -- GCP Cloud Function entry point
//
// Wraps the CF Worker's route handler with Firestore-backed D1 adapter.
// Business logic (graph-query) is copied from haiphen-graph/src/
// by the build script.
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";
import * as ff from "@google-cloud/functions-framework";
import { FirestoreD1Adapter } from "./shared/firestore-d1";
import {
  upsertEntities,
  createEdges,
  queryGraph,
  listEntities,
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
} from "./graph-query";
import type { EntityInput, EdgeInput } from "./graph-query";

// ---------------------------------------------------------------------------
// Env type (mirrors CF Worker)
// ---------------------------------------------------------------------------

type Env = {
  DB: FirestoreD1Adapter;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  INTERNAL_TOKEN?: string;
  QUOTA_API_URL?: string;
};

// Lazy-init Firestore
let _db: Firestore | null = null;
function getDb(): Firestore {
  if (!_db) _db = new Firestore();
  return _db;
}

function buildEnv(): Env {
  return {
    DB: new FirestoreD1Adapter(getDb()),
    JWT_SECRET: process.env.JWT_SECRET ?? "",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io",
    INTERNAL_TOKEN: process.env.INTERNAL_TOKEN ?? "",
    QUOTA_API_URL: process.env.QUOTA_API_URL ?? "https://api.haiphen.io",
  };
}

// ---------------------------------------------------------------------------
// Shared helpers (identical across all scaffold workers)
// ---------------------------------------------------------------------------

function uuid(): string { return crypto.randomUUID(); }

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io")
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

function okJson(data: unknown, requestId: string, headers?: Record<string, string>): Response {
  const h = new Headers({ "Content-Type": "application/json", ...(headers ?? {}) });
  h.set("X-Request-Id", requestId);
  return new Response(JSON.stringify(data, null, 2), { status: 200, headers: h });
}

function errJson(code: string, message: string, requestId: string, status: number, headers?: Record<string, string>): Response {
  const h = new Headers({ "Content-Type": "application/json", ...(headers ?? {}) });
  h.set("X-Request-Id", requestId);
  return new Response(JSON.stringify({ error: { code, message, request_id: requestId } }, null, 2), { status, headers: h });
}

// ---- JWT auth ----

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
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(sB64), new TextEncoder().encode(`${hB64}.${pB64}`));
  if (!ok) throw new Error("Invalid signature");
  const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(pB64)));
  if (claims.aud && claims.aud !== "haiphen-auth") throw new Error("Invalid audience");
  if (typeof claims.exp === "number" && claims.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired");
  if (!claims.sub) throw new Error("Missing sub");
  return { sub: claims.sub };
}

function getAuthToken(req: Request): string | null {
  const cookie = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)auth=([^;]+)/)?.[1];
  if (cookie) return cookie;
  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || null;
}

async function authUser(req: Request, env: Env, requestId: string): Promise<{ user_login: string }> {
  const token = getAuthToken(req);
  if (!token) throw errJson("unauthorized", "Unauthorized", requestId, 401);
  try {
    const user = await verifyJwt(token, env.JWT_SECRET);
    return { user_login: user.sub };
  } catch {
    throw errJson("unauthorized", "Invalid or expired token", requestId, 401);
  }
}

// ---- Quota check ----

async function checkQuota(env: Env, userId: string, plan: string): Promise<{ allowed: boolean; reason?: string }> {
  const apiUrl = env.QUOTA_API_URL || "https://api.haiphen.io";
  const token = env.INTERNAL_TOKEN;
  if (!token) return { allowed: true };
  try {
    const res = await fetch(`${apiUrl}/v1/internal/quota/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": token },
      body: JSON.stringify({ user_id: userId, plan }),
    });
    if (!res.ok) return { allowed: true };
    return await res.json() as { allowed: boolean; reason?: string };
  } catch {
    return { allowed: true };
  }
}

// ---- Request body parsing ----

async function parseBody<T>(req: Request, requestId: string, cors: Record<string, string>): Promise<T> {
  const ct = req.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) {
    throw errJson("invalid_content_type", "Content-Type must be application/json", requestId, 415, cors);
  }
  try {
    return await req.json() as T;
  } catch {
    throw errJson("invalid_json", "Malformed JSON body", requestId, 400, cors);
  }
}

// ---------------------------------------------------------------------------
// Route handler (matches haiphen-graph/src/index.ts)
// ---------------------------------------------------------------------------

async function route(req: Request, env: Env): Promise<Response> {
  const requestId = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  // CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // ---- GET /v1/health (public) ----
  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({
      ok: true,
      service: "haiphen-graph",
      runtime: "gcp",
      time: new Date().toISOString(),
      version: "v2.0.0",
    }, requestId, cors);
  }

  // ---- GET /v1/graph/schema (public) ----
  if (req.method === "GET" && url.pathname === "/v1/graph/schema") {
    return okJson({
      entity_types: ENTITY_TYPES,
      relationship_types: RELATIONSHIP_TYPES,
      version: "v2.0.0",
    }, requestId, cors);
  }

  // ---- POST /v1/graph/entities (authenticated, bulk upsert) ----
  if (req.method === "POST" && url.pathname === "/v1/graph/entities") {
    const user = await authUser(req, env, requestId);

    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) {
      return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);
    }

    const body = await parseBody<{ entities?: EntityInput[] }>(req, requestId, cors);
    if (!body.entities || !Array.isArray(body.entities) || body.entities.length === 0) {
      return errJson("invalid_request", "Missing or empty entities array", requestId, 400, cors);
    }

    // Validate each entity
    for (const ent of body.entities) {
      if (!ent.entity_type || typeof ent.entity_type !== "string") {
        return errJson("invalid_request", "Each entity must have an entity_type", requestId, 400, cors);
      }
      if (!ent.label || typeof ent.label !== "string") {
        return errJson("invalid_request", "Each entity must have a label", requestId, 400, cors);
      }
    }

    try {
      const result = await upsertEntities(env.DB as any, user.user_login, body.entities);
      return okJson({
        ingested: body.entities.length,
        created: result.created,
        updated: result.updated,
        entities: result.entities,
        ingested_by: user.user_login,
        timestamp: new Date().toISOString(),
      }, requestId, cors);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to upsert entities";
      return errJson("invalid_request", msg, requestId, 400, cors);
    }
  }

  // ---- GET /v1/graph/entities (authenticated, paginated list) ----
  if (req.method === "GET" && url.pathname === "/v1/graph/entities") {
    const user = await authUser(req, env, requestId);

    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) {
      return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);
    }

    const typeFilter = url.searchParams.get("type") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    try {
      const result = await listEntities(env.DB as any, user.user_login, typeFilter, limit, offset);
      return okJson(result, requestId, cors);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to list entities";
      return errJson("invalid_request", msg, requestId, 400, cors);
    }
  }

  // ---- POST /v1/graph/edges (authenticated, create relationships) ----
  if (req.method === "POST" && url.pathname === "/v1/graph/edges") {
    const user = await authUser(req, env, requestId);

    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) {
      return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);
    }

    const body = await parseBody<{ edges?: EdgeInput[] }>(req, requestId, cors);
    if (!body.edges || !Array.isArray(body.edges) || body.edges.length === 0) {
      return errJson("invalid_request", "Missing or empty edges array", requestId, 400, cors);
    }

    // Validate each edge
    for (const edge of body.edges) {
      if (!edge.source_id || !edge.target_id || !edge.relationship) {
        return errJson("invalid_request", "Each edge must have source_id, target_id, and relationship", requestId, 400, cors);
      }
    }

    try {
      const result = await createEdges(env.DB as any, user.user_login, body.edges);
      return okJson({
        total: body.edges.length,
        created: result.created,
        skipped: result.skipped,
        edges: result.edges,
        created_by: user.user_login,
        timestamp: new Date().toISOString(),
      }, requestId, cors);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create edges";
      return errJson("invalid_request", msg, requestId, 400, cors);
    }
  }

  // ---- POST /v1/graph/query (authenticated, recursive traversal) ----
  if (req.method === "POST" && url.pathname === "/v1/graph/query") {
    const user = await authUser(req, env, requestId);

    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) {
      return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);
    }

    const body = await parseBody<{
      root_id?: string;
      depth?: number;
      direction?: "outbound" | "inbound" | "both";
    }>(req, requestId, cors);

    if (!body.root_id || typeof body.root_id !== "string") {
      return errJson("invalid_request", "Missing root_id", requestId, 400, cors);
    }

    const depth = Math.min(Math.max(body.depth || 2, 1), 5);
    const direction = body.direction || "outbound";

    if (!["outbound", "inbound", "both"].includes(direction)) {
      return errJson("invalid_request", "direction must be outbound, inbound, or both", requestId, 400, cors);
    }

    try {
      const result = await queryGraph(env.DB as any, user.user_login, body.root_id, depth, direction);
      return okJson({
        root_id: body.root_id,
        depth,
        direction,
        queried_by: user.user_login,
        nodes: result.nodes,
        edges: result.edges,
        total_nodes: result.total_nodes,
        total_edges: result.total_edges,
      }, requestId, cors);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to query graph";
      return errJson("query_error", msg, requestId, 500, cors);
    }
  }

  // ---- fallback ----
  return errJson("not_found", "Not found", requestId, 404, cors);
}

// ---------------------------------------------------------------------------
// Cloud Function entry point
// ---------------------------------------------------------------------------

ff.http("handler", async (req, res) => {
  try {
    const env = buildEnv();
    const protocol = req.protocol || "https";
    const host = req.get("host") || "localhost";
    const url = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (typeof val === "string") headers.set(key, val);
      else if (Array.isArray(val)) headers.set(key, val.join(", "));
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody && req.body
      ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body))
      : undefined;

    const webReq = new Request(url, { method: req.method, headers, body });
    const webRes = await route(webReq, env);

    res.status(webRes.status);
    webRes.headers.forEach((value, key) => res.setHeader(key, value));
    res.send(await webRes.text());
  } catch (e) {
    if (e instanceof Response) {
      res.status(e.status);
      e.headers.forEach((value, key) => res.setHeader(key, value));
      res.send(await e.text());
    } else {
      console.error("Unhandled error:", e);
      res.status(500).json({ error: { code: "internal", message: "Internal error" } });
    }
  }
});
