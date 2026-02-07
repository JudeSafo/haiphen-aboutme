// haiphen-network/src/index.ts — Deep Protocol Analysis service

type Env = {
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
  if (cookie) { const u = await verifyJwt(cookie, env.JWT_SECRET); return { user_login: u.sub }; }
  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) { const u = await verifyJwt(bearer, env.JWT_SECRET); return { user_login: u.sub }; }
  throw errJson("unauthorized", "Unauthorized", rid, 401);
}

// ---- Daily quota check ----

async function checkQuota(env: Env, userId: string, plan: string, sessionHash?: string): Promise<{ allowed: boolean; reason?: string }> {
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

async function route(req: Request, env: Env): Promise<Response> {
  const rid = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return corsOptions(req, env);

  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({ ok: true, service: "haiphen-network", time: new Date().toISOString(), version: "v1.0.0" }, rid, cors);
  }

  // GET /v1/network/protocols — supported protocols (public)
  if (req.method === "GET" && url.pathname === "/v1/network/protocols") {
    return okJson({
      protocols: [
        { id: "modbus", name: "Modbus TCP/RTU", ports: [502], layer: "application" },
        { id: "opcua", name: "OPC Unified Architecture", ports: [4840], layer: "application" },
        { id: "mqtt", name: "MQTT", ports: [1883, 8883], layer: "application" },
        { id: "dnp3", name: "DNP3", ports: [20000], layer: "application" },
        { id: "bacnet", name: "BACnet/IP", ports: [47808], layer: "application" },
        { id: "ethernet_ip", name: "EtherNet/IP", ports: [44818], layer: "application" },
      ],
    }, rid, cors);
  }

  // POST /v1/network/trace — start a trace
  if (req.method === "POST" && url.pathname === "/v1/network/trace") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    const body = await req.json().catch(() => null) as null | { target: string; protocol?: string; duration_seconds?: number };
    if (!body?.target) return errJson("invalid_request", "Missing target", rid, 400, cors);

    const protocol = body.protocol || "modbus";
    const trace_id = uuid();
    return okJson({
      trace_id,
      target: body.target,
      protocol,
      status: "capturing",
      initiated_by: user.user_login,
      created_at: new Date().toISOString(),
      duration_seconds: body.duration_seconds || 60,
    }, rid, cors);
  }

  // GET /v1/network/trace/:id
  const traceMatch = url.pathname.match(/^\/v1\/network\/trace\/([a-f0-9-]+)$/);
  if (req.method === "GET" && traceMatch) {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    return okJson({
      trace_id: traceMatch[1],
      target: "plc-floor1.local:502",
      protocol: "modbus",
      status: "completed",
      started_at: new Date(Date.now() - 60000).toISOString(),
      completed_at: new Date().toISOString(),
      packets_captured: 1247,
      sessions: [
        { src: "10.0.1.50:49321", dst: "10.0.1.10:502", protocol: "modbus", function_codes: [3, 6, 16], packets: 842, anomalies: 0 },
        { src: "10.0.1.51:52100", dst: "10.0.1.10:502", protocol: "modbus", function_codes: [1, 2, 3], packets: 405, anomalies: 2 },
      ],
      anomalies: [
        { type: "unexpected_function_code", function_code: 8, session_index: 1, timestamp: new Date(Date.now() - 30000).toISOString(), severity: "medium" },
        { type: "payload_size_deviation", expected_bytes: 12, actual_bytes: 256, session_index: 1, timestamp: new Date(Date.now() - 15000).toISOString(), severity: "high" },
      ],
    }, rid, cors);
  }

  // GET /v1/network/traces
  if (req.method === "GET" && url.pathname === "/v1/network/traces") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    return okJson({
      items: [
        { trace_id: "b2c3d4e5-0000-0000-0000-000000000001", target: "plc-floor1.local:502", protocol: "modbus", status: "completed", packets: 1247, created_at: "2026-02-07T09:00:00Z" },
        { trace_id: "b2c3d4e5-0000-0000-0000-000000000002", target: "scada-gw.local:4840", protocol: "opcua", status: "capturing", packets: 523, created_at: "2026-02-07T14:30:00Z" },
      ],
    }, rid, cors);
  }

  return errJson("not_found", "Not found", rid, 404, cors);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try { return await route(req, env); }
    catch (e: any) {
      if (e instanceof Response) return e;
      return errJson("internal", "Internal error", uuid(), 500);
    }
  },
};
