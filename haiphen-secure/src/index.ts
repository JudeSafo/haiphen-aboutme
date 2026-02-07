// haiphen-secure/src/index.ts — Edge Security Scanning service

type Env = {
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  INTERNAL_TOKEN?: string;
  QUOTA_API_URL?: string;
};

// ---- Shared helpers (inline, no cross-worker imports) ----

function uuid(): string {
  return crypto.randomUUID();
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io,https://auth.haiphen.io")
    .split(",").map(s => s.trim());
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    allowed.push(origin);
  }
  const o = allowed.includes(origin) ? origin : "https://haiphen.io";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}

function corsOptions(req: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req, env) });
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

// ---- JWT auth (cookie + bearer) ----

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
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  const ok = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(sB64), new TextEncoder().encode(`${hB64}.${pB64}`));
  if (!ok) throw new Error("Invalid signature");
  const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(pB64)));
  if (claims.aud && claims.aud !== "haiphen-auth") throw new Error("Invalid audience");
  if (typeof claims.exp === "number" && claims.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired");
  if (!claims.sub) throw new Error("Missing sub");
  return { sub: claims.sub };
}

async function authUser(req: Request, env: Env, requestId: string): Promise<{ user_login: string }> {
  // Try cookie first
  const cookie = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)auth=([^;]+)/)?.[1];
  if (cookie) {
    const user = await verifyJwt(cookie, env.JWT_SECRET);
    return { user_login: user.sub };
  }
  // Try bearer
  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) {
    const user = await verifyJwt(bearer, env.JWT_SECRET);
    return { user_login: user.sub };
  }
  throw errJson("unauthorized", "Unauthorized", requestId, 401);
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

// ---- Route handler ----

async function route(req: Request, env: Env): Promise<Response> {
  const requestId = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return corsOptions(req, env);

  // Health (public)
  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({ ok: true, service: "haiphen-secure", time: new Date().toISOString(), version: "v1.0.0" }, requestId, cors);
  }

  // Status (public)
  if (req.method === "GET" && url.pathname === "/v1/secure/status") {
    return okJson({
      service: "haiphen-secure",
      status: "operational",
      capabilities: ["vulnerability", "compliance", "full"],
      version: "v1.0.0",
    }, requestId, cors);
  }

  // ---- Authenticated endpoints ----

  // POST /v1/secure/scan — initiate a security scan
  if (req.method === "POST" && url.pathname === "/v1/secure/scan") {
    const user = await authUser(req, env, requestId);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);
    const body = await req.json().catch(() => null) as null | { target: string; type?: string };
    if (!body?.target) return errJson("invalid_request", "Missing target", requestId, 400, cors);

    const scanType = body.type || "vulnerability";
    if (!["vulnerability", "compliance", "full"].includes(scanType)) {
      return errJson("invalid_request", "Invalid scan type. Must be: vulnerability, compliance, or full", requestId, 400, cors);
    }

    const scan_id = uuid();
    return okJson({
      scan_id,
      target: body.target,
      type: scanType,
      status: "queued",
      initiated_by: user.user_login,
      created_at: new Date().toISOString(),
      estimated_duration_seconds: scanType === "full" ? 300 : 120,
    }, requestId, cors);
  }

  // GET /v1/secure/scan/:id — get scan result
  const scanMatch = url.pathname.match(/^\/v1\/secure\/scan\/([a-f0-9-]+)$/);
  if (req.method === "GET" && scanMatch) {
    const user = await authUser(req, env, requestId);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);
    const scanId = scanMatch[1];
    return okJson({
      scan_id: scanId,
      target: "192.168.1.0/24",
      type: "vulnerability",
      status: "completed",
      started_at: new Date(Date.now() - 120000).toISOString(),
      completed_at: new Date().toISOString(),
      findings: [
        { severity: "high", cve: "CVE-2024-21762", title: "FortiOS Out-of-Bounds Write", affected_asset: "fw-edge-01", remediation: "Update FortiOS to 7.4.3+" },
        { severity: "medium", cve: "CVE-2024-3400", title: "PAN-OS Command Injection", affected_asset: "fw-dmz-02", remediation: "Apply PAN-OS hotfix" },
        { severity: "low", cve: null, title: "SNMP community string default", affected_asset: "switch-floor3", remediation: "Change SNMP community string" },
      ],
      summary: { total: 3, high: 1, medium: 1, low: 1, info: 0 },
    }, requestId, cors);
  }

  // GET /v1/secure/scans — list scans
  if (req.method === "GET" && url.pathname === "/v1/secure/scans") {
    const user = await authUser(req, env, requestId);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", requestId, 429, cors);
    return okJson({
      items: [
        { scan_id: "a1b2c3d4-0000-0000-0000-000000000001", target: "192.168.1.0/24", type: "vulnerability", status: "completed", created_at: "2026-02-07T10:00:00Z" },
        { scan_id: "a1b2c3d4-0000-0000-0000-000000000002", target: "10.0.0.0/16", type: "compliance", status: "running", created_at: "2026-02-07T14:00:00Z" },
      ],
    }, requestId, cors);
  }

  return errJson("not_found", "Not found", requestId, 404, cors);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e: any) {
      if (e instanceof Response) return e;
      const requestId = uuid();
      console.error("Unhandled error:", e);
      return errJson("internal", "Internal error", requestId, 500);
    }
  },
};
