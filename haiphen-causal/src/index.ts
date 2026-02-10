// haiphen-causal/src/index.ts — Causal Chain / Root Cause Intelligence service (D1-backed)

import { buildDag, type CausalEvent } from "./dag-builder";
import { analyzeRootCauses } from "./root-cause";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  INTERNAL_TOKEN?: string;
  QUOTA_API_URL?: string;
};

function uuid(): string { return crypto.randomUUID(); }

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io,https://auth.haiphen.io")
    .split(",").map(s => s.trim());
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) allowed.push(origin);
  const o = allowed.includes(origin) ? origin : "https://haiphen.io";
  return { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Vary": "Origin" };
}

function okJson(data: unknown, rid: string, h?: Record<string, string>): Response {
  const headers = new Headers({ "Content-Type": "application/json", ...(h ?? {}) });
  headers.set("X-Request-Id", rid);
  return new Response(JSON.stringify(data, null, 2), { status: 200, headers });
}

function errJson(code: string, msg: string, rid: string, status: number, h?: Record<string, string>): Response {
  const headers = new Headers({ "Content-Type": "application/json", ...(h ?? {}) });
  headers.set("X-Request-Id", rid);
  return new Response(JSON.stringify({ error: { code, message: msg, request_id: rid } }, null, 2), { status, headers });
}

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

async function authUser(req: Request, env: Env, rid: string): Promise<{ user_login: string }> {
  const cookie = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)auth=([^;]+)/)?.[1];
  if (cookie) { try { const u = await verifyJwt(cookie, env.JWT_SECRET); return { user_login: u.sub }; } catch { /* fall through */ } }
  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) { try { const u = await verifyJwt(bearer, env.JWT_SECRET); return { user_login: u.sub }; } catch { /* fall through */ } }
  throw errJson("unauthorized", "Unauthorized", rid, 401);
}

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
  } catch { return { allowed: true }; }
}

const VALID_EVENT_TYPES = [
  "firmware_update", "restart", "config_change", "alert", "connectivity_loss",
  "service_degradation", "network_change", "power_event", "security_event",
  "resource_exhaustion", "maintenance", "deployment",
];

