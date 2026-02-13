// haiphen-secure/src/index.ts — Edge Security Scanning service (D1-backed)

import { matchCves, type AssetMetadata } from "./cve-matcher";
import { runComplianceCheck } from "./compliance";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  INTERNAL_TOKEN?: string;
  QUOTA_API_URL?: string;
  SVC_API?: Fetcher;
};

// ---- Shared helpers ----

function uuid(): string { return crypto.randomUUID(); }

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
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
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
  const quotaFetch = env.SVC_API?.fetch?.bind(env.SVC_API) ?? fetch;
  try {
    const res = await quotaFetch(`${apiUrl}/v1/internal/quota/consume`, {
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

// ---- Route handler ----

async function route(req: Request, env: Env): Promise<Response> {
  const requestId = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // Health (public)
  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({ ok: true, service: "haiphen-secure", time: new Date().toISOString(), version: "v2.0.0" }, requestId, cors);
  }

  // Status (public)
  if (req.method === "GET" && url.pathname === "/v1/secure/status") {
    return okJson({
      service: "haiphen-secure",
      status: "operational",
      capabilities: ["vulnerability", "compliance", "full"],
      version: "v2.0.0",
    }, requestId, cors);
  }

  // ---- Authenticated endpoints ----

  // POST /v1/secure/scan — initiate a security scan with real CVE matching
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
      return errJson("invalid_request", "Invalid scan type. Must be: vulnerability, compliance, or full", requestId, 400, cors);
    }

    const scanId = uuid();
    const startedAt = new Date().toISOString();
    const metadata = body.asset_metadata || {};

    // Run CVE correlation against D1
    const { findings, summary } = await matchCves(env.DB, body.target, metadata);

    // Run compliance check if requested
    const compliance = runComplianceCheck(findings, scanType);

    const completedAt = new Date().toISOString();

    // Persist scan results to D1
    await env.DB.prepare(
      `INSERT INTO secure_scans (scan_id, user_login, target, scan_type, status, asset_metadata_json, findings_json, summary_json, compliance_json, started_at, completed_at)
       VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)`
    ).bind(
      scanId,
      user.user_login,
      body.target,
      scanType,
      JSON.stringify(metadata),
      JSON.stringify(findings),
      JSON.stringify(summary),
      scanType !== "vulnerability" ? JSON.stringify(compliance) : null,
      startedAt,
      completedAt,
    ).run();

    return okJson({
      scan_id: scanId,
      target: body.target,
      type: scanType,
      status: "completed",
      initiated_by: user.user_login,
      started_at: startedAt,
      completed_at: completedAt,
      findings,
      summary,
      ...(scanType !== "vulnerability" ? { compliance } : {}),
    }, requestId, cors);
  }

  // GET /v1/secure/scan/:id — get scan result from D1
  const scanMatch = url.pathname.match(/^\/v1\/secure\/scan\/([a-f0-9-]+)$/);
  if (req.method === "GET" && scanMatch) {
    const user = await authUser(req, env, requestId);
    const scanId = scanMatch[1];

    const row = await env.DB.prepare(
      `SELECT scan_id, target, scan_type, status, asset_metadata_json, findings_json, summary_json, compliance_json, started_at, completed_at, created_at
       FROM secure_scans WHERE scan_id = ? AND user_login = ?`
    ).bind(scanId, user.user_login).first<{
      scan_id: string; target: string; scan_type: string; status: string;
      asset_metadata_json: string | null; findings_json: string | null;
      summary_json: string | null; compliance_json: string | null;
      started_at: string | null; completed_at: string | null; created_at: string;
    }>();

    if (!row) return errJson("not_found", "Scan not found", requestId, 404, cors);

    return okJson({
      scan_id: row.scan_id,
      target: row.target,
      type: row.scan_type,
      status: row.status,
      asset_metadata: row.asset_metadata_json ? JSON.parse(row.asset_metadata_json) : null,
      findings: row.findings_json ? JSON.parse(row.findings_json) : [],
      summary: row.summary_json ? JSON.parse(row.summary_json) : null,
      compliance: row.compliance_json ? JSON.parse(row.compliance_json) : null,
      started_at: row.started_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
    }, requestId, cors);
  }

  // GET /v1/secure/scans — paginated list from D1
  if (req.method === "GET" && url.pathname === "/v1/secure/scans") {
    const user = await authUser(req, env, requestId);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const rows = await env.DB.prepare(
      `SELECT scan_id, target, scan_type, status, summary_json, created_at
       FROM secure_scans WHERE user_login = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(user.user_login, limit, offset).all<{
      scan_id: string; target: string; scan_type: string; status: string;
      summary_json: string | null; created_at: string;
    }>();

    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM secure_scans WHERE user_login = ?"
    ).bind(user.user_login).first<{ cnt: number }>();

    return okJson({
      items: rows.results.map(r => ({
        scan_id: r.scan_id,
        target: r.target,
        type: r.scan_type,
        status: r.status,
        summary: r.summary_json ? JSON.parse(r.summary_json) : null,
        created_at: r.created_at,
      })),
      total: countRow?.cnt ?? 0,
      limit,
      offset,
    }, requestId, cors);
  }

  // POST /v1/secure/prospect-analyze (internal — service-to-service)
  if (req.method === "POST" && url.pathname === "/v1/secure/prospect-analyze") {
    const tok = req.headers.get("X-Internal-Token") || "";
    if (!env.INTERNAL_TOKEN || tok !== env.INTERNAL_TOKEN) {
      return errJson("forbidden", "Forbidden", requestId, 403, cors);
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
    if (!body?.lead_id) return errJson("invalid_request", "Missing lead_id", requestId, 400, cors);

    const findings: string[] = [];
    let score = 30; // baseline — secure is first in pipeline, no upstream adjustments

    // Run CVE correlation if vulnerability_id provided
    if (body.vulnerability_id) {
      try {
        const { findings: cveFindings } = await matchCves(env.DB, body.entity_name, {});
        if (cveFindings.length > 0) {
          score += Math.min(cveFindings.length * 10, 40);
          findings.push(...cveFindings.slice(0, 5).map((f: any) => f.cve_id ?? f.description ?? String(f)));
        }
      } catch { /* best-effort */ }
    }

    // Weight higher for trade-execution/brokerage keywords
    const lower = body.summary.toLowerCase();
    if (/trading|execution|order|fix protocol|matching engine/.test(lower)) score += 15;
    if (/broker|custodian|portfolio/.test(lower)) score += 10;
    if (/payment|ledger|settlement/.test(lower)) score += 10;

    score = Math.min(score, 100);

    const recommendation = score >= 70
      ? "High-priority security exposure — recommend immediate vulnerability assessment and patch verification."
      : score >= 40
      ? "Moderate security concern — schedule vulnerability scan and review affected components."
      : "Low immediate risk — monitor for escalation and include in next periodic review.";

    return okJson({ score, findings, recommendation }, requestId, cors);
  }

  return errJson("not_found", "Not found", requestId, 404, cors);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e: unknown) {
      if (e instanceof Response) return e;
      const requestId = uuid();
      console.error("Unhandled error:", e);
      return errJson("internal", "Internal error", requestId, 500);
    }
  },
};
