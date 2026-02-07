// haiphen-causal/src/index.ts — Causal Chain / Root Cause Intelligence service

type Env = {
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
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

async function route(req: Request, env: Env): Promise<Response> {
  const rid = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return corsOptions(req, env);

  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({ ok: true, service: "haiphen-causal", time: new Date().toISOString(), version: "v1.0.0" }, rid, cors);
  }

  // POST /v1/causal/analyze
  if (req.method === "POST" && url.pathname === "/v1/causal/analyze") {
    const user = await authUser(req, env, rid);
    const body = await req.json().catch(() => null) as null | { events: any[]; window_hours?: number };
    if (!body?.events || !Array.isArray(body.events) || body.events.length === 0) {
      return errJson("invalid_request", "Missing or empty events array", rid, 400, cors);
    }

    const analysis_id = uuid();
    return okJson({
      analysis_id,
      status: "completed",
      analyzed_by: user.user_login,
      created_at: new Date().toISOString(),
      event_count: body.events.length,
      window_hours: body.window_hours || 24,
      causal_graph: {
        root_causes: [
          { event: "firmware_update_pushed", timestamp: "2026-02-07T02:00:00Z", confidence: 0.92, description: "Untested firmware deployed to edge gateway" },
        ],
        propagation_chain: [
          { from: "firmware_update_pushed", to: "gateway_restart", delay_seconds: 15, confidence: 0.95 },
          { from: "gateway_restart", to: "modbus_timeout", delay_seconds: 45, confidence: 0.88 },
          { from: "modbus_timeout", to: "plc_fallback_mode", delay_seconds: 3, confidence: 0.91 },
          { from: "plc_fallback_mode", to: "production_halt", delay_seconds: 120, confidence: 0.85 },
        ],
        impact: {
          total_events_analyzed: body.events.length,
          events_in_chain: 5,
          time_to_impact_seconds: 183,
          affected_assets: ["gw-edge-01", "plc-line-3", "plc-line-4"],
        },
      },
      counterfactuals: [
        { scenario: "Staged firmware rollout", estimated_impact_reduction: 0.90 },
        { scenario: "Pre-deployment validation", estimated_impact_reduction: 0.95 },
        { scenario: "Automatic rollback on timeout", estimated_impact_reduction: 0.75 },
      ],
    }, rid, cors);
  }

  // GET /v1/causal/analyze/:id
  const analysisMatch = url.pathname.match(/^\/v1\/causal\/analyze\/([a-f0-9-]+)$/);
  if (req.method === "GET" && analysisMatch) {
    await authUser(req, env, rid);
    return okJson({
      analysis_id: analysisMatch[1],
      status: "completed",
      created_at: new Date(Date.now() - 7200000).toISOString(),
      event_count: 47,
      root_causes: [
        { event: "firmware_update_pushed", confidence: 0.92 },
      ],
      chain_length: 5,
      time_to_impact_seconds: 183,
    }, rid, cors);
  }

  // GET /v1/causal/analyses
  if (req.method === "GET" && url.pathname === "/v1/causal/analyses") {
    await authUser(req, env, rid);
    return okJson({
      items: [
        { analysis_id: "d4e5f6a7-0000-0000-0000-000000000001", event_count: 47, root_cause: "firmware_update_pushed", chain_length: 5, status: "completed", created_at: "2026-02-07T06:00:00Z" },
        { analysis_id: "d4e5f6a7-0000-0000-0000-000000000002", event_count: 23, root_cause: "network_segment_failure", chain_length: 3, status: "completed", created_at: "2026-02-06T18:00:00Z" },
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
