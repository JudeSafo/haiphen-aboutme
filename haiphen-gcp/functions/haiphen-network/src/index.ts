// ---------------------------------------------------------------------------
// haiphen-network — GCP Cloud Function entry point
//
// Wraps the CF Worker's route handler with Firestore-backed D1 adapter.
// Business logic (protocol-analyzer, anomaly-detector) is copied from
// haiphen-network/src/ by the build script.
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";
import * as ff from "@google-cloud/functions-framework";
import { FirestoreD1Adapter } from "./shared/firestore-d1";
import { loadProtocolDef, decodePackets, buildTraceSummary, type PacketInput } from "./protocol-analyzer";
import { generateAnomalyReport } from "./anomaly-detector";

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
// Route handler (matches haiphen-network/src/index.ts)
// ---------------------------------------------------------------------------

const VALID_PROTOCOLS = ["modbus", "opcua", "mqtt", "dnp3", "bacnet", "ethernetip"];

async function route(req: Request, env: Env): Promise<Response> {
  const requestId = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({ ok: true, service: "haiphen-network", runtime: "gcp", time: new Date().toISOString(), version: "v2.0.0" }, requestId, cors);
  }

  // GET /v1/network/protocols — from D1
  if (req.method === "GET" && url.pathname === "/v1/network/protocols") {
    const rows = await env.DB.prepare(
      "SELECT protocol_id, name, default_port FROM network_protocol_definitions ORDER BY protocol_id"
    ).all<{ protocol_id: string; name: string; default_port: number }>();

    return okJson({
      protocols: rows.results.map((r: { protocol_id: string; name: string; default_port: number }) => ({
        id: r.protocol_id,
        name: r.name,
        port: r.default_port,
        layer: "application",
      })),
    }, requestId, cors);
  }

  // POST /v1/network/trace — analyze submitted packets
  if (req.method === "POST" && url.pathname === "/v1/network/trace") {
    const user = await authUser(req, env, requestId);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);

    const body = await req.json().catch(() => null) as null | {
      target: string;
      protocol?: string;
      packets?: PacketInput[];
    };
    if (!body?.target) return errJson("invalid_request", "Missing target", requestId, 400, cors);

    const protocolId = body.protocol || "modbus";
    if (!VALID_PROTOCOLS.includes(protocolId)) {
      return errJson("invalid_request", `Invalid protocol. Must be one of: ${VALID_PROTOCOLS.join(", ")}`, requestId, 400, cors);
    }

    const protocolDef = await loadProtocolDef(env.DB as any, protocolId);
    if (!protocolDef) return errJson("not_found", `Protocol '${protocolId}' not found in database`, requestId, 404, cors);

    const rawPackets = body.packets || [];
    if (rawPackets.length > 10000) return errJson("invalid_request", "Maximum 10000 packets per trace", requestId, 400, cors);

    const traceId = uuid();
    const startedAt = new Date().toISOString();

    // Decode packets
    const decoded = decodePackets(rawPackets, protocolDef, body.target);

    // Build summary
    const summary = buildTraceSummary(decoded, protocolDef);
    const report = generateAnomalyReport(summary);

    const completedAt = new Date().toISOString();

    // Persist trace
    await env.DB.prepare(
      `INSERT INTO network_traces (trace_id, user_login, target, protocol, status, duration_ms, packet_count, session_count, anomaly_count, summary_json, started_at, completed_at)
       VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      traceId, user.user_login, body.target, protocolId,
      summary.duration_ms, summary.packet_count, summary.session_count, summary.anomaly_count,
      JSON.stringify({ ...summary, report }),
      startedAt, completedAt,
    ).run();

    // Persist packets in batches
    if (decoded.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < decoded.length; i += batchSize) {
        const batch = decoded.slice(i, i + batchSize);
        const stmts = batch.map(pkt =>
          env.DB.prepare(
            `INSERT INTO network_packets (trace_id, seq, timestamp_ms, direction, src_addr, dst_addr, protocol, function_code, function_name, payload_hex, payload_size, decoded_json, is_anomaly, anomaly_type, anomaly_detail)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            traceId, pkt.seq, pkt.timestamp_ms, pkt.direction,
            pkt.src_addr, pkt.dst_addr, pkt.protocol,
            pkt.function_code, pkt.function_name,
            pkt.payload_hex, pkt.payload_size,
            JSON.stringify(pkt.decoded),
            pkt.is_anomaly ? 1 : 0,
            pkt.anomaly_type, pkt.anomaly_detail,
          )
        );
        await env.DB.batch(stmts);
      }
    }

    return okJson({
      trace_id: traceId,
      target: body.target,
      protocol: protocolId,
      protocol_name: protocolDef.name,
      status: "completed",
      initiated_by: user.user_login,
      started_at: startedAt,
      completed_at: completedAt,
      summary,
      anomaly_report: report,
    }, requestId, cors);
  }

  // GET /v1/network/trace/:id
  const traceMatch = url.pathname.match(/^\/v1\/network\/trace\/([a-f0-9-]+)$/);
  if (req.method === "GET" && traceMatch) {
    const user = await authUser(req, env, requestId);
    const traceId = traceMatch[1];

    const row = await env.DB.prepare(
      `SELECT trace_id, target, protocol, status, duration_ms, packet_count, session_count, anomaly_count, summary_json, started_at, completed_at, created_at
       FROM network_traces WHERE trace_id = ? AND user_login = ?`
    ).bind(traceId, user.user_login).first<{
      trace_id: string; target: string; protocol: string; status: string;
      duration_ms: number | null; packet_count: number; session_count: number; anomaly_count: number;
      summary_json: string | null; started_at: string | null; completed_at: string | null; created_at: string;
    }>();

    if (!row) return errJson("not_found", "Trace not found", requestId, 404, cors);

    // Optionally include packets
    const includePackets = url.searchParams.get("include_packets") === "true";
    let packets = undefined;
    if (includePackets) {
      const pktRows = await env.DB.prepare(
        `SELECT seq, timestamp_ms, direction, src_addr, dst_addr, function_code, function_name, payload_size, decoded_json, is_anomaly, anomaly_type, anomaly_detail
         FROM network_packets WHERE trace_id = ? ORDER BY seq LIMIT 1000`
      ).bind(traceId).all();
      packets = pktRows.results;
    }

    return okJson({
      trace_id: row.trace_id,
      target: row.target,
      protocol: row.protocol,
      status: row.status,
      duration_ms: row.duration_ms,
      packet_count: row.packet_count,
      session_count: row.session_count,
      anomaly_count: row.anomaly_count,
      summary: row.summary_json ? JSON.parse(row.summary_json) : null,
      started_at: row.started_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      ...(packets ? { packets } : {}),
    }, requestId, cors);
  }

  // GET /v1/network/traces — paginated list
  if (req.method === "GET" && url.pathname === "/v1/network/traces") {
    const user = await authUser(req, env, requestId);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const rows = await env.DB.prepare(
      `SELECT trace_id, target, protocol, status, packet_count, anomaly_count, created_at
       FROM network_traces WHERE user_login = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(user.user_login, limit, offset).all<{
      trace_id: string; target: string; protocol: string; status: string;
      packet_count: number; anomaly_count: number; created_at: string;
    }>();

    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM network_traces WHERE user_login = ?"
    ).bind(user.user_login).first<{ cnt: number }>();

    return okJson({
      items: rows.results,
      total: countRow?.cnt ?? 0,
      limit,
      offset,
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