async function route(req: Request, env: Env): Promise<Response> {
  const rid = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({ ok: true, service: "haiphen-causal", time: new Date().toISOString(), version: "v2.0.0" }, rid, cors);
  }

  // GET /v1/causal/event-types — public
  if (req.method === "GET" && url.pathname === "/v1/causal/event-types") {
    return okJson({ event_types: VALID_EVENT_TYPES }, rid, cors);
  }

  // POST /v1/causal/events — ingest events into D1
  if (req.method === "POST" && url.pathname === "/v1/causal/events") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);

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
      return errJson("invalid_request", "Missing events array", rid, 400, cors);
    }
    if (body.events.length > 500) {
      return errJson("invalid_request", "Maximum 500 events per request", rid, 400, cors);
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
    }, rid, cors);
  }

  // GET /v1/causal/events — list user's events
  if (req.method === "GET" && url.pathname === "/v1/causal/events") {
    const user = await authUser(req, env, rid);
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

    return okJson({ items: rows.results, total: countRow?.cnt ?? 0, limit, offset }, rid, cors);
  }

  // POST /v1/causal/analyze — build DAG and find root causes
  if (req.method === "POST" && url.pathname === "/v1/causal/analyze") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);

    const body = await req.json().catch(() => null) as null | {
      event_ids?: string[];
      window_hours?: number;
      source_filter?: string;
      time_range?: { start: string; end: string };
    };

    const windowHours = body?.window_hours ?? 24;
    if (windowHours < 0.1 || windowHours > 168) {
      return errJson("invalid_request", "window_hours must be between 0.1 and 168", rid, 400, cors);
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
      events = rows.results.map(r => ({
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
      events = rows.results.map(r => ({
        ...r,
        metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
      }));
    }

    if (events.length < 2) {
      return errJson("invalid_request", "Need at least 2 events for causal analysis", rid, 400, cors);
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
    }, rid, cors);
  }

  // GET /v1/causal/analyze/:id — retrieve analysis
  const analysisMatch = url.pathname.match(/^\/v1\/causal\/analyze\/([a-f0-9-]+)$/);
  if (req.method === "GET" && analysisMatch) {
    const user = await authUser(req, env, rid);
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

    if (!row) return errJson("not_found", "Analysis not found", rid, 404, cors);

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
    }, rid, cors);
  }

  // GET /v1/causal/analyses — paginated list
  if (req.method === "GET" && url.pathname === "/v1/causal/analyses") {
    const user = await authUser(req, env, rid);
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

    return okJson({ items: rows.results, total: countRow?.cnt ?? 0, limit, offset }, rid, cors);
  }

  // POST /v1/causal/prospect-analyze (internal — service-to-service)
  if (req.method === "POST" && url.pathname === "/v1/causal/prospect-analyze") {
    const tok = req.headers.get("X-Internal-Token") || "";
    if (!env.INTERNAL_TOKEN || tok !== env.INTERNAL_TOKEN) {
      return errJson("forbidden", "Forbidden", rid, 403, cors);
    }

    const body = await req.json().catch(() => null) as null | {
      lead_id: string; entity_name: string;
      vulnerability_id?: string; summary: string;
      upstream_context?: {
        prior_scores: Record<string, number>;
        prior_findings: string[];
        investigation_id: string;
      };
    };
    if (!body?.lead_id) return errJson("invalid_request", "Missing lead_id", rid, 400, cors);

    const findings: string[] = [];
    let score = 15; // baseline
    const lower = body.summary.toLowerCase();

    // Upstream context: prior findings seed cascade search
    const uc = body.upstream_context;
    if (uc && uc.prior_findings && uc.prior_findings.length > 0) {
      score += Math.min(uc.prior_findings.length * 3, 15);
      findings.push(`Cascade seeded by ${uc.prior_findings.length} upstream finding(s)`);
    }
    // If network flagged protocol issues, deepen cascade search
    if (uc && (uc.prior_scores?.network ?? 0) > 40) {
      score += 10;
      findings.push("Network protocol exposure feeds cascade analysis — deeper propagation search");
    }

    // Cascade analysis: does this chain into downstream failures?
    if (/order.*drift|failed.*settlement|settlement.*fail/.test(lower)) {
      score += 25;
      findings.push("Direct cascade path to settlement failure — high propagation risk");
    }
    if (/data.*feed.*corrupt|price.*manipul|quote.*integrity/.test(lower)) {
      score += 20;
      findings.push("Data feed corruption cascade — NAV calculations and downstream pricing affected");
    }
    if (/chain|cascade|propagat|downstream|upstream/.test(lower)) {
      score += 15;
      findings.push("Explicit cascade/propagation language detected — multi-system impact likely");
    }
    if (/authentication|credential|oauth|session/.test(lower)) {
      score += 10;
      findings.push("Auth chain vulnerability — potential for privilege escalation across systems");
    }
    if (/timeout|latency|delay|queue/.test(lower)) {
      score += 10;
      findings.push("Timing/latency impact — may cascade into order timeouts or stale data");
    }

    score = Math.min(score, 100);

    const recommendation = score >= 60
      ? "High cascade potential — recommend full causal DAG analysis to map propagation paths and identify circuit breakers."
      : score >= 30
      ? "Moderate cascade risk — trace dependency chain and verify isolation boundaries."
      : "Low propagation risk — unlikely to cascade beyond initial impact scope.";

    return okJson({ score, findings, recommendation }, rid, cors);
  }

  return errJson("not_found", "Not found", rid, 404, cors);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try { return await route(req, env); }
    catch (e: unknown) {
      if (e instanceof Response) return e;
      console.error("Unhandled error:", e);
      return errJson("internal", "Internal error", uuid(), 500);
    }
  },
};
