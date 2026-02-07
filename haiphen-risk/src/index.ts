// haiphen-risk/src/index.ts — Quantitative Risk Analysis service

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
    return okJson({ ok: true, service: "haiphen-risk", time: new Date().toISOString(), version: "v1.0.0" }, rid, cors);
  }

  // GET /v1/risk/models (public)
  if (req.method === "GET" && url.pathname === "/v1/risk/models") {
    return okJson({
      models: [
        { id: "monte_carlo", name: "Monte Carlo Simulation", description: "Probabilistic risk assessment via random sampling", parameters: ["iterations", "confidence_level", "time_horizon"] },
        { id: "var", name: "Value at Risk", description: "Statistical measure of potential loss", parameters: ["confidence_level", "time_horizon", "method"] },
        { id: "stress_test", name: "Stress Testing", description: "Scenario-based extreme event analysis", parameters: ["scenario", "severity"] },
        { id: "correlation", name: "Correlation Analysis", description: "Cross-asset dependency measurement", parameters: ["window", "method"] },
      ],
    }, rid, cors);
  }

  // POST /v1/risk/assess
  if (req.method === "POST" && url.pathname === "/v1/risk/assess") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    const body = await req.json().catch(() => null) as null | { scenario: string; model?: string; parameters?: Record<string, any> };
    if (!body?.scenario) return errJson("invalid_request", "Missing scenario", rid, 400, cors);

    const assess_id = uuid();
    const model = body.model || "monte_carlo";
    return okJson({
      assess_id,
      scenario: body.scenario,
      model,
      status: "completed",
      assessed_by: user.user_login,
      created_at: new Date().toISOString(),
      results: {
        risk_score: 0.73,
        confidence_level: 0.95,
        value_at_risk: { one_day: -23500, five_day: -52800, thirty_day: -118000 },
        expected_shortfall: -31200,
        max_drawdown_pct: 12.4,
        stress_scenarios: [
          { name: "Market crash (-20%)", portfolio_impact: -185000, probability: 0.05 },
          { name: "Interest rate shock (+200bp)", portfolio_impact: -42000, probability: 0.15 },
          { name: "Sector rotation", portfolio_impact: -18500, probability: 0.30 },
        ],
        recommendations: [
          "Reduce concentration in single-sector exposure",
          "Consider protective puts for downside protection",
          "Increase cash allocation by 5-8%",
        ],
      },
    }, rid, cors);
  }

  // GET /v1/risk/assess/:id
  const assessMatch = url.pathname.match(/^\/v1\/risk\/assess\/([a-f0-9-]+)$/);
  if (req.method === "GET" && assessMatch) {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    return okJson({
      assess_id: assessMatch[1],
      scenario: "Portfolio stress test Q1 2026",
      model: "monte_carlo",
      status: "completed",
      created_at: new Date(Date.now() - 3600000).toISOString(),
      results: {
        risk_score: 0.73,
        confidence_level: 0.95,
        value_at_risk: { one_day: -23500, five_day: -52800 },
        iterations: 10000,
      },
    }, rid, cors);
  }

  // GET /v1/risk/assessments
  if (req.method === "GET" && url.pathname === "/v1/risk/assessments") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);
    return okJson({
      items: [
        { assess_id: "c3d4e5f6-0000-0000-0000-000000000001", scenario: "Portfolio stress test Q1 2026", model: "monte_carlo", risk_score: 0.73, status: "completed", created_at: "2026-02-07T08:00:00Z" },
        { assess_id: "c3d4e5f6-0000-0000-0000-000000000002", scenario: "Sector rotation impact", model: "var", risk_score: 0.45, status: "completed", created_at: "2026-02-06T16:00:00Z" },
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
