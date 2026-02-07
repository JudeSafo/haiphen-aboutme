// haiphen-supply/src/index.ts — Supply Chain Intelligence service

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
    return okJson({ ok: true, service: "haiphen-supply", time: new Date().toISOString(), version: "v1.0.0" }, rid, cors);
  }

  // POST /v1/supply/assess — supplier risk assessment
  if (req.method === "POST" && url.pathname === "/v1/supply/assess") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    const body = await req.json().catch(() => null) as null | { supplier: string; depth?: number };
    if (!body?.supplier) return errJson("invalid_request", "Missing supplier name", rid, 400, cors);

    const assess_id = uuid();
    return okJson({
      assess_id,
      supplier: body.supplier,
      status: "completed",
      assessed_by: user.user_login,
      created_at: new Date().toISOString(),
      risk_profile: {
        overall_score: 0.68,
        financial_stability: 0.82,
        geopolitical_risk: 0.45,
        delivery_reliability: 0.91,
        single_source_risk: 0.35,
        compliance_score: 0.78,
      },
      tiers: [
        { tier: 1, supplier: body.supplier, location: "Shenzhen, China", lead_time_days: 14, risk_score: 0.68 },
        { tier: 2, supplier: "Raw Materials Corp", location: "Jakarta, Indonesia", lead_time_days: 30, risk_score: 0.52 },
        { tier: 3, supplier: "Mining Co Ltd", location: "Santiago, Chile", lead_time_days: 45, risk_score: 0.38 },
      ],
      alerts: [
        { type: "geopolitical", severity: "medium", description: "Trade policy changes may affect import duties", probability: 0.30 },
        { type: "logistics", severity: "low", description: "Port congestion forecasted for Q2", probability: 0.20 },
      ],
      alternatives: [
        { supplier: "TechParts Taiwan", location: "Taipei, Taiwan", estimated_lead_time_days: 21, compatibility: 0.92 },
        { supplier: "EuroParts GmbH", location: "Munich, Germany", estimated_lead_time_days: 18, compatibility: 0.85 },
      ],
    }, rid, cors);
  }

  // GET /v1/supply/assess/:id
  const assessMatch = url.pathname.match(/^\/v1\/supply\/assess\/([a-f0-9-]+)$/);
  if (req.method === "GET" && assessMatch) {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    return okJson({
      assess_id: assessMatch[1],
      supplier: "Acme Components Ltd",
      status: "completed",
      created_at: new Date(Date.now() - 86400000).toISOString(),
      risk_profile: { overall_score: 0.68 },
      tier_count: 3,
      alert_count: 2,
    }, rid, cors);
  }

  // GET /v1/supply/suppliers
  if (req.method === "GET" && url.pathname === "/v1/supply/suppliers") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    return okJson({
      items: [
        { id: "sup-001", name: "Acme Components Ltd", location: "Shenzhen, China", tier: 1, risk_score: 0.68, last_assessed: "2026-02-07T10:00:00Z" },
        { id: "sup-002", name: "Industrial Sensors Inc", location: "Detroit, USA", tier: 1, risk_score: 0.25, last_assessed: "2026-02-05T14:00:00Z" },
        { id: "sup-003", name: "Raw Materials Corp", location: "Jakarta, Indonesia", tier: 2, risk_score: 0.52, last_assessed: "2026-02-04T09:00:00Z" },
      ],
    }, rid, cors);
  }

  // GET /v1/supply/alerts
  if (req.method === "GET" && url.pathname === "/v1/supply/alerts") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    return okJson({
      items: [
        { id: "alt-001", type: "geopolitical", severity: "high", supplier: "Acme Components Ltd", description: "New tariff regulations announced", created_at: "2026-02-07T08:00:00Z", acknowledged: false },
        { id: "alt-002", type: "logistics", severity: "medium", supplier: "Raw Materials Corp", description: "Shipping route disruption in Strait of Malacca", created_at: "2026-02-06T22:00:00Z", acknowledged: true },
        { id: "alt-003", type: "financial", severity: "low", supplier: "Industrial Sensors Inc", description: "Q4 earnings below expectations", created_at: "2026-02-05T16:00:00Z", acknowledged: true },
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
