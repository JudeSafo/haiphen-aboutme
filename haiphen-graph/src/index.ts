// haiphen-graph/src/index.ts — Semantic Knowledge Graph service

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
    return okJson({ ok: true, service: "haiphen-graph", time: new Date().toISOString(), version: "v1.0.0" }, rid, cors);
  }

  // GET /v1/graph/schema (public)
  if (req.method === "GET" && url.pathname === "/v1/graph/schema") {
    return okJson({
      entity_types: ["device", "network", "protocol", "vulnerability", "user", "location", "vendor"],
      relationship_types: ["connects_to", "runs_on", "exploits", "manages", "located_at", "manufactured_by", "depends_on"],
      version: "v1.0.0",
    }, rid, cors);
  }

  // POST /v1/graph/query
  if (req.method === "POST" && url.pathname === "/v1/graph/query") {
    const user = await authUser(req, env, rid);
    const body = await req.json().catch(() => null) as null | { q: string; depth?: number; limit?: number };
    if (!body?.q) return errJson("invalid_request", "Missing query (q)", rid, 400, cors);

    const depth = Math.min(body.depth || 2, 5);
    return okJson({
      query: body.q,
      depth,
      queried_by: user.user_login,
      nodes: [
        { id: "dev-001", type: "device", label: "PLC-Floor1", properties: { manufacturer: "Siemens", model: "S7-1500", firmware: "v2.9.4" } },
        { id: "dev-002", type: "device", label: "HMI-Control", properties: { manufacturer: "Rockwell", model: "PanelView", firmware: "v12.0" } },
        { id: "net-001", type: "network", label: "OT-Segment-A", properties: { subnet: "10.0.1.0/24", vlan: 100 } },
        { id: "vuln-001", type: "vulnerability", label: "CVE-2024-21762", properties: { severity: "high", cvss: 9.8 } },
      ],
      edges: [
        { source: "dev-001", target: "net-001", type: "connects_to", properties: { port: 502, protocol: "modbus" } },
        { source: "dev-002", target: "net-001", type: "connects_to", properties: { port: 44818, protocol: "ethernet_ip" } },
        { source: "vuln-001", target: "dev-001", type: "exploits", properties: { vector: "network", complexity: "low" } },
      ],
      total_nodes: 4,
      total_edges: 3,
    }, rid, cors);
  }

  // POST /v1/graph/entities — bulk ingest
  if (req.method === "POST" && url.pathname === "/v1/graph/entities") {
    const user = await authUser(req, env, rid);
    const body = await req.json().catch(() => null) as null | { entities: any[] };
    if (!body?.entities || !Array.isArray(body.entities)) {
      return errJson("invalid_request", "Missing entities array", rid, 400, cors);
    }
    return okJson({
      ingested: body.entities.length,
      created: body.entities.length,
      updated: 0,
      ingested_by: user.user_login,
      timestamp: new Date().toISOString(),
    }, rid, cors);
  }

  // GET /v1/graph/entities
  if (req.method === "GET" && url.pathname === "/v1/graph/entities") {
    await authUser(req, env, rid);
    const typeFilter = url.searchParams.get("type");
    const entities = [
      { id: "dev-001", type: "device", label: "PLC-Floor1", created_at: "2026-02-01T10:00:00Z" },
      { id: "dev-002", type: "device", label: "HMI-Control", created_at: "2026-02-01T10:05:00Z" },
      { id: "net-001", type: "network", label: "OT-Segment-A", created_at: "2026-02-01T09:00:00Z" },
      { id: "vuln-001", type: "vulnerability", label: "CVE-2024-21762", created_at: "2026-02-03T14:00:00Z" },
      { id: "vnd-001", type: "vendor", label: "Siemens AG", created_at: "2026-01-15T08:00:00Z" },
    ];
    const filtered = typeFilter ? entities.filter(e => e.type === typeFilter) : entities;
    return okJson({ items: filtered, total: filtered.length }, rid, cors);
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
