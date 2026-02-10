// ---------------------------------------------------------------------------
// haiphen-secure — GCP Cloud Function entry point
//
// Wraps the CF Worker's route handler with Firestore-backed D1 adapter.
// Business logic (cve-matcher, compliance) is copied from haiphen-secure/src/
// by the build script.
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";
import * as ff from "@google-cloud/functions-framework";
import { FirestoreD1Adapter } from "./shared/firestore-d1";
import { matchCves, type AssetMetadata } from "./cve-matcher";
import { runComplianceCheck } from "./compliance";

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
// Route handler (matches haiphen-secure/src/index.ts)
// ---------------------------------------------------------------------------

async function route(req: Request, env: Env): Promise<Response> {
  const requestId = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({ ok: true, service: "haiphen-secure", runtime: "gcp", time: new Date().toISOString(), version: "v2.0.0" }, requestId, cors);
  }

  if (req.method === "GET" && url.pathname === "/v1/secure/status") {
    return okJson({
      service: "haiphen-secure",
      status: "operational",
      runtime: "gcp",
      capabilities: ["vulnerability", "compliance", "full"],
      version: "v2.0.0",
    }, requestId, cors);
  }

  // POST /v1/secure/scan
  if (req.method === "POST" && url.pathname === "/v1/secure/scan") {
    const user = await authUser(req, env, requestId);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);

    const body = await req.json().catch(() => null) as null | {
      target: string;
      type?: string;
      asset_metadata?: AssetMetadata;
    };
    if (!body?.target) return errJson("invalid_request", "Missing target", requestId, 400, cors);

    const scanType = body.type || "vulnerability";
    if (!["vulnerability", "compliance", "full"].includes(scanType)) {
      return errJson("invalid_request", "Invalid scan type", requestId, 400, cors);
    }

    const scanId = uuid();
    const startedAt = new Date().toISOString();
    const metadata = body.asset_metadata || {};

    const { findings, summary } = await matchCves(env.DB as any, body.target, metadata);
    const compliance = runComplianceCheck(findings, scanType);
    const completedAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO secure_scans (scan_id, user_login, target, scan_type, status, asset_metadata_json, findings_json, summary_json, compliance_json, started_at, completed_at)
       VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)`
    ).bind(
      scanId, user.user_login, body.target, scanType,
      JSON.stringify(metadata), JSON.stringify(findings), JSON.stringify(summary),
      scanType !== "vulnerability" ? JSON.stringify(compliance) : null,
      startedAt, completedAt,
    ).run();

    return okJson({
      scan_id: scanId, target: body.target, type: scanType, status: "completed",
      initiated_by: user.user_login, started_at: startedAt, completed_at: completedAt,
      findings, summary,
      ...(scanType !== "vulnerability" ? { compliance } : {}),
    }, requestId, cors);
  }

  // GET /v1/secure/scan/:id
  const scanMatch = url.pathname.match(/^\/v1\/secure\/scan\/([a-f0-9-]+)$/);
  if (req.method === "GET" && scanMatch) {
    const user = await authUser(req, env, requestId);
    const row = await env.DB.prepare(
      `SELECT scan_id, target, scan_type, status, asset_metadata_json, findings_json, summary_json, compliance_json, started_at, completed_at, created_at
       FROM secure_scans WHERE scan_id = ? AND user_login = ?`
    ).bind(scanMatch[1], user.user_login).first<any>();

    if (!row) return errJson("not_found", "Scan not found", requestId, 404, cors);
    return okJson({
      scan_id: row.scan_id, target: row.target, type: row.scan_type, status: row.status,
      asset_metadata: row.asset_metadata_json ? JSON.parse(row.asset_metadata_json) : null,
      findings: row.findings_json ? JSON.parse(row.findings_json) : [],
      summary: row.summary_json ? JSON.parse(row.summary_json) : null,
      compliance: row.compliance_json ? JSON.parse(row.compliance_json) : null,
      started_at: row.started_at, completed_at: row.completed_at, created_at: row.created_at,
    }, requestId, cors);
  }

  // GET /v1/secure/scans
  if (req.method === "GET" && url.pathname === "/v1/secure/scans") {
    const user = await authUser(req, env, requestId);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const rows = await env.DB.prepare(
      `SELECT scan_id, target, scan_type, status, summary_json, created_at
       FROM secure_scans WHERE user_login = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(user.user_login, limit, offset).all<any>();

    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM secure_scans WHERE user_login = ?"
    ).bind(user.user_login).first<{ cnt: number }>();

    return okJson({
      items: rows.results.map((r: any) => ({
        scan_id: r.scan_id, target: r.target, type: r.scan_type, status: r.status,
        summary: r.summary_json ? JSON.parse(r.summary_json) : null, created_at: r.created_at,
      })),
      total: countRow?.cnt ?? 0, limit, offset,
    }, requestId, cors);
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
