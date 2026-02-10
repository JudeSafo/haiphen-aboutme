// ---------------------------------------------------------------------------
// haiphen-supply — GCP Cloud Function entry point
//
// Wraps the CF Worker's route handler with Firestore-backed D1 adapter.
// Business logic (risk-scorer, alternative-finder) is copied from
// haiphen-supply/src/ by the build script.
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";
import * as ff from "@google-cloud/functions-framework";
import { FirestoreD1Adapter } from "./shared/firestore-d1";
import { computeRiskScore, type SupplierData } from "./risk-scorer";
import { findAlternatives } from "./alternative-finder";

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
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
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
// Route handler (matches haiphen-supply/src/index.ts)
// ---------------------------------------------------------------------------

async function route(req: Request, env: Env): Promise<Response> {
  const requestId = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({ ok: true, service: "haiphen-supply", runtime: "gcp", time: new Date().toISOString(), version: "v2.0.0" }, requestId, cors);
  }

  // ---- Supplier CRUD ----

  // POST /v1/supply/suppliers — create/upsert suppliers
  if (req.method === "POST" && url.pathname === "/v1/supply/suppliers") {
    const user = await authUser(req, env, requestId);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);

    const body = await req.json().catch(() => null) as null | {
      suppliers: Array<{
        name: string;
        country?: string;
        region?: string;
        tier?: number;
        categories?: string[];
        financial_score?: number;
        geopolitical_score?: number;
        delivery_score?: number;
        single_source?: boolean;
        metadata?: Record<string, unknown>;
      }>;
    };

    if (!body?.suppliers || !Array.isArray(body.suppliers) || body.suppliers.length === 0) {
      return errJson("invalid_request", "Missing suppliers array", requestId, 400, cors);
    }
    if (body.suppliers.length > 100) {
      return errJson("invalid_request", "Maximum 100 suppliers per request", requestId, 400, cors);
    }

    const inserted: string[] = [];
    const batchSize = 20;

    for (let i = 0; i < body.suppliers.length; i += batchSize) {
      const batch = body.suppliers.slice(i, i + batchSize);
      const stmts = batch.map(s => {
        const supplierId = uuid();
        inserted.push(supplierId);
        return env.DB.prepare(
          `INSERT INTO supply_suppliers (supplier_id, user_login, name, country, region, tier, categories_json, financial_score, geopolitical_score, delivery_score, single_source, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_login, name) DO UPDATE SET
             country = excluded.country, region = excluded.region, tier = excluded.tier,
             categories_json = excluded.categories_json,
             financial_score = excluded.financial_score, geopolitical_score = excluded.geopolitical_score,
             delivery_score = excluded.delivery_score, single_source = excluded.single_source,
             metadata_json = excluded.metadata_json, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
        ).bind(
          supplierId, user.user_login, s.name,
          s.country || null, s.region || null, s.tier ?? 1,
          s.categories ? JSON.stringify(s.categories) : null,
          s.financial_score ?? 50, s.geopolitical_score ?? 50, s.delivery_score ?? 50,
          s.single_source ? 1 : 0,
          s.metadata ? JSON.stringify(s.metadata) : null,
        );
      });
      await env.DB.batch(stmts);
    }

    return okJson({ ingested: inserted.length, supplier_ids: inserted }, requestId, cors);
  }

  // GET /v1/supply/suppliers — list suppliers
  if (req.method === "GET" && url.pathname === "/v1/supply/suppliers") {
    const user = await authUser(req, env, requestId);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const status = url.searchParams.get("status") || "active";

    const rows = await env.DB.prepare(
      `SELECT supplier_id, name, country, region, tier, categories_json, financial_score, geopolitical_score, delivery_score, single_source, status, created_at
       FROM supply_suppliers WHERE user_login = ? AND status = ?
       ORDER BY name ASC LIMIT ? OFFSET ?`
    ).bind(user.user_login, status, limit, offset).all<{
      supplier_id: string; name: string; country: string | null; region: string | null;
      tier: number; categories_json: string | null;
      financial_score: number; geopolitical_score: number; delivery_score: number;
      single_source: number; status: string; created_at: string;
    }>();

    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM supply_suppliers WHERE user_login = ? AND status = ?"
    ).bind(user.user_login, status).first<{ cnt: number }>();

    return okJson({
      items: rows.results.map(r => ({
        ...r,
        categories: r.categories_json ? JSON.parse(r.categories_json) : [],
        single_source: r.single_source === 1,
        categories_json: undefined,
      })),
      total: countRow?.cnt ?? 0,
      limit,
      offset,
    }, requestId, cors);
  }

  // ---- Risk Assessment ----

  // POST /v1/supply/assess — run risk assessment
  if (req.method === "POST" && url.pathname === "/v1/supply/assess") {
    const user = await authUser(req, env, requestId);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);

    const body = await req.json().catch(() => null) as null | {
      supplier_ids?: string[];
      supplier_name?: string;
    };

    const assessmentId = uuid();
    const startedAt = new Date().toISOString();

    // Fetch suppliers
    let supplierRows;
    if (body?.supplier_ids && body.supplier_ids.length > 0) {
      const placeholders = body.supplier_ids.map(() => "?").join(",");
      supplierRows = await env.DB.prepare(
        `SELECT supplier_id, name, country, region, tier, categories_json, financial_score, geopolitical_score, delivery_score, single_source
         FROM supply_suppliers WHERE user_login = ? AND supplier_id IN (${placeholders})`
      ).bind(user.user_login, ...body.supplier_ids).all<{
        supplier_id: string; name: string; country: string | null; region: string | null;
        tier: number; categories_json: string | null;
        financial_score: number; geopolitical_score: number; delivery_score: number; single_source: number;
      }>();
    } else if (body?.supplier_name) {
      supplierRows = await env.DB.prepare(
        `SELECT supplier_id, name, country, region, tier, categories_json, financial_score, geopolitical_score, delivery_score, single_source
         FROM supply_suppliers WHERE user_login = ? AND LOWER(name) LIKE LOWER(?) AND status = 'active'`
      ).bind(user.user_login, `%${body.supplier_name}%`).all<{
        supplier_id: string; name: string; country: string | null; region: string | null;
        tier: number; categories_json: string | null;
        financial_score: number; geopolitical_score: number; delivery_score: number; single_source: number;
      }>();
    } else {
      // Assess all active suppliers
      supplierRows = await env.DB.prepare(
        `SELECT supplier_id, name, country, region, tier, categories_json, financial_score, geopolitical_score, delivery_score, single_source
         FROM supply_suppliers WHERE user_login = ? AND status = 'active' LIMIT 100`
      ).bind(user.user_login).all<{
        supplier_id: string; name: string; country: string | null; region: string | null;
        tier: number; categories_json: string | null;
        financial_score: number; geopolitical_score: number; delivery_score: number; single_source: number;
      }>();
    }

    if (supplierRows.results.length === 0) {
      return errJson("not_found", "No suppliers found for assessment", requestId, 404, cors);
    }

    // Convert to SupplierData
    const suppliers: SupplierData[] = supplierRows.results.map(r => ({
      supplier_id: r.supplier_id,
      name: r.name,
      country: r.country,
      region: r.region,
      tier: r.tier,
      categories: r.categories_json ? JSON.parse(r.categories_json) : [],
      financial_score: r.financial_score,
      geopolitical_score: r.geopolitical_score,
      delivery_score: r.delivery_score,
      single_source: r.single_source === 1,
    }));

    // Compute risk score
    const riskResult = computeRiskScore(suppliers);

    // Find alternatives for high-risk suppliers
    const targetCategories = suppliers.flatMap(s => s.categories);
    const uniqueCategories = [...new Set(targetCategories)];
    const alternatives = await findAlternatives(env.DB as any, user.user_login, suppliers.map(s => s.supplier_id), uniqueCategories);

    const completedAt = new Date().toISOString();

    // Persist alerts
    if (riskResult.alerts.length > 0) {
      const alertBatch = riskResult.alerts.slice(0, 50).map(a =>
        env.DB.prepare(
          `INSERT INTO supply_alerts (alert_id, user_login, supplier_id, alert_type, severity, title, description)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(uuid(), user.user_login, a.supplier_id, a.type, a.severity, a.title, a.description)
      );
      await env.DB.batch(alertBatch);
    }

    // Persist assessment
    await env.DB.prepare(
      `INSERT INTO supply_assessments (assessment_id, user_login, status, supplier_ids_json, overall_risk_score, risk_breakdown_json, alerts_json, alternatives_json, recommendations_json, started_at, completed_at)
       VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      assessmentId, user.user_login,
      JSON.stringify(suppliers.map(s => s.supplier_id)),
      riskResult.overall_score,
      JSON.stringify(riskResult.breakdown),
      JSON.stringify(riskResult.alerts),
      JSON.stringify(alternatives),
      JSON.stringify(riskResult.recommendations),
      startedAt, completedAt,
    ).run();

    return okJson({
      assessment_id: assessmentId,
      status: "completed",
      initiated_by: user.user_login,
      started_at: startedAt,
      completed_at: completedAt,
      suppliers_assessed: suppliers.length,
      overall_risk_score: riskResult.overall_score,
      risk_level: riskResult.risk_level,
      breakdown: riskResult.breakdown,
      alerts: riskResult.alerts,
      alternatives,
      recommendations: riskResult.recommendations,
    }, requestId, cors);
  }

  // GET /v1/supply/assess/:id — retrieve assessment
  const assessMatch = url.pathname.match(/^\/v1\/supply\/assess\/([a-f0-9-]+)$/);
  if (req.method === "GET" && assessMatch) {
    const user = await authUser(req, env, requestId);
    const assessmentId = assessMatch[1];

    const row = await env.DB.prepare(
      `SELECT assessment_id, status, supplier_ids_json, overall_risk_score, risk_breakdown_json, alerts_json, alternatives_json, recommendations_json, started_at, completed_at, created_at
       FROM supply_assessments WHERE assessment_id = ? AND user_login = ?`
    ).bind(assessmentId, user.user_login).first<{
      assessment_id: string; status: string; supplier_ids_json: string;
      overall_risk_score: number | null; risk_breakdown_json: string | null;
      alerts_json: string | null; alternatives_json: string | null;
      recommendations_json: string | null;
      started_at: string | null; completed_at: string | null; created_at: string;
    }>();

    if (!row) return errJson("not_found", "Assessment not found", requestId, 404, cors);

    return okJson({
      assessment_id: row.assessment_id,
      status: row.status,
      overall_risk_score: row.overall_risk_score,
      breakdown: row.risk_breakdown_json ? JSON.parse(row.risk_breakdown_json) : null,
      alerts: row.alerts_json ? JSON.parse(row.alerts_json) : [],
      alternatives: row.alternatives_json ? JSON.parse(row.alternatives_json) : [],
      recommendations: row.recommendations_json ? JSON.parse(row.recommendations_json) : [],
      started_at: row.started_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
    }, requestId, cors);
  }

  // GET /v1/supply/assessments — paginated list
  if (req.method === "GET" && url.pathname === "/v1/supply/assessments") {
    const user = await authUser(req, env, requestId);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const rows = await env.DB.prepare(
      `SELECT assessment_id, status, overall_risk_score, created_at
       FROM supply_assessments WHERE user_login = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(user.user_login, limit, offset).all();

    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM supply_assessments WHERE user_login = ?"
    ).bind(user.user_login).first<{ cnt: number }>();

    return okJson({ items: rows.results, total: countRow?.cnt ?? 0, limit, offset }, requestId, cors);
  }

  // GET /v1/supply/alerts — list active alerts
  if (req.method === "GET" && url.pathname === "/v1/supply/alerts") {
    const user = await authUser(req, env, requestId);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const unresolved = url.searchParams.get("unresolved") !== "false";

    const rows = await env.DB.prepare(
      `SELECT a.alert_id, a.supplier_id, s.name as supplier_name, a.alert_type, a.severity, a.title, a.description, a.is_resolved, a.created_at
       FROM supply_alerts a
       LEFT JOIN supply_suppliers s ON a.supplier_id = s.supplier_id
       WHERE a.user_login = ? ${unresolved ? "AND a.is_resolved = 0" : ""}
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
    ).bind(user.user_login, limit, offset).all();

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM supply_alerts WHERE user_login = ? ${unresolved ? "AND is_resolved = 0" : ""}`
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
