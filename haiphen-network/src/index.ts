// haiphen-network/src/index.ts — Deep Protocol Analysis service (D1-backed)

import { loadProtocolDef, decodePackets, buildTraceSummary, type PacketInput } from "./protocol-analyzer";
import { generateAnomalyReport } from "./anomaly-detector";

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

const VALID_PROTOCOLS = ["modbus", "opcua", "mqtt", "dnp3", "bacnet", "ethernetip"];

async function route(req: Request, env: Env): Promise<Response> {
  const rid = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({ ok: true, service: "haiphen-network", time: new Date().toISOString(), version: "v2.0.0" }, rid, cors);
  }

  // GET /v1/network/protocols — from D1
  if (req.method === "GET" && url.pathname === "/v1/network/protocols") {
    const rows = await env.DB.prepare(
      "SELECT protocol_id, name, default_port FROM network_protocol_definitions ORDER BY protocol_id"
    ).all<{ protocol_id: string; name: string; default_port: number }>();

    return okJson({
      protocols: rows.results.map(r => ({
        id: r.protocol_id,
        name: r.name,
        port: r.default_port,
        layer: "application",
      })),
    }, rid, cors);
  }

  // POST /v1/network/trace — analyze submitted packets
  if (req.method === "POST" && url.pathname === "/v1/network/trace") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);

    const body = await req.json().catch(() => null) as null | {
      target: string;
      protocol?: string;
      packets?: PacketInput[];
    };
    if (!body?.target) return errJson("invalid_request", "Missing target", rid, 400, cors);

    const protocolId = body.protocol || "modbus";
    if (!VALID_PROTOCOLS.includes(protocolId)) {
      return errJson("invalid_request", `Invalid protocol. Must be one of: ${VALID_PROTOCOLS.join(", ")}`, rid, 400, cors);
    }

    const protocolDef = await loadProtocolDef(env.DB, protocolId);
    if (!protocolDef) return errJson("not_found", `Protocol '${protocolId}' not found in database`, rid, 404, cors);

    const rawPackets = body.packets || [];
    if (rawPackets.length > 10000) return errJson("invalid_request", "Maximum 10000 packets per trace", rid, 400, cors);

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
    }, rid, cors);
  }

  // GET /v1/network/trace/:id
  const traceMatch = url.pathname.match(/^\/v1\/network\/trace\/([a-f0-9-]+)$/);
  if (req.method === "GET" && traceMatch) {
    const user = await authUser(req, env, rid);
    const traceId = traceMatch[1];

    const row = await env.DB.prepare(
      `SELECT trace_id, target, protocol, status, duration_ms, packet_count, session_count, anomaly_count, summary_json, started_at, completed_at, created_at
       FROM network_traces WHERE trace_id = ? AND user_login = ?`
    ).bind(traceId, user.user_login).first<{
      trace_id: string; target: string; protocol: string; status: string;
      duration_ms: number | null; packet_count: number; session_count: number; anomaly_count: number;
      summary_json: string | null; started_at: string | null; completed_at: string | null; created_at: string;
    }>();

    if (!row) return errJson("not_found", "Trace not found", rid, 404, cors);

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
    }, rid, cors);
  }

  // GET /v1/network/traces — paginated list
  if (req.method === "GET" && url.pathname === "/v1/network/traces") {
    const user = await authUser(req, env, rid);
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
    }, rid, cors);
  }

  // POST /v1/network/prospect-analyze (internal — service-to-service)
  if (req.method === "POST" && url.pathname === "/v1/network/prospect-analyze") {
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
    let score = 20; // baseline
    const lower = body.summary.toLowerCase();

    // Upstream context: if secure confirmed a vulnerability, boost network score
    const uc = body.upstream_context;
    if (uc && (uc.prior_scores?.secure ?? 0) > 50) {
      score += 10;
      findings.push("Confirmed vulnerability in network path (upstream secure score > 50)");
    }

    // Score by protocol risk to trade flow
    if (/fix\b|fix protocol|websocket/.test(lower)) {
      score += 25;
      findings.push("FIX/WebSocket protocol exposure — critical for trade order flow");
    }
    if (/market data|price feed|quote|ticker/.test(lower)) {
      score += 20;
      findings.push("Market data feed integrity risk — pricing accuracy may be affected");
    }
    if (/api|gateway|rest|webhook/.test(lower)) {
      score += 15;
      findings.push("API/gateway exposure — client integrations and webhook delivery at risk");
    }
    if (/modbus|mqtt|opcua|dnp3|bacnet/.test(lower)) {
      score += 10;
      findings.push("Industrial protocol exposure detected");
    }

    score = Math.min(score, 100);

    const recommendation = score >= 60
      ? "Significant protocol-level exposure to trade flow infrastructure — recommend deep packet analysis and protocol hardening."
      : score >= 35
      ? "Moderate network risk — review protocol configurations and access controls."
      : "Low network impact — standard monitoring recommended.";

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
