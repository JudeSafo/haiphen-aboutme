// ---------------------------------------------------------------------------
// haiphen-causal — GCP Cloud Function entry point
//
// Wraps the CF Worker's route handler with Firestore-backed D1 adapter.
// Business logic (dag-builder, root-cause) is copied from haiphen-causal/src/
// by the build script.
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";
import * as ff from "@google-cloud/functions-framework";
import { FirestoreD1Adapter } from "./shared/firestore-d1";
import { buildDag, type CausalEvent } from "./dag-builder";
import { analyzeRootCauses } from "./root-cause";

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

// ---------------------------------------------------------------------------
// Valid event types
// ---------------------------------------------------------------------------

const VALID_EVENT_TYPES = [
  "firmware_update", "restart", "config_change", "alert", "connectivity_loss",
  "service_degradation", "network_change", "power_event", "security_event",
  "resource_exhaustion", "maintenance", "deployment",
];

// ---------------------------------------------------------------------------
// Route handler (matches haiphen-causal/src/index.ts)
// ---------------------------------------------------------------------------

async function route(req: Request, env: Env): Promise<Response> {
  const requestId = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({ ok: true, service: "haiphen-causal", runtime: "gcp", time: new Date().toISOString(), version: "v2.0.0" }, requestId, cors);
  }

  // GET /v1/causal/event-types — public
  if (req.method === "GET" && url.pathname === "/v1/causal/event-types") {
    return okJson({ event_types: VALID_EVENT_TYPES }, requestId, cors);
  }

  // POST /v1/causal/events — ingest events into D1
  if (req.method === "POST" && url.pathname === "/v1/causal/events") {
    const user = await authUser(req, env, requestId);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);

    const body = await req.json().catch(() => null) as null | {
      events: Array<{
        event_type: string;
        source: string;
        description?: string;
        severity?: string;
        timestamp: string;
        metadata?: Record<string, unknown>;
      }>;
    };

    if (!body?.events || !Array.isArray(body.events) || body.events.length === 0) {
      return errJson("invalid_request", "Missing events array", requestId, 400, cors);
    }
    if (body.events.length > 500) {
      return errJson("invalid_request", "Maximum 500 events per request", requestId, 400, cors);
    }

    const inserted: string[] = [];
    const batchSize = 50;

    for (let i = 0; i < body.events.length; i += batchSize) {
      const batch = body.events.slice(i, i + batchSize);
      const stmts = batch.map(ev => {
        const eventId = uuid();
        inserted.push(eventId);
        return env.DB.prepare(
          `INSERT INTO causal_events (event_id, user_login, event_type, source, description, severity, timestamp, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          eventId, user.user_login, ev.event_type, ev.source,
          ev.description || null, ev.severity || "info", ev.timestamp,
          ev.metadata ? JSON.stringify(ev.metadata) : null,
        );
      });
      await env.DB.batch(stmts);
    }

    return okJson({
      ingested: inserted.length,
      event_ids: inserted,
    }, requestId, cors);
  }

  // GET /v1/causal/events — list user's events
  if (req.method === "GET" && url.pathname === "/v1/causal/events") {
    const user = await authUser(req, env, requestId);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const rows = await env.DB.prepare(
      `SELECT event_id, event_type, source, severity, timestamp, created_at
       FROM causal_events WHERE user_login = ?
       ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ).bind(user.user_login, limit, offset).all();

    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM causal_events WHERE user_login = ?"
    ).bind(user.user_login).first<{ cnt: number }>();

    return okJson({ items: rows.results, total: countRow?.cnt ?? 0, limit, offset }, requestId, cors);
  }

  // POST /v1/causal/analyze — build DAG and find root causes
  if (req.method === "POST" && url.pathname === "/v1/causal/analyze") {
    const user = await authUser(req, env, requestId);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);

    const body = await req.json().catch(() => null) as null | {
      event_ids?: string[];
      window_hours?: number;
      source_filter?: string;
      time_range?: { start: string; end: string };
    };

    const windowHours = body?.window_hours ?? 24;
    if (windowHours < 0.1 || windowHours > 168) {
      return errJson("invalid_request", "window_hours must be between 0.1 and 168", requestId, 400, cors);
    }

    const analysisId = uuid();
    const startedAt = new Date().toISOString();

    // Fetch events from D1
    let events: CausalEvent[];

    if (body?.event_ids && body.event_ids.length > 0) {
      // Fetch specific events
      const placeholders = body.event_ids.map(() => "?").join(",");
      const rows = await env.DB.prepare(
        `SELECT event_id, event_type, source, description, severity, timestamp, metadata_json
         FROM causal_events WHERE user_login = ? AND event_id IN (${placeholders})
         ORDER BY timestamp ASC`
      ).bind(user.user_login, ...body.event_ids).all<{
        event_id: string; event_type: string; source: string;
        description: string | null; severity: string; timestamp: string;
        metadata_json: string | null;
      }>();
      events = rows.results.map((r: any) => ({
        ...r,
        metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
      }));
    } else {
      // Fetch recent events within time range or last N hours
      let query = `SELECT event_id, event_type, source, description, severity, timestamp, metadata_json
         FROM causal_events WHERE user_login = ?`;
      const bindings: unknown[] = [user.user_login];

      if (body?.time_range) {
        query += " AND timestamp >= ? AND timestamp <= ?";
        bindings.push(body.time_range.start, body.time_range.end);
      }

      if (body?.source_filter) {
        query += " AND source = ?";
        bindings.push(body.source_filter);
      }

      query += " ORDER BY timestamp ASC LIMIT 500";

      const rows = await env.DB.prepare(query).bind(...bindings).all<{
        event_id: string; event_type: string; source: string;
        description: string | null; severity: string; timestamp: string;
        metadata_json: string | null;
      }>();
      events = rows.results.map((r: any) => ({
        ...r,
        metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
      }));
    }

    if (events.length < 2) {
      return errJson("invalid_request", "Need at least 2 events for causal analysis", requestId, 400, cors);
    }

    // Build DAG
    const dag = buildDag(events, windowHours);

    // Analyze root causes
    const analysis = analyzeRootCauses(dag);

    const completedAt = new Date().toISOString();

    // Persist analysis
    await env.DB.prepare(
      `INSERT INTO causal_analyses (analysis_id, user_login, status, event_ids_json, window_hours, dag_json, root_causes_json, propagation_json, counterfactuals_json, total_events, root_cause_count, started_at, completed_at)
       VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      analysisId, user.user_login,
      JSON.stringify(events.map(e => e.event_id)),
      windowHours,
      JSON.stringify(dag),
      JSON.stringify(analysis.root_causes),
      JSON.stringify(analysis.propagation_chain),
      JSON.stringify(analysis.counterfactuals),
      events.length,
      analysis.root_causes.length,
      startedAt, completedAt,
    ).run();

    return okJson({
      analysis_id: analysisId,
      status: "completed",
      initiated_by: user.user_login,
      started_at: startedAt,
      completed_at: completedAt,
      total_events: events.length,
      window_hours: windowHours,
      dag,
      root_causes: analysis.root_causes,
      propagation_chain: analysis.propagation_chain,
      counterfactuals: analysis.counterfactuals,
      topological_order: analysis.topological_order,
    }, requestId, cors);
  }

  // GET /v1/causal/analyze/:id — retrieve analysis
  const analysisMatch = url.pathname.match(/^\/v1\/causal\/analyze\/([a-f0-9-]+)$/);
  if (req.method === "GET" && analysisMatch) {
    const user = await authUser(req, env, requestId);
    const analysisId = analysisMatch[1];

    const row = await env.DB.prepare(
      `SELECT analysis_id, status, event_ids_json, window_hours, dag_json, root_causes_json, propagation_json, counterfactuals_json, total_events, root_cause_count, started_at, completed_at, created_at
       FROM causal_analyses WHERE analysis_id = ? AND user_login = ?`
    ).bind(analysisId, user.user_login).first<{
      analysis_id: string; status: string; event_ids_json: string;
      window_hours: number; dag_json: string | null; root_causes_json: string | null;
      propagation_json: string | null; counterfactuals_json: string | null;
      total_events: number; root_cause_count: number;
      started_at: string | null; completed_at: string | null; created_at: string;
    }>();

    if (!row) return errJson("not_found", "Analysis not found", requestId, 404, cors);

    return okJson({
      analysis_id: row.analysis_id,
      status: row.status,
      total_events: row.total_events,
      window_hours: row.window_hours,
      root_cause_count: row.root_cause_count,
      dag: row.dag_json ? JSON.parse(row.dag_json) : null,
      root_causes: row.root_causes_json ? JSON.parse(row.root_causes_json) : [],
      propagation_chain: row.propagation_json ? JSON.parse(row.propagation_json) : [],
      counterfactuals: row.counterfactuals_json ? JSON.parse(row.counterfactuals_json) : [],
      started_at: row.started_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
    }, requestId, cors);
  }

  // GET /v1/causal/analyses — paginated list
  if (req.method === "GET" && url.pathname === "/v1/causal/analyses") {
    const user = await authUser(req, env, requestId);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const rows = await env.DB.prepare(
      `SELECT analysis_id, status, total_events, root_cause_count, window_hours, created_at
       FROM causal_analyses WHERE user_login = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(user.user_login, limit, offset).all();

    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM causal_analyses WHERE user_login = ?"
    ).bind(user.user_login).first<{ cnt: number }>();

    return okJson({ items: rows.results, total: countRow?.cnt ?? 0, limit, offset }, requestId, cors);
  }

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
