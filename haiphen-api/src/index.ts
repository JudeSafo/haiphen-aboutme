import { buildRss } from "./rss";
import { hmacSha256Hex, json, safeEqual, sha256Hex, uuid, importMasterKey, encryptCredential, decryptCredential } from "./crypto";
import { RateLimiterDO, RateLimitPlan } from "./rate_limit_do";
import { QuotaDO } from "./quota_do";
import { SignalFeedDO } from "./signal_feed_do";
import { normalizeTradesJson, upsertMetricsDaily } from "./ingest";
import { requireUserFromAuthCookie, verifyUserFromJwt } from "./auth";
import { getExtremes, getKpis, getPortfolioAssets, getSeries } from "./metrics_queries";
import { withCors, handleOptions as corsOptions } from "./cors";

// Export DO classes for Wrangler
export { RateLimiterDO, QuotaDO, SignalFeedDO };

type TradesJson = {
  date: string;
  updated_at: string;
  headline: string;
  summary: string;
  rows: Array<{ kpi: string; value: string }>;
  overlay: {
    seriesByKpi: Record<string, Array<{ t: string; v: number; src?: string }>>;
    extremes: {
      byKpi?: Record<string, { hi?: any[]; lo?: any[]; items?: any[] }>;
      legacyKpi?: string;
      source?: string;
    };
    portfolioAssets: Array<{ trade_id: number; symbol: string | null; contract_name: string }>;
  };
  source?: string;
};

type Env = {
  DB: D1Database;
  REVOKE_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  QUOTA_DO: DurableObjectNamespace;
  SIGNAL_FEED: DurableObjectNamespace;

  // Shared with haiphen-auth so we can verify the same cookie JWT for key issuance.
  JWT_SECRET: string;

  // Pepper used to hash API keys (server-side secret; rotate carefully).
  API_KEY_PEPPER: string;

  // Admin token for privileged ops
  ADMIN_TOKEN: string;

  // Internal token for cross-worker quota calls
  INTERNAL_TOKEN: string;

  // Webhook signing: optional global secret salt (per-hook secret is stored anyway)
  WEBHOOK_SALT?: string;

  // Master key for envelope encryption of prospect credentials (hex-encoded 256-bit)
  CREDENTIAL_KEY: string;

  // HMAC signing secret for GKE trades sync job (hex-encoded)
  SIGNING_SECRET?: string;

  // Anthropic API key for Claude synthesis (optional, set via wrangler secret)
  ANTHROPIC_API_KEY?: string;

  // Optional: for CORS allowlist
  ALLOWED_ORIGINS?: string;

  // Optional: onboarding resource links for profile + CLI.
  ONBOARDING_APP_URL?: string;
  ONBOARDING_DOCS_URL?: string;
  ONBOARDING_PROFILE_URL?: string;
  ONBOARDING_COHORT_URL?: string;
  ONBOARDING_CALENDAR_URL?: string;
  ONBOARDING_SUPPORT_EMAIL?: string;
  ONBOARDING_CLI_DOCS_URL?: string;
  ONBOARDING_API_BASE_URL?: string;
  ONBOARDING_WEBSOCKET_URL?: string;
};

type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "quota_exceeded"
  | "invalid_request"
  | "internal";

type ApiError = { error: { code: ErrorCode; message: string; request_id: string } };

function corsHeaders(req: Request, env: Env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io,https://auth.haiphen.io")
    .split(",")
    .map(s => s.trim());

  // Allow localhost origins for local development
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    allowed.push(origin);
  }

  const o = allowed.includes(origin) ? origin : "https://haiphen.io";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Vary": "Origin"
  };
}

function withReqId(headers: Headers, requestId: string) {
  headers.set("X-Request-Id", requestId);
  return headers;
}

function err(code: ErrorCode, message: string, requestId: string, status: number, extraHeaders?: Record<string, string>) {
  const body: ApiError = { error: { code, message, request_id: requestId } };
  const h = new Headers({ "Content-Type": "application/json", ...(extraHeaders ?? {}) });
  withReqId(h, requestId);
  return new Response(JSON.stringify(body, null, 2), { status, headers: h });
}

function okJson(data: unknown, requestId: string, headers?: Record<string, string>) {
  const h = new Headers({ "Content-Type": "application/json", ...(headers ?? {}) });
  withReqId(h, requestId);
  return new Response(JSON.stringify(data, null, 2), { status: 200, headers: h });
}

function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

function b64urlToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function b64urlToString(b64url: string): string {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64);
}

async function ensureUser(env: Env, user: { user_login: string; name?: string | null; email?: string | null }) {
  await env.DB.prepare(`
    INSERT INTO users(user_login, name, email, last_seen_at)
    VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(user_login) DO UPDATE SET
      name = COALESCE(excluded.name, users.name),
      email = COALESCE(excluded.email, users.email),
      last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(user.user_login, user.name ?? null, user.email ?? null).run();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO plans(user_login, plan, active) VALUES (?, 'free', 1)
  `).bind(user.user_login).run();
}

async function getPlan(env: Env, userLogin: string): Promise<"free" | "pro" | "enterprise"> {
  // cache for speed
  const cacheKey = `plan:${userLogin}`;
  const cached = await env.CACHE_KV.get(cacheKey);
  if (cached === "free" || cached === "pro" || cached === "enterprise") return cached;

  const row = await env.DB.prepare(`SELECT plan, active FROM plans WHERE user_login = ?`).bind(userLogin).first<{ plan: string; active: number }>();
  const plan = (row?.active ? row.plan : "free") as any;
  const normalized: "free" | "pro" | "enterprise" =
    plan === "pro" || plan === "enterprise" ? plan : "free";

  await env.CACHE_KV.put(cacheKey, normalized, { expirationTtl: 300 });
  return normalized;
}

function planToRateLimit(plan: "free" | "pro" | "enterprise"): RateLimitPlan {
  if (plan === "pro") return { limitPerMinute: 30, burst: 20 };
  if (plan === "enterprise") return { limitPerMinute: 120, burst: 60 };
  return { limitPerMinute: 12, burst: 8 };
}

function planToEntitlements(plan: "free" | "pro" | "enterprise") {
  const paid = plan === "pro" || plan === "enterprise";

  // Decide what "free" can do. I’m assuming:
  // - docs page itself is public
  // - API/RSS require paid (or at least an issued key + scopes)
  // Adjust as you like.
  return {
    active: paid,
    plan,
    features: {
      docs: true,          // docs page should render
      api: paid,           // request access / try-it gating
      rss: paid,           // rss endpoints
      services: paid,      // whatever else you gate
      trade_engine: paid,
    }
  };
}

async function consumeRateLimit(env: Env, apiKeyHash: string, plan: "free" | "pro" | "enterprise", cost = 1) {
  const id = env.RATE_LIMITER.idFromName(apiKeyHash);
  const stub = env.RATE_LIMITER.get(id);
  const res = await stub.fetch("https://rate-limiter/consume", {
    method: "POST",
    body: JSON.stringify({ plan: planToRateLimit(plan), cost })
  });
  const data = await res.json() as { allowed: boolean; remaining: number; limit: number; resetMs: number };
  return data;
}

type KeyAuth = { user_login: string; scopes: string[]; key_id: string; plan: "free" | "pro" | "enterprise"; key_hash: string };

async function authApiKey(req: Request, env: Env, requestId: string): Promise<KeyAuth> {
  const token = bearer(req);
  if (!token) throw err("unauthorized", "Missing or invalid API key", requestId, 401);

  // fast revocation check (KV)
  const tokenHash = await sha256Hex(`${token}.${env.API_KEY_PEPPER}`);
  const revoked = await env.REVOKE_KV.get(`revoked:${tokenHash}`);
  if (revoked) throw err("unauthorized", "Missing or invalid API key", requestId, 401);

  // lookup
  const row = await env.DB
    .prepare(`SELECT key_id, user_login, scopes, status FROM api_keys WHERE key_hash = ?`)
    .bind(tokenHash)
    .first<{ key_id: string; user_login: string; scopes: string; status: string }>();

  if (!row || row.status !== "active") throw err("unauthorized", "Missing or invalid API key", requestId, 401);

  const plan = await getPlan(env, row.user_login);

  // rate limit per key
  const rl = await consumeRateLimit(env, tokenHash, plan, 1);
  if (!rl.allowed) {
    const resetSeconds = Math.ceil((rl.resetMs - Date.now()) / 1000);
    throw err(
      "rate_limited",
      "Rate limit exceeded",
      requestId,
      429,
      {
        "Retry-After": String(Math.max(1, resetSeconds)),
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(Math.max(0, rl.remaining)),
        "X-RateLimit-Reset": String(Math.floor(rl.resetMs / 1000))
      }
    );
  }

  // update last_used_at (best-effort)
  env.DB.prepare(`UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key_id = ?`)
    .bind(row.key_id)
    .run()
    .catch(() => {});

  const scopes = JSON.parse(row.scopes) as string[];
  return { user_login: row.user_login, scopes, key_id: row.key_id, plan, key_hash: tokenHash };
}

function requireScope(scopes: string[], needed: string, requestId: string) {
  if (!scopes.includes(needed)) throw err("forbidden", "Insufficient scope", requestId, 403);
}

async function authCookieUser(req: Request, env: Env, requestId: string): Promise<{ user_login: string; name?: string | null; email?: string | null }> {
  try {
    const user = await requireUserFromAuthCookie(req, env.JWT_SECRET);
    return { user_login: user.login, name: user.name, email: user.email };
  } catch (e: any) {
    throw err("unauthorized", "Unauthorized", requestId, 401);
  }
}

async function authSessionUser(req: Request, env: Env, requestId: string): Promise<{ user_login: string; name?: string | null; email?: string | null }> {
  // 1) Browser dashboard path: signed auth cookie
  try {
    return await authCookieUser(req, env, requestId);
  } catch {
    // Fall through to bearer JWT for CLI/native clients.
  }

  // 2) CLI/native path: bearer session JWT issued by haiphen-auth
  const token = bearer(req);
  if (!token) throw err("unauthorized", "Unauthorized", requestId, 401);

  try {
    const user = await verifyUserFromJwt(token, env.JWT_SECRET);
    return { user_login: user.login, name: user.name, email: user.email };
  } catch {
    throw err("unauthorized", "Unauthorized", requestId, 401);
  }
}

function onboardingLinks(env: Env) {
  return {
    app_url: String(env.ONBOARDING_APP_URL ?? "https://app.haiphen.io/").trim(),
    docs_url: String(env.ONBOARDING_DOCS_URL ?? "https://haiphen.io/#docs").trim(),
    profile_url: String(env.ONBOARDING_PROFILE_URL ?? "https://haiphen.io/#profile").trim(),
    cohort_url: String(env.ONBOARDING_COHORT_URL ?? "https://haiphen.io/#cohort").trim(),
    calendar_url: String(env.ONBOARDING_CALENDAR_URL ?? "https://calendar.app.google/jQzWz98eCC5jMLrQA").trim(),
    support_email: String(env.ONBOARDING_SUPPORT_EMAIL ?? "pi@haiphenai.com").trim(),
    cli_docs_url: String(env.ONBOARDING_CLI_DOCS_URL ?? "https://haiphen.io/#docs:docs-cli-commands").trim(),
    api_base_url: String(env.ONBOARDING_API_BASE_URL ?? "https://api.haiphen.io").trim(),
    websocket_url: String(env.ONBOARDING_WEBSOCKET_URL ?? "wss://api.haiphen.io/v1/telemetry/stream").trim(),
    metrics_docs_url: "https://haiphen.io/#docs:docs-endpoints",
    secure_docs_url: "https://haiphen.io/#docs:docs-secure",
    network_docs_url: "https://haiphen.io/#docs:docs-network",
    graph_docs_url: "https://haiphen.io/#docs:docs-graph",
    risk_docs_url: "https://haiphen.io/#docs:docs-risk",
    causal_docs_url: "https://haiphen.io/#docs:docs-causal",
    supply_docs_url: "https://haiphen.io/#docs:docs-supply",
  };
}

function parseDateParam(s: string | null): string | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

async function latestDate(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT date FROM metrics_daily ORDER BY date DESC LIMIT 1`).first<{ date: string }>();
  return row?.date ?? null;
}

async function getDaily(env: Env, date: string) {
  const row = await env.DB.prepare(`SELECT * FROM metrics_daily WHERE date = ?`).bind(date).first<{
    date: string;
    updated_at: string;
    headline: string;
    summary: string;
    rows_json: string;
    overlay_json: string;
  }>();

  if (!row) return null;

  return {
    date: row.date,
    updated_at: row.updated_at,
    headline: row.headline,
    summary: row.summary,
    rows: JSON.parse(row.rows_json),
    overlay: JSON.parse(row.overlay_json)
  };
}

async function handleOptions(req: Request, env: Env) {
  const requestId = uuid();
  return new Response(null, { status: 204, headers: corsHeaders(req, env) as any });
}

async function revokeAllActiveKeysForUser(env: Env, userLogin: string): Promise<number> {
  // Grab active keys (we need hashes for REVOKE_KV)
  const active = await env.DB.prepare(`
    SELECT key_id, key_hash
    FROM api_keys
    WHERE user_login = ? AND status = 'active'
    ORDER BY created_at DESC
  `).bind(userLogin).all<{ key_id: string; key_hash: string }>();

  const items = active.results ?? [];
  if (!items.length) return 0;

  // Revoke in DB first (DB is source of truth; KV is an optimization)
  await env.DB.prepare(`
    UPDATE api_keys
    SET status='revoked',
        revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE user_login = ? AND status = 'active'
  `).bind(userLogin).run();

  // Best-effort KV writes so auth rejects without DB hit
  await Promise.all(
    items.map((k) =>
      env.REVOKE_KV.put(`revoked:${k.key_hash}`, "1", { expirationTtl: 60 * 60 * 24 * 365 })
        .catch(() => {})
    )
  );

  return items.length;
}

async function route(req: Request, env: Env): Promise<Response> {
  const requestId = uuid();
  const url = new URL(req.url);

  if (req.method === "OPTIONS") return corsOptions(req, env.ALLOWED_ORIGINS);

  // normalize: everything is under /v1
  if (!url.pathname.startsWith("/v1/")) {
    return err("not_found", "Not found", requestId, 404, corsHeaders(req, env));
  }

  // ---- health ----
  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson(
      { ok: true, time: new Date().toISOString(), version: "v1.0.0" },
      requestId,
      corsHeaders(req, env)
    );
  }

  // ---- GET /v1/trades/latest (public, no auth) ----
  if (req.method === "GET" && url.pathname === "/v1/trades/latest") {
    const dateParam = parseDateParam(url.searchParams.get("date"));
    const cacheKey = dateParam ? `trades:${dateParam}:json` : "trades:latest:json";

    // Check KV cache first (5-min TTL)
    const cached = await env.CACHE_KV.get(cacheKey);
    if (cached) {
      const h = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
        ...corsHeaders(req, env),
      });
      withReqId(h, requestId);
      return new Response(cached, { status: 200, headers: h });
    }

    const date = dateParam ?? (await latestDate(env));
    if (!date) return err("not_found", "No trades data available", requestId, 404, corsHeaders(req, env));

    const daily = await getDaily(env, date);
    if (!daily) return err("not_found", `No trades data for ${date}`, requestId, 404, corsHeaders(req, env));

    const body = JSON.stringify(daily);
    await env.CACHE_KV.put(cacheKey, body, { expirationTtl: 300 }).catch(() => {});

    const h = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
      ...corsHeaders(req, env),
    });
    withReqId(h, requestId);
    return new Response(body, { status: 200, headers: h });
  }

  // ---- GET /v1/trades/dates (public, no auth) ----
  if (req.method === "GET" && url.pathname === "/v1/trades/dates") {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    const rows = await env.DB.prepare(
      `SELECT date, updated_at, headline FROM metrics_daily ORDER BY date DESC LIMIT ?`
    ).bind(limit).all<{ date: string; updated_at: string; headline: string }>();

    const items = (rows.results ?? []).map(r => ({
      date: r.date,
      updated_at: r.updated_at,
      headline: r.headline,
      json: `https://api.haiphen.io/v1/trades/latest?date=${r.date}`,
    }));

    return okJson({ items }, requestId, corsHeaders(req, env));
  }

  // ---- whoami / me (cookie auth) ----
  if (req.method === "GET" && (url.pathname === "/v1/whoami" || url.pathname === "/v1/me")) {
    const u = await authCookieUser(req, env, requestId);
    await ensureUser(env, u);

    const plan = await getPlan(env, u.user_login);
    const entitlements = planToEntitlements(plan);

    // Latest active key (metadata only — NEVER return raw api_key here)
    const key = await env.DB.prepare(`
      SELECT key_id, key_prefix, scopes, status, created_at, last_used_at
      FROM api_keys
      WHERE user_login = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(u.user_login).first<{
      key_id: string;
      key_prefix: string;
      scopes: string;
      status: string;
      created_at: string;
      last_used_at: string | null;
    }>();

    return okJson({
      user_login: u.user_login,
      plan,                 // keep for back-compat
      entitlements,         // ✅ this is what your front-end expects
      api_key: key ? {
        key_id: key.key_id,
        key_prefix: key.key_prefix,
        scopes: (() => { try { return JSON.parse(key.scopes) } catch { return [] } })(),
        status: key.status,
        created_at: key.created_at,
        last_used_at: key.last_used_at
      } : null
    }, requestId, corsHeaders(req, env));
  }

  // ---- onboarding resources (cookie OR bearer JWT auth) ----
  // GET /v1/onboarding/resources
  if (req.method === "GET" && url.pathname === "/v1/onboarding/resources") {
    const u = await authSessionUser(req, env, requestId);
    await ensureUser(env, u);

    const plan = await getPlan(env, u.user_login);
    const entitlements = planToEntitlements(plan);

    return okJson(
      {
        ok: true,
        user_login: u.user_login,
        plan,
        entitlements,
        links: onboardingLinks(env),
      },
      requestId,
      corsHeaders(req, env),
    );
  }

  // ---- keys list (cookie-auth): list ALL keys (metadata only) ----
  // GET /v1/keys/list
  if (req.method === "GET" && url.pathname === "/v1/keys/list") {
    const u = await authCookieUser(req, env, requestId);
    await ensureUser(env, u);

    const keys = await env.DB.prepare(`
      SELECT
        key_id, key_prefix, scopes, status,
        created_at, last_used_at, revoked_at
      FROM api_keys
      WHERE user_login = ?
      ORDER BY created_at DESC
    `).bind(u.user_login).all<{
      key_id: string;
      key_prefix: string;
      scopes: string;
      status: "active" | "revoked";
      created_at: string;
      last_used_at: string | null;
      revoked_at: string | null;
    }>();

    const items = (keys.results ?? []).map(k => ({
      key_id: k.key_id,
      key_prefix: k.key_prefix,
      scopes: (() => { try { return JSON.parse(k.scopes) } catch { return [] } })(),
      status: k.status,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
      revoked_at: k.revoked_at
    }));

    return okJson({ items }, requestId, corsHeaders(req, env));
  }

  // ---- ADMIN: debug auth cookie verification ----
  // GET /v1/admin/debug/auth-cookie
  if (req.method === "GET" && url.pathname === "/v1/admin/debug/auth-cookie") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));

    const rawCookie = req.headers.get("Cookie") || "";
    const token = rawCookie.match(/(?:^|;\s*)auth=([^;]+)/)?.[1] ?? null;

    if (!token) return okJson({ ok: false, reason: "missing_auth_cookie", rawCookiePresent: Boolean(rawCookie) }, requestId, corsHeaders(req, env));

    const parts = token.split(".");
    if (parts.length !== 3) return okJson({ ok: false, reason: "malformed_jwt", parts: parts.length }, requestId, corsHeaders(req, env));

    const [h, p] = parts;

    // decode payload WITHOUT verification (debug only)
    const b64urlToString = (b64url: string) => {
      const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
      const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
      return atob(b64);
    };

    let payload: any = null;
    try { payload = JSON.parse(b64urlToString(p)); } catch {}

    // try real verification via your canonical helper
    let verified = false;
    let error = null as string | null;
    try {
      const user = await requireUserFromAuthCookie(req, env.JWT_SECRET);
      verified = true;
      return okJson({ ok: true, verified, user, payload }, requestId, corsHeaders(req, env));
    } catch (e: any) {
      error = String(e?.message ?? e);
    }

    return okJson({ ok: false, verified, error, payload }, requestId, corsHeaders(req, env));
  }
  // ---- metrics/daily ----
  if (req.method === "GET" && url.pathname === "/v1/metrics/daily") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);

    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? (await latestDate(env));
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));

    const daily = await getDaily(env, date);
    if (!daily) return err("not_found", "Metrics not found", requestId, 404, corsHeaders(req, env));

    return okJson(daily, requestId, corsHeaders(req, env));
  }

  // ---- metrics/kpis ----
  if (req.method === "GET" && url.pathname === "/v1/metrics/kpis") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);

    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? (await latestDate(env));
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));

    const items = await getKpis(env, date);
    return okJson({ date, items }, requestId, corsHeaders(req, env));
  }

  // ---- metrics/series ----
  if (req.method === "GET" && url.pathname === "/v1/metrics/series") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);

    const kpi = String(url.searchParams.get("kpi") ?? "").trim();
    if (!kpi) return err("invalid_request", "Missing kpi", requestId, 400, corsHeaders(req, env));
    if (!/^[\w\s.:/%()+-]{1,100}$/.test(kpi)) return err("invalid_request", "Invalid kpi format", requestId, 400, corsHeaders(req, env));

    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? (await latestDate(env));
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));

    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const limit = Number(url.searchParams.get("limit") ?? "500");

    const points = await getSeries(env, date, kpi, from, to, limit);
    return okJson({ date, kpi, points }, requestId, corsHeaders(req, env));
  }

  // ---- metrics/extremes ----
  if (req.method === "GET" && url.pathname === "/v1/metrics/extremes") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);

    const kpi = String(url.searchParams.get("kpi") ?? "").trim();
    if (!kpi) return err("invalid_request", "Missing kpi", requestId, 400, corsHeaders(req, env));
    if (!/^[\w\s.:/%()+-]{1,100}$/.test(kpi)) return err("invalid_request", "Invalid kpi format", requestId, 400, corsHeaders(req, env));

    const sideRaw = String(url.searchParams.get("side") ?? "hi").trim().toLowerCase();
    const side = (sideRaw === "lo" ? "lo" : "hi") as "hi" | "lo";

    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? (await latestDate(env));
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));

    const limit = Number(url.searchParams.get("limit") ?? "10");
    const items = await getExtremes(env, date, kpi, side, limit);

    return okJson({ date, kpi, side, items }, requestId, corsHeaders(req, env));
  }

  // ---- metrics/portfolio-assets ----
  if (req.method === "GET" && url.pathname === "/v1/metrics/portfolio-assets") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);

    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? (await latestDate(env));
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));

    const symbol = url.searchParams.get("symbol") || undefined;
    const limit = Number(url.searchParams.get("limit") ?? "200");

    const items = await getPortfolioAssets(env, date, symbol, limit);
    return okJson({ date, symbol: symbol ?? null, items }, requestId, corsHeaders(req, env));
  }

  // ---- metrics/dates ----
  if (req.method === "GET" && url.pathname === "/v1/metrics/dates") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);

    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(200, Math.max(1, Number(limitRaw ?? "50")));
    const cursor = url.searchParams.get("cursor"); // date string

    let stmt: D1PreparedStatement;
    if (cursor && /^\d{4}-\d{2}-\d{2}$/.test(cursor)) {
      stmt = env.DB.prepare(`SELECT date FROM metrics_daily WHERE date < ? ORDER BY date DESC LIMIT ?`).bind(cursor, limit);
    } else {
      stmt = env.DB.prepare(`SELECT date FROM metrics_daily ORDER BY date DESC LIMIT ?`).bind(limit);
    }

    const rows = await stmt.all<{ date: string }>();
    const items = (rows.results ?? []).map(r => ({ date: r.date }));
    const next_cursor = items.length === limit ? items[items.length - 1].date : null;

    return okJson({ items, next_cursor }, requestId, corsHeaders(req, env));
  }

  // ---- rss ----
  if (req.method === "GET" && url.pathname === "/v1/rss/daily") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "rss:read", requestId);

    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? (await latestDate(env));
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));

    const daily = await getDaily(env, date);
    if (!daily) return err("not_found", "Metrics not found", requestId, 404, corsHeaders(req, env));

    const xml = buildRss(daily as any);
    const h = new Headers({ "Content-Type": "application/rss+xml; charset=utf-8", ...corsHeaders(req, env) });
    withReqId(h, requestId);
    return new Response(xml, { status: 200, headers: h });
  }

  // ---- ADMIN: upsert metrics payload (direct JSON or fetch from URL) ----
  // POST /v1/admin/metrics/upsert
  // headers: X-Admin-Token
  // body: either full trades.json payload OR { url: "https://haiphen.io/docs/assets/trades/trades.json" }
  if (req.method === "POST" && url.pathname === "/v1/admin/metrics/upsert") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));

    const body = await req.json().catch(() => null) as any;
    if (!body) return err("invalid_request", "Invalid JSON body", requestId, 400, corsHeaders(req, env));

    let payload: unknown = body;

    // Optional fetch mode — restricted to trusted domains to prevent SSRF
    if (typeof body?.url === "string") {
      const u = body.url as string;
      if (!/^https:\/\/.+/i.test(u)) return err("invalid_request", "url must be https://", requestId, 400, corsHeaders(req, env));

      const ALLOWED_FETCH_HOSTS = ["haiphen.io", "www.haiphen.io", "api.haiphen.io", "raw.githubusercontent.com"];
      let fetchHost: string;
      try { fetchHost = new URL(u).hostname.toLowerCase(); } catch {
        return err("invalid_request", "Invalid URL", requestId, 400, corsHeaders(req, env));
      }
      if (!ALLOWED_FETCH_HOSTS.includes(fetchHost)) {
        return err("invalid_request", `Fetch domain not allowed: ${fetchHost}`, requestId, 400, corsHeaders(req, env));
      }

      const r = await fetch(u, { headers: { "Accept": "application/json" } });
      if (!r.ok) return err("invalid_request", `Failed to fetch url (status ${r.status})`, requestId, 400, corsHeaders(req, env));
      payload = await r.json();
    }

    const normalized = normalizeTradesJson(payload);
    await upsertMetricsDaily(env, normalized);

    // Optional: bust latest cache so API sees it immediately
    await env.CACHE_KV.delete("metrics:latest").catch(() => {});

    return okJson({ ok: true, date: normalized.date, updated_at: normalized.updated_at }, requestId, corsHeaders(req, env));
  }

  // ---- INTERNAL: trades snapshot write (cross-worker / GKE sync job) ----
  // POST /v1/internal/trades/snapshot
  // Auth: X-Internal-Token header AND optional X-Signature HMAC-SHA256 verification
  if (req.method === "POST" && url.pathname === "/v1/internal/trades/snapshot") {
    const tok = req.headers.get("X-Internal-Token") || "";
    if (!safeEqual(tok, env.INTERNAL_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));

    const rawBody = await req.text();

    // HMAC signature verification (when SIGNING_SECRET is configured)
    if (env.SIGNING_SECRET) {
      const sig = req.headers.get("X-Signature") || "";
      if (!sig) return err("forbidden", "Missing X-Signature header", requestId, 403, corsHeaders(req, env));
      const expected = await hmacSha256Hex(env.SIGNING_SECRET, rawBody);
      if (!safeEqual(sig, expected)) return err("forbidden", "Invalid signature", requestId, 403, corsHeaders(req, env));
    }

    const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
    if (!body) return err("invalid_request", "Invalid JSON body", requestId, 400, corsHeaders(req, env));

    const normalized = normalizeTradesJson(body);
    await upsertMetricsDaily(env, normalized);

    // Bust caches so GET endpoints serve fresh data
    await Promise.all([
      env.CACHE_KV.delete("trades:latest:json").catch(() => {}),
      env.CACHE_KV.delete(`trades:${normalized.date}:json`).catch(() => {}),
      env.CACHE_KV.delete("metrics:latest").catch(() => {}),
    ]);

    // Broadcast to signal feed WebSocket subscribers
    const feedId = env.SIGNAL_FEED.idFromName("global");
    const feed = env.SIGNAL_FEED.get(feedId);
    await feed.fetch(new Request("https://do/broadcast", {
      method: "POST",
      body: JSON.stringify({ type: "snapshot", ...normalized }),
    })).catch(() => {});

    return okJson({ ok: true, date: normalized.date, updated_at: normalized.updated_at }, requestId, corsHeaders(req, env));
  }

  // ---- INTERNAL: daily trading report write (GKE sync job) ----
  // POST /v1/internal/trading-report
  // Auth: X-Internal-Token header AND optional X-Signature HMAC-SHA256 verification
  if (req.method === "POST" && url.pathname === "/v1/internal/trading-report") {
    const tok = req.headers.get("X-Internal-Token") || "";
    if (!safeEqual(tok, env.INTERNAL_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));

    const rawBody = await req.text();

    // HMAC signature verification (when SIGNING_SECRET is configured)
    if (env.SIGNING_SECRET) {
      const sig = req.headers.get("X-Signature") || "";
      if (!sig) return err("forbidden", "Missing X-Signature header", requestId, 403, corsHeaders(req, env));
      const expected = await hmacSha256Hex(env.SIGNING_SECRET, rawBody);
      if (!safeEqual(sig, expected)) return err("forbidden", "Invalid signature", requestId, 403, corsHeaders(req, env));
    }

    const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
    if (!body) return err("invalid_request", "Invalid JSON body", requestId, 400, corsHeaders(req, env));

    const reportDate = body.report_date;
    if (!reportDate || typeof reportDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      return err("invalid_request", "Missing or invalid report_date (expected YYYY-MM-DD)", requestId, 400, corsHeaders(req, env));
    }

    // Upsert to D1
    await env.DB.prepare(`
      INSERT INTO trading_report_snapshots(date, payload, updated_at)
      VALUES (?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ','now')))
      ON CONFLICT(date) DO UPDATE SET
        payload=excluded.payload,
        updated_at=excluded.updated_at
    `).bind(reportDate, rawBody).run();

    return okJson({ ok: true, date: reportDate }, requestId, corsHeaders(req, env));
  }

  // ---- INTERNAL: position events upsert (GKE sync job) ----
  // POST /v1/internal/position-events
  // Auth: X-Internal-Token + optional X-Signature HMAC-SHA256
  // Body: { positions: [ { id, trade_id, buy_sell_id, ... }, ... ] }
  if (req.method === "POST" && url.pathname === "/v1/internal/position-events") {
    const tok = req.headers.get("X-Internal-Token") || "";
    if (!safeEqual(tok, env.INTERNAL_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));

    const rawBody = await req.text();

    if (env.SIGNING_SECRET) {
      const sig = req.headers.get("X-Signature") || "";
      if (!sig) return err("forbidden", "Missing X-Signature header", requestId, 403, corsHeaders(req, env));
      const expected = await hmacSha256Hex(env.SIGNING_SECRET, rawBody);
      if (!safeEqual(sig, expected)) return err("forbidden", "Invalid signature", requestId, 403, corsHeaders(req, env));
    }

    const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
    if (!body) return err("invalid_request", "Invalid JSON body", requestId, 400, corsHeaders(req, env));

    const positions: any[] = body.positions;
    if (!Array.isArray(positions) || positions.length === 0) {
      return err("invalid_request", "Missing or empty positions array", requestId, 400, corsHeaders(req, env));
    }

    // Batch upsert — D1 supports up to 100 bound statements per batch
    const stmts = positions.map((p: any) =>
      env.DB.prepare(`
        INSERT INTO position_events(
          id, trade_id, buy_sell_id, underlying, contract_name,
          option_type, strike_price, expiration_date, strategy,
          entry_side, entry_order_type, entry_limit_price, entry_premium, entry_time,
          entry_condition, exit_condition,
          delta, gamma, theta, vega, iv,
          bid_price, ask_price, last_price, spot_price, dividend_yield,
          exit_side, exit_order_type, exit_limit_price, exit_time,
          pnl_per_share, pnl_total, hold_seconds,
          trade_status, close_reason, updated_at
        ) VALUES (
          ?,?,?,?,?,
          ?,?,?,?,
          ?,?,?,?,?,
          ?,?,
          ?,?,?,?,?,
          ?,?,?,?,?,
          ?,?,?,?,
          ?,?,?,
          ?,?,
          (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
        ON CONFLICT(id) DO UPDATE SET
          exit_side=excluded.exit_side,
          exit_order_type=excluded.exit_order_type,
          exit_limit_price=excluded.exit_limit_price,
          exit_time=excluded.exit_time,
          pnl_per_share=excluded.pnl_per_share,
          pnl_total=excluded.pnl_total,
          hold_seconds=excluded.hold_seconds,
          trade_status=excluded.trade_status,
          close_reason=excluded.close_reason,
          bid_price=excluded.bid_price,
          ask_price=excluded.ask_price,
          last_price=excluded.last_price,
          updated_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      `).bind(
        p.id, p.trade_id, p.buy_sell_id, p.underlying, p.contract_name,
        p.option_type ?? null, p.strike_price ?? null, p.expiration_date ?? null, p.strategy ?? null,
        p.entry_side ?? null, p.entry_order_type ?? null, p.entry_limit_price ?? null, p.entry_premium ?? null, p.entry_time ?? null,
        p.entry_condition ?? null, p.exit_condition ?? null,
        p.delta ?? null, p.gamma ?? null, p.theta ?? null, p.vega ?? null, p.iv ?? null,
        p.bid_price ?? null, p.ask_price ?? null, p.last_price ?? null, p.spot_price ?? null, p.dividend_yield ?? null,
        p.exit_side ?? null, p.exit_order_type ?? null, p.exit_limit_price ?? null, p.exit_time ?? null,
        p.pnl_per_share ?? null, p.pnl_total ?? null, p.hold_seconds ?? null,
        p.trade_status, p.close_reason ?? null
      )
    );

    // D1 batch() handles up to 100 statements
    const BATCH_SIZE = 100;
    let upserted = 0;
    for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
      await env.DB.batch(stmts.slice(i, i + BATCH_SIZE));
      upserted += Math.min(BATCH_SIZE, stmts.length - i);
    }

    // Broadcast to signal feed for connected daemons
    try {
      const feedId = env.SIGNAL_FEED.idFromName("global");
      const feed = env.SIGNAL_FEED.get(feedId);
      await feed.fetch(new Request("https://do/broadcast", {
        method: "POST",
        body: JSON.stringify({ type: "position_events", positions }),
      }));
    } catch { /* best-effort broadcast */ }

    return okJson({ ok: true, upserted, total: positions.length }, requestId, corsHeaders(req, env));
  }

  // ---- position events query (session auth) ----
  if (req.method === "GET" && url.pathname === "/v1/position-events") {
    const { user_login } = await authSessionUser(req, env, requestId);
    if (!user_login) return err("unauthorized", "Unauthorized", requestId, 401, corsHeaders(req, env));

    const status = url.searchParams.get("status") || null;
    const underlying = url.searchParams.get("underlying") || null;
    const since = url.searchParams.get("since") || null;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);

    let sql = "SELECT * FROM position_events WHERE 1=1";
    const binds: any[] = [];
    if (status) { sql += " AND trade_status = ?"; binds.push(status); }
    if (underlying) { sql += " AND underlying = ?"; binds.push(underlying); }
    if (since) { sql += " AND synced_at >= ?"; binds.push(since); }
    sql += " ORDER BY synced_at DESC LIMIT ?";
    binds.push(limit);

    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return okJson({ ok: true, events: results }, requestId, corsHeaders(req, env));
  }

  // ---- webhooks ----
  if (req.method === "POST" && url.pathname === "/v1/webhooks") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "webhooks:write", requestId);
    if (auth.plan === "free") throw err("forbidden", "Webhooks require Pro or Enterprise", requestId, 403);

    const body = await req.json().catch(() => null) as null | { url: string; events: string[] };
    if (!body?.url || !Array.isArray(body.events) || body.events.length === 0) {
      return err("invalid_request", "Invalid body", requestId, 400, corsHeaders(req, env));
    }
    if (!/^https:\/\/.+/i.test(body.url)) return err("invalid_request", "Webhook url must be https://", requestId, 400, corsHeaders(req, env));

    const webhook_id = uuid();
    const secret = uuid().replaceAll("-", "") + (env.WEBHOOK_SALT ?? "");

    await env.DB.prepare(`
      INSERT INTO webhooks(webhook_id, user_login, url, events_json, secret)
      VALUES (?, ?, ?, ?, ?)
    `).bind(webhook_id, auth.user_login, body.url, json(body.events), secret).run();

    return okJson(
      { webhook_id, url: body.url, events: body.events },
      requestId,
      corsHeaders(req, env)
    );
  }

  // ---- key issuance (cookie-auth; used by your app UI after login + Stripe) ----
  // POST /v1/keys/issue  body: { scopes?: string[] }
  if (req.method === "POST" && url.pathname === "/v1/keys/issue") {
    const u = await authCookieUser(req, env, requestId);
    await ensureUser(env, u);

    const plan = await getPlan(env, u.user_login);

    const body = await req.json().catch(() => ({})) as { scopes?: string[] };
    const scopes = Array.isArray(body.scopes) && body.scopes.length > 0
      ? body.scopes
      : ["metrics:read", "rss:read"]; // default minimal

    // validate scopes
    const allowedScopes = new Set(["metrics:read", "rss:read", "webhooks:write"]);
    for (const s of scopes) {
      if (!allowedScopes.has(s)) return err("invalid_request", `Unknown scope: ${s}`, requestId, 400, corsHeaders(req, env));
      if (s === "webhooks:write" && plan === "free") {
        return err("forbidden", "webhooks:write requires Pro or Enterprise", requestId, 403, corsHeaders(req, env));
      }
    }

    // ✅ Enforce "one active key per user" server-side
    await revokeAllActiveKeysForUser(env, u.user_login);

    const key_id = uuid();
    const raw = `hp_live_${uuid().replaceAll("-", "")}${uuid().replaceAll("-", "")}`; // long enough
    const key_hash = await sha256Hex(`${raw}.${env.API_KEY_PEPPER}`);
    const key_prefix = raw.slice(0, 16);

    await env.DB.prepare(`
      INSERT INTO api_keys(key_id, user_login, key_prefix, key_hash, scopes, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).bind(key_id, u.user_login, key_prefix, key_hash, json(scopes)).run();

    // return raw key ONLY ONCE
    return okJson(
      { api_key: raw, key_id, key_prefix, scopes },
      requestId,
      corsHeaders(req, env)
    );
  }

  // ---- key rotation (cookie-auth): create new, optionally revoke old by key_id ----
  // POST /v1/keys/rotate  body: { revoke_key_id?: string, scopes?: string[] }
  if (req.method === "POST" && url.pathname === "/v1/keys/rotate") {
    const u = await authCookieUser(req, env, requestId);
    await ensureUser(env, u);

    const body = await req.json().catch(() => ({})) as { revoke_key_id?: string; scopes?: string[] };
    const revokeKeyId = body.revoke_key_id;

    // issue new
    const issueRes = await route(new Request(req.url.replace("/v1/keys/rotate", "/v1/keys/issue"), {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({ scopes: body.scopes })
    }), env);

    // revoke old if requested (only if belongs to user)
    if (revokeKeyId) {
      const row = await env.DB.prepare(`SELECT key_hash FROM api_keys WHERE key_id = ? AND user_login = ? AND status = 'active'`)
        .bind(revokeKeyId, u.user_login)
        .first<{ key_hash: string }>();

      if (row?.key_hash) {
        await env.DB.prepare(`UPDATE api_keys SET status='revoked', revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key_id = ?`)
          .bind(revokeKeyId)
          .run();
        await env.REVOKE_KV.put(`revoked:${row.key_hash}`, "1", { expirationTtl: 60 * 60 * 24 * 365 });
      }
    }

    return issueRes;
  }

  // ---- key revoke (cookie-auth): revoke by key_id ----
  // POST /v1/keys/revoke body: { key_id: string }
  if (req.method === "POST" && url.pathname === "/v1/keys/revoke") {
    const u = await authCookieUser(req, env, requestId);
    const body = await req.json().catch(() => null) as null | { key_id: string };
    if (!body?.key_id) return err("invalid_request", "Missing key_id", requestId, 400, corsHeaders(req, env));

    const row = await env.DB.prepare(`SELECT key_hash FROM api_keys WHERE key_id = ? AND user_login = ? AND status='active'`)
      .bind(body.key_id, u.user_login)
      .first<{ key_hash: string }>();

    if (!row) return err("not_found", "Key not found", requestId, 404, corsHeaders(req, env));

    await env.DB.prepare(`UPDATE api_keys SET status='revoked', revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key_id = ?`)
      .bind(body.key_id)
      .run();
    await env.REVOKE_KV.put(`revoked:${row.key_hash}`, "1", { expirationTtl: 60 * 60 * 24 * 365 });

    return okJson({ ok: true }, requestId, corsHeaders(req, env));
  }

  // ---- ADMIN: set plan/entitlement ----
  // POST /v1/admin/plan body: { user_login, plan }
  if (req.method === "POST" && url.pathname === "/v1/admin/plan") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));

    const body = await req.json().catch(() => null) as null | { user_login: string; plan: "free" | "pro" | "enterprise" };
    if (!body?.user_login || !body?.plan) return err("invalid_request", "Invalid body", requestId, 400, corsHeaders(req, env));

    await ensureUser(env, { user_login: body.user_login });
    await env.DB.prepare(`
      INSERT INTO plans(user_login, plan, active, updated_at)
      VALUES (?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(user_login) DO UPDATE SET plan=excluded.plan, active=1, updated_at=excluded.updated_at
    `).bind(body.user_login, body.plan).run();

    await env.CACHE_KV.put(`plan:${body.user_login}`, body.plan, { expirationTtl: 300 });

    return okJson({ ok: true }, requestId, corsHeaders(req, env));
  }

  // ---- ADMIN: publish webhooks for a date (simple fanout) ----
  // POST /v1/admin/publish body: { date: "YYYY-MM-DD", event?: "metrics.published" }
  if (req.method === "POST" && url.pathname === "/v1/admin/publish") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));

    const body = await req.json().catch(() => null) as null | { date: string; event?: string };
    const date = parseDateParam(body?.date ?? null);
    if (!date) return err("invalid_request", "Invalid date", requestId, 400, corsHeaders(req, env));
    const event = body?.event ?? "metrics.published";

    const daily = await getDaily(env, date);
    if (!daily) return err("not_found", "Metrics not found", requestId, 404, corsHeaders(req, env));

    // all active webhooks that include this event
    const hooks = await env.DB.prepare(`SELECT webhook_id, url, events_json, secret FROM webhooks WHERE status='active'`).all<{
      webhook_id: string; url: string; events_json: string; secret: string;
    }>();

    const payload = { event, data: daily, sent_at: new Date().toISOString() };
    const payloadStr = JSON.stringify(payload);

    const deliveries = await Promise.all((hooks.results ?? []).map(async (h) => {
      const events = JSON.parse(h.events_json) as string[];
      if (!events.includes(event)) return { webhook_id: h.webhook_id, skipped: true };

      const sig = await hmacSha256Hex(h.secret, payloadStr);
      const delivery_id = uuid();

      try {
        const res = await fetch(h.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Haiphen-Signature": `sha256=${sig}`,
            "X-Haiphen-Event": event,
            "X-Request-Id": requestId
          },
          body: payloadStr
        });

        await env.DB.prepare(`
          INSERT INTO webhook_deliveries(delivery_id, webhook_id, event, date, request_id, status_code, error)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(delivery_id, h.webhook_id, event, date, requestId, res.status, null).run();

        return { webhook_id: h.webhook_id, status: res.status };
      } catch (e: any) {
        await env.DB.prepare(`
          INSERT INTO webhook_deliveries(delivery_id, webhook_id, event, date, request_id, status_code, error)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(delivery_id, h.webhook_id, event, date, requestId, null, String(e?.message ?? e)).run();

        return { webhook_id: h.webhook_id, error: String(e?.message ?? e) };
      }
    }));

    return okJson({ ok: true, event, date, deliveries }, requestId, corsHeaders(req, env));
  }

  // ---- CONSENT: record cookie consent preference ----
  // POST /v1/consent body: { session_id, essential?, analytics?, marketing? }
  if (req.method === "POST" && url.pathname === "/v1/consent") {
    const body = await req.json().catch(() => null) as null | {
      session_id?: string; essential?: boolean; analytics?: boolean; marketing?: boolean;
    };
    if (!body?.session_id) return err("invalid_request", "session_id required", requestId, 400, corsHeaders(req, env));

    let userLogin: string | null = null;
    try {
      const u = await authCookieUser(req, env, requestId);
      userLogin = u.user_login;
    } catch { /* anonymous is fine */ }

    const ipCountry = req.headers.get("cf-ipcountry") || null;

    await env.DB.prepare(`
      INSERT INTO cookie_consent (user_login, session_id, essential, analytics, marketing, ip_country)
      VALUES (?, ?, 1, ?, ?, ?)
    `).bind(
      userLogin,
      body.session_id,
      body.analytics ? 1 : 0,
      body.marketing ? 1 : 0,
      ipCountry
    ).run();

    return okJson({ ok: true }, requestId, corsHeaders(req, env));
  }

  // GET /v1/consent — retrieve consent preference for current user
  if (req.method === "GET" && url.pathname === "/v1/consent") {
    let userLogin: string | null = null;
    try {
      const u = await authCookieUser(req, env, requestId);
      userLogin = u.user_login;
    } catch { /* anonymous — need session_id from query */ }

    const sessionId = url.searchParams.get("session_id") || null;
    if (!userLogin && !sessionId) return err("invalid_request", "session_id or auth required", requestId, 400, corsHeaders(req, env));

    const where = userLogin ? "user_login = ?" : "session_id = ?";
    const bind = userLogin || sessionId;

    const row = await env.DB.prepare(
      `SELECT essential, analytics, marketing, updated_at FROM cookie_consent WHERE ${where} ORDER BY updated_at DESC LIMIT 1`
    ).bind(bind).first<{ essential: number; analytics: number; marketing: number; updated_at: string }>();

    if (!row) return okJson({ consent: null }, requestId, corsHeaders(req, env));

    return okJson({
      consent: {
        essential: !!row.essential,
        analytics: !!row.analytics,
        marketing: !!row.marketing,
        updated_at: row.updated_at,
      }
    }, requestId, corsHeaders(req, env));
  }

  // ---- CHATBOT: log interaction (analytics, optional) ----
  // POST /v1/chatbot/interaction body: { session_id, prompt_text, target_section?, target_element? }
  if (req.method === "POST" && url.pathname === "/v1/chatbot/interaction") {
    const body = await req.json().catch(() => null) as null | {
      session_id?: string; prompt_text?: string; target_section?: string; target_element?: string;
    };
    if (!body?.session_id || !body?.prompt_text) {
      return err("invalid_request", "session_id and prompt_text required", requestId, 400, corsHeaders(req, env));
    }

    let userLogin: string | null = null;
    try {
      const u = await authCookieUser(req, env, requestId);
      userLogin = u.user_login;
    } catch { /* anonymous is fine */ }

    await env.DB.prepare(`
      INSERT INTO chatbot_interactions (user_login, session_id, prompt_text, target_section, target_element)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      userLogin,
      body.session_id,
      body.prompt_text,
      body.target_section || null,
      body.target_element || null
    ).run();

    return okJson({ ok: true }, requestId, corsHeaders(req, env));
  }

  // ---- INTERNAL: quota consume (called by other workers) ----
  // POST /v1/internal/quota/consume
  if (req.method === "POST" && url.pathname === "/v1/internal/quota/consume") {
    const tok = req.headers.get("X-Internal-Token") || "";
    if (!env.INTERNAL_TOKEN || !safeEqual(tok, env.INTERNAL_TOKEN)) {
      return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));
    }

    const doId = env.QUOTA_DO.idFromName("global");
    const stub = env.QUOTA_DO.get(doId);
    const doRes = await stub.fetch(new Request("https://do/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await req.text(),
    }));

    const data = await doRes.json();
    return okJson(data, requestId, corsHeaders(req, env));
  }

  // ---- quota status (authenticated user) ----
  // GET /v1/quota/status
  if (req.method === "GET" && url.pathname === "/v1/quota/status") {
    const u = await authCookieUser(req, env, requestId);
    const plan = await getPlan(env, u.user_login);

    const doId = env.QUOTA_DO.idFromName("global");
    const stub = env.QUOTA_DO.get(doId);
    const doRes = await stub.fetch(new Request(`https://do/status?user_id=${encodeURIComponent(u.user_login)}&plan=${plan}`, {
      method: "GET",
    }));

    const data = await doRes.json();
    return okJson(data, requestId, corsHeaders(req, env));
  }

  // ---- ADMIN: traffic summary ----
  // GET /v1/traffic/summary
  if (req.method === "GET" && url.pathname === "/v1/traffic/summary") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));

    const doId = env.QUOTA_DO.idFromName("global");
    const stub = env.QUOTA_DO.get(doId);
    const doRes = await stub.fetch(new Request("https://do/summary", { method: "GET" }));

    const data = await doRes.json();
    return okJson(data, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT: list leads ----
  // GET /v1/prospect/leads?status=&source=&severity=&limit=
  if (req.method === "GET" && url.pathname === "/v1/prospect/leads") {
    const u = await authSessionUser(req, env, requestId);

    const clauses: string[] = [];
    const params: unknown[] = [];

    const status = url.searchParams.get("status");
    if (status) { clauses.push("status = ?"); params.push(status); }

    const source = url.searchParams.get("source");
    if (source) { clauses.push("source_id = ?"); params.push(source); }

    const severity = url.searchParams.get("severity");
    if (severity) { clauses.push("severity = ?"); params.push(severity); }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
    params.push(limit);

    const rows = await env.DB.prepare(
      `SELECT lead_id, source_id, entity_type, entity_name, entity_domain,
              industry, country, vulnerability_id, severity, cvss_score,
              summary, services_json, status, created_at, updated_at
       FROM prospect_leads ${where}
       ORDER BY created_at DESC LIMIT ?`
    ).bind(...params).all();

    return okJson({ items: rows.results ?? [] }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT: get lead detail ----
  // GET /v1/prospect/leads/:id
  if (req.method === "GET" && url.pathname.match(/^\/v1\/prospect\/leads\/[^/]+$/)) {
    const u = await authSessionUser(req, env, requestId);
    const leadId = url.pathname.split("/").pop()!;

    const lead = await env.DB.prepare(
      `SELECT * FROM prospect_leads WHERE lead_id = ?`
    ).bind(leadId).first();

    if (!lead) return err("not_found", "Lead not found", requestId, 404, corsHeaders(req, env));

    const analyses = await env.DB.prepare(
      `SELECT * FROM prospect_analyses WHERE lead_id = ? ORDER BY created_at DESC`
    ).bind(leadId).all();

    const outreach = await env.DB.prepare(
      `SELECT * FROM prospect_outreach WHERE lead_id = ? ORDER BY created_at DESC`
    ).bind(leadId).all();

    return okJson({
      ...lead,
      analyses: analyses.results ?? [],
      outreach: outreach.results ?? [],
    }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT: trigger analysis ----
  // POST /v1/prospect/leads/:id/analyze
  if (req.method === "POST" && url.pathname.match(/^\/v1\/prospect\/leads\/[^/]+\/analyze$/)) {
    const u = await authSessionUser(req, env, requestId);
    const parts = url.pathname.split("/");
    const leadId = parts[parts.length - 2];

    const lead = await env.DB.prepare(
      `SELECT * FROM prospect_leads WHERE lead_id = ?`
    ).bind(leadId).first<{
      lead_id: string; services_json: string | null; entity_name: string;
      vulnerability_id: string | null; summary: string;
      severity: string | null; entity_type: string | null;
      source_id: string | null; cvss_score: number | null;
    }>();

    if (!lead) return err("not_found", "Lead not found", requestId, 404, corsHeaders(req, env));

    const body = await req.json().catch(() => ({})) as { service?: string };
    let services: string[];
    let matchedRuleId: string | null = null;

    if (body.service) {
      const valid = ["secure", "network", "graph", "risk", "causal", "supply"];
      if (!valid.includes(body.service)) {
        return err("invalid_request", `Invalid service: ${body.service}`, requestId, 400, corsHeaders(req, env));
      }
      services = [body.service];
    } else {
      // Load enabled rules and match
      const rules = await env.DB.prepare(
        `SELECT * FROM use_case_rules WHERE enabled = 1 ORDER BY priority ASC`
      ).all<{
        rule_id: string; match_severity: string | null; match_entity_type: string | null;
        match_keywords: string | null; match_source_id: string | null; match_cvss_min: number | null;
        services_json: string;
      }>();

      let matched = false;
      for (const rule of rules.results ?? []) {
        if (rule.match_severity && lead.severity !== rule.match_severity) continue;
        if (rule.match_entity_type && lead.entity_type !== rule.match_entity_type) continue;
        if (rule.match_source_id && lead.source_id !== rule.match_source_id) continue;
        if (rule.match_cvss_min && (lead.cvss_score ?? 0) < rule.match_cvss_min) continue;
        if (rule.match_keywords) {
          const kws = rule.match_keywords.split(",").map((k: string) => k.trim().toLowerCase());
          const text = lead.summary.toLowerCase();
          if (!kws.some((kw: string) => text.includes(kw))) continue;
        }
        // Matched!
        services = JSON.parse(rule.services_json);
        matchedRuleId = rule.rule_id;
        matched = true;
        break;
      }

      if (!matched) {
        services = lead.services_json ? JSON.parse(lead.services_json) : ["secure"];
      }
    }

    // Update lead status
    await env.DB.prepare(
      `UPDATE prospect_leads SET status = 'analyzing', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lead_id = ?`
    ).bind(leadId).run();

    // Create analysis records and fan out to services
    const results: Array<{ service: string; analysis_id: string; status: string; score?: number }> = [];

    for (const svc of services) {
      const analysisId = uuid();

      await env.DB.prepare(
        `INSERT INTO prospect_analyses (analysis_id, lead_id, service, status, started_at)
         VALUES (?, ?, ?, 'running', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT (lead_id, service) DO UPDATE SET
           status = 'running',
           started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
      ).bind(analysisId, leadId, svc).run();

      // Fan out to scaffold service (best-effort)
      const serviceOrigins: Record<string, string> = {
        secure: "https://secure.haiphen.io",
        network: "https://network.haiphen.io",
        graph: "https://graph.haiphen.io",
        risk: "https://risk.haiphen.io",
        causal: "https://causal.haiphen.io",
        supply: "https://supply.haiphen.io",
      };

      try {
        const origin = serviceOrigins[svc];
        if (origin && env.INTERNAL_TOKEN) {
          const svcRes = await fetch(`${origin}/v1/${svc}/prospect-analyze`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Token": env.INTERNAL_TOKEN,
            },
            body: JSON.stringify({
              lead_id: leadId,
              entity_name: lead.entity_name,
              vulnerability_id: lead.vulnerability_id,
              summary: lead.summary,
              cvss_score: lead.cvss_score,
            }),
          });

          const svcData = await svcRes.json().catch(() => null) as any;

          await env.DB.prepare(
            `UPDATE prospect_analyses
             SET status = 'completed',
                 result_json = ?,
                 score = ?,
                 completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE lead_id = ? AND service = ?`
          ).bind(
            JSON.stringify(svcData),
            svcData?.score ?? null,
            leadId,
            svc,
          ).run();

          results.push({ service: svc, analysis_id: analysisId, status: "completed", score: svcData?.score });
        } else {
          results.push({ service: svc, analysis_id: analysisId, status: "running" });
        }
      } catch (e: any) {
        await env.DB.prepare(
          `UPDATE prospect_analyses SET status = 'failed' WHERE lead_id = ? AND service = ?`
        ).bind(leadId, svc).run();

        results.push({ service: svc, analysis_id: analysisId, status: "failed" });
      }
    }

    // Update lead status to analyzed if all done
    const pending = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM prospect_analyses WHERE lead_id = ? AND status IN ('pending','running')`
    ).bind(leadId).first<{ cnt: number }>();

    if (!pending?.cnt) {
      await env.DB.prepare(
        `UPDATE prospect_leads SET status = 'analyzed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lead_id = ?`
      ).bind(leadId).run();
    }

    return okJson({ ok: true, lead_id: leadId, matched_rule_id: matchedRuleId, analyses: results }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT: draft outreach ----
  // POST /v1/prospect/leads/:id/outreach
  if (req.method === "POST" && url.pathname.match(/^\/v1\/prospect\/leads\/[^/]+\/outreach$/)) {
    const u = await authSessionUser(req, env, requestId);
    const parts = url.pathname.split("/");
    const leadId = parts[parts.length - 2];

    const lead = await env.DB.prepare(
      `SELECT * FROM prospect_leads WHERE lead_id = ?`
    ).bind(leadId).first<{
      lead_id: string; entity_name: string; entity_domain: string | null;
      vulnerability_id: string | null; severity: string | null; summary: string;
      services_json: string | null; entity_type: string | null;
      source_id: string | null; cvss_score: number | null;
    }>();

    if (!lead) return err("not_found", "Lead not found", requestId, 404, corsHeaders(req, env));

    // Get analyses for context
    const analyses = await env.DB.prepare(
      `SELECT service, score, result_json FROM prospect_analyses WHERE lead_id = ? AND status = 'completed'`
    ).bind(leadId).all<{ service: string; score: number | null; result_json: string | null }>();

    const analysisContext = (analyses.results ?? [])
      .map(a => `${a.service}: score ${a.score ?? "N/A"}`)
      .join(", ");

    // Try to find a matching rule for template-based composition
    let bodyText: string;
    const rules = await env.DB.prepare(
      `SELECT * FROM use_case_rules WHERE enabled = 1 ORDER BY priority ASC`
    ).all<{
      rule_id: string; match_severity: string | null; match_entity_type: string | null;
      match_keywords: string | null; match_source_id: string | null; match_cvss_min: number | null;
      services_json: string; solution_template: string;
    }>();

    let matchedTemplate: string | null = null;
    for (const rule of rules.results ?? []) {
      if (rule.match_severity && lead.severity !== rule.match_severity) continue;
      if (rule.match_entity_type && lead.entity_type !== rule.match_entity_type) continue;
      if (rule.match_source_id && lead.source_id !== rule.match_source_id) continue;
      if (rule.match_cvss_min && (lead.cvss_score ?? 0) < rule.match_cvss_min) continue;
      if (rule.match_keywords) {
        const kws = rule.match_keywords.split(",").map((k: string) => k.trim().toLowerCase());
        const text = lead.summary.toLowerCase();
        if (!kws.some((kw: string) => text.includes(kw))) continue;
      }
      matchedTemplate = rule.solution_template;
      break;
    }

    if (matchedTemplate) {
      // Interpolate template variables
      const svcList = (analyses.results ?? []).map(a => a.service).join(", ") || "pending";
      bodyText = matchedTemplate
        .replace(/\{\{entity_name\}\}/g, lead.entity_name)
        .replace(/\{\{vulnerability_id\}\}/g, lead.vulnerability_id ?? "Identified exposure")
        .replace(/\{\{severity\}\}/g, lead.severity ?? "Unknown")
        .replace(/\{\{services\}\}/g, svcList)
        .replace(/\{\{analysis_summary\}\}/g, analysisContext ? `Analysis Results: ${analysisContext}` : "Analysis pending.");
      bodyText = `Dear Security Team,\n\n${bodyText}\n\nBest regards,\nHaiphen Security Intelligence`;
    } else {
      // Fallback to original boilerplate
      bodyText = [
        `Dear Security Team,`,
        ``,
        `We are writing to inform you of a potential security concern affecting ${lead.entity_name}.`,
        ``,
        `Vulnerability: ${lead.vulnerability_id ?? "Identified exposure"}`,
        `Severity: ${lead.severity ?? "Unknown"}`,
        `Summary: ${lead.summary}`,
        ``,
        analysisContext ? `Analysis Results: ${analysisContext}` : "",
        ``,
        `We discovered this through our automated security monitoring platform (Haiphen)`,
        `and are reaching out as part of responsible disclosure.`,
        ``,
        `We would be happy to provide additional technical details or assist with remediation.`,
        ``,
        `Best regards,`,
        `Haiphen Security Research`,
      ].filter(l => l !== undefined).join("\n");
    }

    const outreachId = uuid();
    const subject = `Security Advisory: ${lead.vulnerability_id ?? "Potential Vulnerability"} — ${lead.entity_name}`;

    await env.DB.prepare(
      `INSERT INTO prospect_outreach (outreach_id, lead_id, subject, body_text, status)
       VALUES (?, ?, ?, ?, 'draft')`
    ).bind(outreachId, leadId, subject, bodyText).run();

    // Update lead status
    await env.DB.prepare(
      `UPDATE prospect_leads SET status = 'outreach_drafted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lead_id = ?`
    ).bind(leadId).run();

    return okJson({
      ok: true,
      outreach_id: outreachId,
      lead_id: leadId,
      subject,
      body_text: bodyText,
      status: "draft",
      template_matched: !!matchedTemplate,
    }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT: list sources ----
  // GET /v1/prospect/sources
  if (req.method === "GET" && url.pathname === "/v1/prospect/sources") {
    const u = await authSessionUser(req, env, requestId);

    const rows = await env.DB.prepare(
      `SELECT source_id, name, api_base_url, rate_limit_rpm, last_crawled_at, enabled, created_at
       FROM prospect_sources ORDER BY source_id`
    ).all();

    return okJson({ items: rows.results ?? [] }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT CREDENTIALS: upsert ----
  // PUT /v1/prospect/credentials/:provider
  if (req.method === "PUT" && url.pathname.match(/^\/v1\/prospect\/credentials\/(nvd|github|shodan)$/)) {
    const u = await authSessionUser(req, env, requestId);
    const provider = url.pathname.split("/").pop()!;

    const body = await req.json().catch(() => null) as null | { api_key?: string; label?: string };
    if (!body?.api_key || typeof body.api_key !== "string" || body.api_key.length < 1) {
      return err("invalid_request", "api_key is required", requestId, 400, corsHeaders(req, env));
    }
    if (body.api_key.length > 512) {
      return err("invalid_request", "api_key too long", requestId, 400, corsHeaders(req, env));
    }

    const masterKey = await importMasterKey(env.CREDENTIAL_KEY);
    const encrypted = await encryptCredential(masterKey, body.api_key);

    await env.DB.prepare(`
      INSERT INTO prospect_credentials (user_id, provider, encrypted_key, label)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, provider) DO UPDATE SET
        encrypted_key = excluded.encrypted_key,
        label = COALESCE(excluded.label, prospect_credentials.label),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).bind(u.user_login, provider, encrypted, body.label ?? null).run();

    return okJson({ ok: true, provider, label: body.label ?? null }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT CREDENTIALS: list ----
  // GET /v1/prospect/credentials
  if (req.method === "GET" && url.pathname === "/v1/prospect/credentials") {
    const u = await authSessionUser(req, env, requestId);

    const rows = await env.DB.prepare(
      `SELECT provider, label, updated_at FROM prospect_credentials WHERE user_id = ? ORDER BY provider`
    ).bind(u.user_login).all<{ provider: string; label: string | null; updated_at: string }>();

    return okJson({ items: rows.results ?? [] }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT CREDENTIALS: delete ----
  // DELETE /v1/prospect/credentials/:provider
  if (req.method === "DELETE" && url.pathname.match(/^\/v1\/prospect\/credentials\/(nvd|github|shodan)$/)) {
    const u = await authSessionUser(req, env, requestId);
    const provider = url.pathname.split("/").pop()!;

    const result = await env.DB.prepare(
      `DELETE FROM prospect_credentials WHERE user_id = ? AND provider = ?`
    ).bind(u.user_login, provider).run();

    if (!result.meta.changes) {
      return err("not_found", "Credential not found", requestId, 404, corsHeaders(req, env));
    }

    return okJson({ ok: true, provider }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT CREDENTIALS: decrypt (internal) ----
  // POST /v1/prospect/credentials/:provider/decrypt
  if (req.method === "POST" && url.pathname.match(/^\/v1\/prospect\/credentials\/(nvd|github|shodan)\/decrypt$/)) {
    const tok = req.headers.get("X-Internal-Token") || "";
    if (!env.INTERNAL_TOKEN || !safeEqual(tok, env.INTERNAL_TOKEN)) {
      return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));
    }

    const parts = url.pathname.split("/");
    const provider = parts[parts.length - 2];

    const body = await req.json().catch(() => null) as null | { user_id?: string };
    if (!body?.user_id) return err("invalid_request", "user_id required", requestId, 400, corsHeaders(req, env));

    const row = await env.DB.prepare(
      `SELECT encrypted_key FROM prospect_credentials WHERE user_id = ? AND provider = ?`
    ).bind(body.user_id, provider).first<{ encrypted_key: string }>();

    if (!row) return err("not_found", "Credential not found", requestId, 404, corsHeaders(req, env));

    const masterKey = await importMasterKey(env.CREDENTIAL_KEY);
    const apiKey = await decryptCredential(masterKey, row.encrypted_key);

    return okJson({ ok: true, provider, api_key: apiKey }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT: trigger crawl (admin) ----
  // POST /v1/prospect/crawl
  if (req.method === "POST" && url.pathname === "/v1/prospect/crawl") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));

    // Trigger Cloud Run Job via REST API
    // In production this would use GCP auth; for now return acknowledgement
    return okJson({
      ok: true,
      message: "Crawl job trigger acknowledged. Use `gcloud run jobs execute haiphen-prospect-crawler` to run manually.",
    }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT RULES: list ----
  // GET /v1/prospect/rules
  if (req.method === "GET" && url.pathname === "/v1/prospect/rules") {
    const u = await authSessionUser(req, env, requestId);

    const rows = await env.DB.prepare(
      `SELECT rule_id, name, description, match_severity, match_entity_type,
              match_keywords, match_source_id, match_cvss_min, services_json,
              solution_template, priority, enabled, created_at, updated_at
       FROM use_case_rules ORDER BY priority ASC`
    ).all();

    return okJson({ items: rows.results ?? [] }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT RULES: create ----
  // POST /v1/prospect/rules
  if (req.method === "POST" && url.pathname === "/v1/prospect/rules") {
    const u = await authSessionUser(req, env, requestId);

    const body = await req.json().catch(() => null) as null | {
      name?: string; description?: string;
      match_severity?: string; match_entity_type?: string;
      match_keywords?: string; match_source_id?: string; match_cvss_min?: number;
      services_json?: string; solution_template?: string; priority?: number;
    };
    if (!body?.name || !body?.services_json || !body?.solution_template) {
      return err("invalid_request", "name, services_json, and solution_template are required", requestId, 400, corsHeaders(req, env));
    }

    const ruleId = uuid();
    await env.DB.prepare(
      `INSERT INTO use_case_rules (rule_id, name, description, match_severity, match_entity_type,
        match_keywords, match_source_id, match_cvss_min, services_json, solution_template, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      ruleId, body.name, body.description ?? null,
      body.match_severity ?? null, body.match_entity_type ?? null,
      body.match_keywords ?? null, body.match_source_id ?? null, body.match_cvss_min ?? null,
      body.services_json, body.solution_template, body.priority ?? 100,
    ).run();

    return okJson({ ok: true, rule_id: ruleId }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT RULES: update ----
  // PUT /v1/prospect/rules/:id
  if (req.method === "PUT" && url.pathname.match(/^\/v1\/prospect\/rules\/[^/]+$/)) {
    const u = await authSessionUser(req, env, requestId);
    const ruleId = url.pathname.split("/").pop()!;

    const body = await req.json().catch(() => null) as null | Record<string, unknown>;
    if (!body) return err("invalid_request", "Invalid JSON body", requestId, 400, corsHeaders(req, env));

    const sets: string[] = [];
    const params: unknown[] = [];
    const allowed = ["name", "description", "match_severity", "match_entity_type",
      "match_keywords", "match_source_id", "match_cvss_min", "services_json",
      "solution_template", "priority", "enabled"];

    for (const key of allowed) {
      if (key in body) {
        sets.push(`${key} = ?`);
        params.push(body[key] ?? null);
      }
    }
    if (sets.length === 0) return err("invalid_request", "No valid fields to update", requestId, 400, corsHeaders(req, env));

    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    params.push(ruleId);

    const result = await env.DB.prepare(
      `UPDATE use_case_rules SET ${sets.join(", ")} WHERE rule_id = ?`
    ).bind(...params).run();

    if (!result.meta.changes) return err("not_found", "Rule not found", requestId, 404, corsHeaders(req, env));
    return okJson({ ok: true, rule_id: ruleId }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT RULES: delete ----
  // DELETE /v1/prospect/rules/:id
  if (req.method === "DELETE" && url.pathname.match(/^\/v1\/prospect\/rules\/[^/]+$/)) {
    const u = await authSessionUser(req, env, requestId);
    const ruleId = url.pathname.split("/").pop()!;

    const result = await env.DB.prepare(
      `DELETE FROM use_case_rules WHERE rule_id = ?`
    ).bind(ruleId).run();

    if (!result.meta.changes) return err("not_found", "Rule not found", requestId, 404, corsHeaders(req, env));
    return okJson({ ok: true, rule_id: ruleId }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT REGRESSIONS: query ----
  // GET /v1/prospect/regressions
  if (req.method === "GET" && url.pathname === "/v1/prospect/regressions") {
    const u = await authSessionUser(req, env, requestId);

    const dimension = url.searchParams.get("dimension");
    const minCount = Math.max(1, Number(url.searchParams.get("min_count") ?? "2"));
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));

    const clauses: string[] = ["occurrence_count >= ?"];
    const params: unknown[] = [minCount];
    if (dimension) { clauses.push("dimension = ?"); params.push(dimension); }
    params.push(limit);

    const rows = await env.DB.prepare(
      `SELECT regression_id, dimension, key, occurrence_count, first_seen_at,
              last_seen_at, lead_ids_json, severity_trend, updated_at
       FROM prospect_regressions
       WHERE ${clauses.join(" AND ")}
       ORDER BY occurrence_count DESC LIMIT ?`
    ).bind(...params).all();

    return okJson({ items: rows.results ?? [] }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT REGRESSIONS: detect (internal/admin) ----
  // POST /v1/prospect/regressions/detect
  if (req.method === "POST" && url.pathname === "/v1/prospect/regressions/detect") {
    const tok = req.headers.get("X-Internal-Token") || "";
    const adminTok = req.headers.get("X-Admin-Token") || "";
    const authed = (env.INTERNAL_TOKEN && safeEqual(tok, env.INTERNAL_TOKEN))
      || safeEqual(adminTok, env.ADMIN_TOKEN);
    if (!authed) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));

    // Entity dimension: group leads by entity_name
    const entities = await env.DB.prepare(`
      SELECT entity_name as key, COUNT(*) as cnt,
             MIN(created_at) as first_seen, MAX(created_at) as last_seen,
             json_group_array(lead_id) as lead_ids
      FROM prospect_leads
      WHERE status != 'archived'
      GROUP BY entity_name HAVING cnt >= 2
    `).all<{ key: string; cnt: number; first_seen: string; last_seen: string; lead_ids: string }>();

    // Vuln class dimension
    const vulnClasses = await env.DB.prepare(`
      SELECT CASE
        WHEN summary LIKE '%trading%' OR summary LIKE '%order%' OR summary LIKE '%execution%' OR summary LIKE '%FIX%' THEN 'trade-execution'
        WHEN summary LIKE '%settlement%' OR summary LIKE '%clearing%' OR summary LIKE '%reconcil%' THEN 'settlement-clearing'
        WHEN summary LIKE '%market data%' OR summary LIKE '%price%' OR summary LIKE '%feed%' OR summary LIKE '%quote%' THEN 'market-data-integrity'
        WHEN summary LIKE '%broker%' OR summary LIKE '%custod%' OR summary LIKE '%portfolio%' THEN 'brokerage-platform'
        WHEN summary LIKE '%payment%' OR summary LIKE '%ledger%' OR summary LIKE '%ACH%' OR summary LIKE '%SWIFT%' THEN 'payment-ledger'
        WHEN summary LIKE '%API%' OR summary LIKE '%gateway%' OR summary LIKE '%webhook%' THEN 'api-infrastructure'
        WHEN summary LIKE '%KYC%' OR summary LIKE '%AML%' OR summary LIKE '%compliance%' OR summary LIKE '%audit%' THEN 'regulatory-compliance'
        WHEN summary LIKE '%vendor%' OR summary LIKE '%supply chain%' OR summary LIKE '%third-party%' THEN 'counterparty-vendor'
        WHEN summary LIKE '%authentication%' OR summary LIKE '%credential%' OR summary LIKE '%OAuth%' THEN 'auth-access'
        ELSE 'general-infrastructure'
      END as key,
      COUNT(*) as cnt,
      MIN(created_at) as first_seen, MAX(created_at) as last_seen,
      json_group_array(lead_id) as lead_ids
      FROM prospect_leads
      WHERE status != 'archived'
      GROUP BY key HAVING cnt >= 3
    `).all<{ key: string; cnt: number; first_seen: string; last_seen: string; lead_ids: string }>();

    // Upsert entity regressions
    let entityCount = 0;
    for (const row of entities.results ?? []) {
      await env.DB.prepare(`
        INSERT INTO prospect_regressions (regression_id, dimension, key, occurrence_count, first_seen_at, last_seen_at, lead_ids_json)
        VALUES (?, 'entity', ?, ?, ?, ?, ?)
        ON CONFLICT (dimension, key) DO UPDATE SET
          occurrence_count = excluded.occurrence_count,
          last_seen_at = excluded.last_seen_at,
          lead_ids_json = excluded.lead_ids_json,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      `).bind(uuid(), row.key, row.cnt, row.first_seen, row.last_seen, row.lead_ids).run();
      entityCount++;
    }

    // Upsert vuln_class regressions
    let vulnCount = 0;
    for (const row of vulnClasses.results ?? []) {
      await env.DB.prepare(`
        INSERT INTO prospect_regressions (regression_id, dimension, key, occurrence_count, first_seen_at, last_seen_at, lead_ids_json)
        VALUES (?, 'vuln_class', ?, ?, ?, ?, ?)
        ON CONFLICT (dimension, key) DO UPDATE SET
          occurrence_count = excluded.occurrence_count,
          last_seen_at = excluded.last_seen_at,
          lead_ids_json = excluded.lead_ids_json,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      `).bind(uuid(), row.key, row.cnt, row.first_seen, row.last_seen, row.lead_ids).run();
      vulnCount++;
    }

    return okJson({ ok: true, entity_regressions: entityCount, vuln_class_regressions: vulnCount }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT OUTREACH: approve ----
  // POST /v1/prospect/leads/:id/outreach/approve
  if (req.method === "POST" && url.pathname.match(/^\/v1\/prospect\/leads\/[^/]+\/outreach\/approve$/)) {
    const u = await authSessionUser(req, env, requestId);
    const parts = url.pathname.split("/");
    const leadId = parts[parts.length - 3];

    const outreach = await env.DB.prepare(
      `SELECT outreach_id, status FROM prospect_outreach WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1`
    ).bind(leadId).first<{ outreach_id: string; status: string }>();

    if (!outreach) return err("not_found", "No outreach found for this lead", requestId, 404, corsHeaders(req, env));
    if (outreach.status !== "draft") return err("invalid_request", `Outreach is ${outreach.status}, not draft`, requestId, 400, corsHeaders(req, env));

    await env.DB.prepare(
      `UPDATE prospect_outreach SET status = 'approved' WHERE outreach_id = ?`
    ).bind(outreach.outreach_id).run();

    return okJson({ ok: true, outreach_id: outreach.outreach_id, status: "approved" }, requestId, corsHeaders(req, env));
  }

  // ---- PROSPECT OUTREACH: send ----
  // POST /v1/prospect/leads/:id/outreach/send
  if (req.method === "POST" && url.pathname.match(/^\/v1\/prospect\/leads\/[^/]+\/outreach\/send$/)) {
    const u = await authSessionUser(req, env, requestId);
    const parts = url.pathname.split("/");
    const leadId = parts[parts.length - 3];

    const outreach = await env.DB.prepare(
      `SELECT outreach_id, subject, body_text, status FROM prospect_outreach WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1`
    ).bind(leadId).first<{ outreach_id: string; subject: string; body_text: string; status: string }>();

    if (!outreach) return err("not_found", "No outreach found for this lead", requestId, 404, corsHeaders(req, env));
    if (outreach.status !== "approved") return err("invalid_request", `Outreach must be approved before sending (current: ${outreach.status})`, requestId, 400, corsHeaders(req, env));

    const lead = await env.DB.prepare(
      `SELECT entity_name, entity_domain FROM prospect_leads WHERE lead_id = ?`
    ).bind(leadId).first<{ entity_name: string; entity_domain: string | null }>();

    const body = await req.json().catch(() => ({})) as { recipient_email?: string; recipient_name?: string };
    const recipientEmail = body.recipient_email || (lead?.entity_domain ? `security@${lead.entity_domain}` : null);
    if (!recipientEmail) return err("invalid_request", "recipient_email required (no domain to derive from)", requestId, 400, corsHeaders(req, env));
    const recipientName = body.recipient_name || lead?.entity_name || "Security Team";

    // HMAC-sign and send to haiphen-contact
    const messageId = uuid();
    const payload = JSON.stringify({
      outreach_id: outreach.outreach_id,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      subject: outreach.subject,
      body_text: outreach.body_text,
    });

    const ts = String(Date.now());
    const sig = await hmacSha256Hex(env.INTERNAL_TOKEN, `${ts}.${payload}`);

    try {
      const contactRes = await fetch("https://contact.haiphen.io/api/prospect/outreach/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-haiphen-ts": ts,
          "x-haiphen-sig": sig,
        },
        body: payload,
      });

      const contactData = await contactRes.json().catch(() => ({})) as { ok?: boolean; messageId?: string };

      // Record delivery
      await env.DB.prepare(
        `INSERT INTO prospect_outreach_messages (message_id, outreach_id, sendgrid_msg_id, status, sent_at)
         VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
      ).bind(messageId, outreach.outreach_id, contactData.messageId ?? null, contactRes.ok ? "sent" : "failed").run();

      if (contactRes.ok) {
        // Update outreach and lead status
        await env.DB.prepare(
          `UPDATE prospect_outreach SET status = 'sent', sent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE outreach_id = ?`
        ).bind(outreach.outreach_id).run();
        await env.DB.prepare(
          `UPDATE prospect_leads SET status = 'contacted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lead_id = ?`
        ).bind(leadId).run();
      }

      return okJson({
        ok: contactRes.ok,
        message_id: messageId,
        outreach_id: outreach.outreach_id,
        recipient_email: recipientEmail,
        status: contactRes.ok ? "sent" : "failed",
      }, requestId, corsHeaders(req, env));
    } catch (e: any) {
      await env.DB.prepare(
        `INSERT INTO prospect_outreach_messages (message_id, outreach_id, status, error_detail)
         VALUES (?, ?, 'failed', ?)`
      ).bind(messageId, outreach.outreach_id, String(e.message ?? e)).run();

      return err("internal", "Failed to send outreach email", requestId, 500, corsHeaders(req, env));
    }
  }

  // ==============================================================
  // INVESTIGATION ENGINE — Closed-loop Detect → Analyze → Solve → Confirm
  // ==============================================================

  const SERVICE_PIPELINE = ["secure", "network", "causal", "risk", "graph", "supply"] as const;
  const SERVICE_WEIGHTS: Record<string, number> = {
    secure: 0.20, network: 0.15, causal: 0.20, risk: 0.20, graph: 0.10, supply: 0.15,
  };
  const SERVICE_ORIGINS: Record<string, string> = {
    secure: "https://secure.haiphen.io",
    network: "https://network.haiphen.io",
    graph: "https://graph.haiphen.io",
    risk: "https://risk.haiphen.io",
    causal: "https://causal.haiphen.io",
    supply: "https://supply.haiphen.io",
  };

  // ---- Helper: check budget via watchdog status ----
  async function checkBudget(): Promise<{ allowed: boolean; level: string; detail?: string }> {
    try {
      let cached = await env.CACHE_KV.get("watchdog:status");
      if (!cached) {
        const wdAc = new AbortController();
        const wdTimer = setTimeout(() => wdAc.abort(), 5000);
        const res = await fetch("https://watchdog.haiphen.io/v1/watchdog/status", {
          signal: wdAc.signal,
          headers: env.INTERNAL_TOKEN ? { "X-Internal-Token": env.INTERNAL_TOKEN } : {},
        });
        clearTimeout(wdTimer);
        if (res.ok) {
          cached = await res.text();
          await env.CACHE_KV.put("watchdog:status", cached, { expirationTtl: 300 });
        }
      }
      if (cached) {
        const wd = JSON.parse(cached);
        const resources = wd.resources || wd.usage || {};
        const maxPct = Math.max(...Object.values(resources).map((v: any) => typeof v === "number" ? v : (v?.pct ?? 0)));
        if (maxPct >= 80) return { allowed: false, level: "exceeded", detail: `Resource usage at ${maxPct}%` };
        if (maxPct >= 60) return { allowed: true, level: "constrained" };
      }
    } catch { /* fail-open: allow investigation */ }
    return { allowed: true, level: "normal" };
  }

  // ---- Helper: run sequential pipeline ----
  async function runPipeline(
    investigationId: string,
    lead: { lead_id: string; entity_name: string; vulnerability_id: string | null; summary: string; cvss_score: number | null; source_id: string | null },
  ): Promise<{ steps: Array<{ service: string; step_id: string; score: number | null; findings: string[]; recommendation: string | null; duration_ms: number; status: string }>; aggregateScore: number }> {
    const upstreamContext: { prior_scores: Record<string, number>; prior_findings: string[]; investigation_id: string } = {
      prior_scores: {},
      prior_findings: [],
      investigation_id: investigationId,
    };

    const steps: Array<{ service: string; step_id: string; score: number | null; findings: string[]; recommendation: string | null; duration_ms: number; status: string }> = [];

    for (let i = 0; i < SERVICE_PIPELINE.length; i++) {
      const svc = SERVICE_PIPELINE[i];
      const stepId = uuid();

      await env.DB.prepare(
        `INSERT INTO investigation_steps (step_id, investigation_id, service, step_order, status, input_context_json)
         VALUES (?, ?, ?, ?, 'running', ?)`
      ).bind(stepId, investigationId, svc, i, JSON.stringify(upstreamContext)).run();

      const t0 = Date.now();
      try {
        const origin = SERVICE_ORIGINS[svc];
        if (!origin || !env.INTERNAL_TOKEN) throw new Error("Service not configured");

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 10000);
        const svcRes = await fetch(`${origin}/v1/${svc}/prospect-analyze`, {
          method: "POST",
          signal: ac.signal,
          headers: { "Content-Type": "application/json", "X-Internal-Token": env.INTERNAL_TOKEN },
          body: JSON.stringify({
            lead_id: lead.lead_id,
            entity_name: lead.entity_name,
            vulnerability_id: lead.vulnerability_id,
            summary: lead.summary,
            cvss_score: lead.cvss_score,
            upstream_context: upstreamContext,
          }),
        });
        clearTimeout(timer);

        const svcData = await svcRes.json().catch(() => null) as any;
        const durationMs = Date.now() - t0;
        const score: number | null = svcData?.score ?? null;
        const findings: string[] = Array.isArray(svcData?.findings) ? svcData.findings : [];
        const recommendation: string | null = svcData?.recommendation ?? null;

        await env.DB.prepare(
          `UPDATE investigation_steps SET status = 'completed', score = ?, findings_json = ?, recommendation = ?, duration_ms = ? WHERE step_id = ?`
        ).bind(score, JSON.stringify(findings), recommendation, durationMs, stepId).run();

        // Update upstream context for next service
        if (score !== null) upstreamContext.prior_scores[svc] = score;
        upstreamContext.prior_findings.push(...findings);

        steps.push({ service: svc, step_id: stepId, score, findings, recommendation, duration_ms: durationMs, status: "completed" });
      } catch (e: any) {
        const durationMs = Date.now() - t0;
        await env.DB.prepare(
          `UPDATE investigation_steps SET status = 'failed', duration_ms = ? WHERE step_id = ?`
        ).bind(durationMs, stepId).run();
        steps.push({ service: svc, step_id: stepId, score: null, findings: [], recommendation: null, duration_ms: durationMs, status: "failed" });
      }
    }

    // Compute weighted aggregate, redistributing weights for failed steps
    let totalWeight = 0;
    let weightedSum = 0;
    for (const step of steps) {
      if (step.status === "completed" && step.score !== null) {
        const w = SERVICE_WEIGHTS[step.service] ?? 0;
        totalWeight += w;
        weightedSum += step.score * w;
      }
    }
    const aggregateScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;

    return { steps, aggregateScore };
  }

  // ---- Helper: derive requirements ----
  function deriveRequirements(
    steps: Array<{ service: string; score: number | null; findings: string[] }>,
    lead: { entity_name: string; source_id: string | null },
  ): Array<{ category: string; description: string }> {
    const reqs: Array<{ category: string; description: string }> = [];
    const scores: Record<string, { score: number | null; findings: string[] }> = {};
    for (const s of steps) scores[s.service] = s;

    if ((scores.secure?.score ?? 0) > 50) {
      reqs.push({ category: "data_gap", description: `Entity "${lead.entity_name}" scored high on security scan — ensure crawler tracks this entity` });
    }
    if ((scores.causal?.score ?? 0) > 40 && (scores.graph?.score ?? 0) < 20) {
      reqs.push({ category: "capability_gap", description: "Cascade risk detected but no entity relationship data — need vendor/counterparty mapping" });
    }
    if ((scores.risk?.score ?? 0) > 60) {
      reqs.push({ category: "monitor_needed", description: `High risk score (${scores.risk!.score}) — add continuous monitoring for ${lead.entity_name}` });
    }
    if (scores.supply?.findings?.some(f => f.toLowerCase().includes("dependency")) && lead.source_id !== "shodan") {
      reqs.push({ category: "integration_needed", description: "Deep supply chain exposure — Shodan reconnaissance recommended for network surface" });
    }
    if ((scores.network?.score ?? 0) > 50 && (scores.secure?.score ?? 0) < 30) {
      reqs.push({ category: "data_gap", description: "Network protocol exposure without matching CVE data — expand vulnerability keyword scope" });
    }
    if ((scores.risk?.score ?? 0) > 50 && (scores.causal?.score ?? 0) < 20) {
      reqs.push({ category: "capability_gap", description: "High business risk without cascade mapping — causal chain analysis needed" });
    }
    if ((scores.secure?.score ?? 0) > 60 && (scores.supply?.score ?? 0) < 25) {
      reqs.push({ category: "data_gap", description: "Security vulnerability confirmed but no supply chain context — vendor mapping needed" });
    }
    if ((scores.graph?.score ?? 0) > 50 && (scores.supply?.score ?? 0) > 50) {
      reqs.push({ category: "monitor_needed", description: "Both graph and supply chain show elevated risk — set up cross-entity monitoring" });
    }

    return reqs;
  }

  // ---- Helper: Claude API synthesis ----
  async function callClaudeForSynthesis(
    lead: { entity_name: string; vulnerability_id: string | null; summary: string; cvss_score: number | null },
    steps: Array<{ service: string; score: number | null; findings: string[] }>,
  ): Promise<{ summary: string; impact: string; recommendations: string[] } | null> {
    if (!env.ANTHROPIC_API_KEY) return null;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: `You are a fintech security analyst. Synthesize this investigation for ${lead.entity_name} (${lead.vulnerability_id ?? "no CVE"}).
Summary: ${lead.summary}
CVSS: ${lead.cvss_score ?? "N/A"}
Service results:
${steps.filter(s => s.score !== null).map(s => `${s.service}(score ${s.score}): ${s.findings.join("; ")}`).join("\n")}

Return ONLY valid JSON: {"summary":"...","impact":"...","recommendations":["..."]}`
          }],
        }),
      });

      // Increment daily counter
      const dateKey = `claude:calls:${new Date().toISOString().split("T")[0]}`;
      const current = parseInt(await env.CACHE_KV.get(dateKey) ?? "0");
      await env.CACHE_KV.put(dateKey, String(current + 1), { expirationTtl: 86400 });

      if (!response.ok) return null;
      const data = await response.json() as any;
      const text = data?.content?.[0]?.text ?? "";
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // ---- POST /v1/prospect/leads/:id/investigate ----
  if (req.method === "POST" && url.pathname.match(/^\/v1\/prospect\/leads\/[^/]+\/investigate$/)) {
    const u = await authSessionUser(req, env, requestId);
    const parts = url.pathname.split("/");
    const leadId = parts[parts.length - 2];

    const lead = await env.DB.prepare(
      `SELECT lead_id, entity_name, vulnerability_id, summary, cvss_score, source_id, severity, entity_type, services_json FROM prospect_leads WHERE lead_id = ?`
    ).bind(leadId).first<{
      lead_id: string; entity_name: string; vulnerability_id: string | null;
      summary: string; cvss_score: number | null; source_id: string | null;
      severity: string | null; entity_type: string | null; services_json: string | null;
    }>();
    if (!lead) return err("not_found", "Lead not found", requestId, 404, corsHeaders(req, env));

    // Budget gate
    const budget = await checkBudget();
    if (!budget.allowed) {
      return err("rate_limited", `Budget exceeded — investigation deferred. ${budget.detail ?? ""}`, requestId, 503, corsHeaders(req, env));
    }

    const investigationId = uuid();
    const startedAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO investigations (investigation_id, lead_id, user_id, status, budget_level, started_at)
       VALUES (?, ?, ?, 'running', ?, ?)`
    ).bind(investigationId, leadId, u.user_login, budget.level, startedAt).run();

    await env.DB.prepare(
      `UPDATE prospect_leads SET investigation_status = 'investigating', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lead_id = ?`
    ).bind(leadId).run();

    // Run sequential pipeline
    const { steps, aggregateScore } = await runPipeline(investigationId, lead);

    // Claude API triple-gate
    let claudeSummary: { summary: string; impact: string; recommendations: string[] } | null = null;
    let claudeUsed = 0;
    const maxStepScore = Math.max(...steps.filter(s => s.score !== null).map(s => s.score!), 0);
    const gate1 = aggregateScore >= 60 || maxStepScore >= 80;
    const gate2 = budget.level === "normal";
    const dateKey = `claude:calls:${new Date().toISOString().split("T")[0]}`;
    const dailyCalls = parseInt(await env.CACHE_KV.get(dateKey) ?? "0");
    const gate3 = dailyCalls < 50;

    if (gate1 && gate2 && gate3) {
      claudeSummary = await callClaudeForSynthesis(lead, steps);
      if (claudeSummary) claudeUsed = 1;
    }

    // Derive requirements
    const requirements = deriveRequirements(steps, lead);
    for (const rq of requirements) {
      await env.DB.prepare(
        `INSERT INTO investigation_requirements (requirement_id, investigation_id, category, description)
         VALUES (?, ?, ?, ?)`
      ).bind(uuid(), investigationId, rq.category, rq.description).run();
    }

    const completedAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE investigations SET status = 'completed', aggregate_score = ?, risk_score_before = ?,
       claude_used = ?, claude_summary = ?, requirements_json = ?, completed_at = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE investigation_id = ?`
    ).bind(
      aggregateScore, aggregateScore, claudeUsed,
      claudeSummary ? JSON.stringify(claudeSummary) : null,
      JSON.stringify(requirements), completedAt, investigationId,
    ).run();

    await env.DB.prepare(
      `UPDATE prospect_leads SET investigation_status = 'investigated', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lead_id = ?`
    ).bind(leadId).run();

    return okJson({
      investigation_id: investigationId,
      lead_id: leadId,
      status: "completed",
      aggregate_score: aggregateScore,
      budget_level: budget.level,
      claude_used: claudeUsed,
      claude_summary: claudeSummary,
      steps: steps.map(s => ({ service: s.service, score: s.score, findings: s.findings, recommendation: s.recommendation, duration_ms: s.duration_ms, status: s.status })),
      requirements,
      started_at: startedAt,
      completed_at: completedAt,
    }, requestId, corsHeaders(req, env));
  }

  // ---- POST /v1/prospect/investigations/:id/solve ----
  if (req.method === "POST" && url.pathname.match(/^\/v1\/prospect\/investigations\/[^/]+\/solve$/)) {
    const u = await authSessionUser(req, env, requestId);
    const parts = url.pathname.split("/");
    const investigationId = parts[parts.length - 2];

    const inv = await env.DB.prepare(
      `SELECT investigation_id, lead_id, user_id, status FROM investigations WHERE investigation_id = ? AND user_id = ?`
    ).bind(investigationId, u.user_login).first<{ investigation_id: string; lead_id: string; user_id: string; status: string }>();
    if (!inv) return err("not_found", "Investigation not found", requestId, 404, corsHeaders(req, env));

    const reqs = await env.DB.prepare(
      `SELECT requirement_id, category, description, resolved FROM investigation_requirements WHERE investigation_id = ? AND resolved = 0`
    ).bind(investigationId).all<{ requirement_id: string; category: string; description: string; resolved: number }>();

    const actionsTaken: string[] = [];
    let resolvedCount = 0;

    for (const r of reqs.results ?? []) {
      let action: string | null = null;

      if (r.category === "data_gap") {
        // Add entity keywords to NVD source config
        try {
          const entityName = r.description.match(/"([^"]+)"/)?.[1];
          if (entityName) {
            const src = await env.DB.prepare(`SELECT source_id, config_json FROM prospect_sources WHERE source_id = 'nvd'`).first<{ source_id: string; config_json: string | null }>();
            if (src?.config_json) {
              const cfg = JSON.parse(src.config_json);
              const keywords: string[] = cfg.keywords ?? [];
              if (!keywords.includes(entityName.toLowerCase())) {
                keywords.push(entityName.toLowerCase());
                cfg.keywords = keywords;
                await env.DB.prepare(`UPDATE prospect_sources SET config_json = ? WHERE source_id = 'nvd'`).bind(JSON.stringify(cfg)).run();
                action = `Added "${entityName}" to NVD source keywords`;
              } else {
                action = `Entity "${entityName}" already in NVD keywords`;
              }
            }
          }
        } catch { action = "Data gap flagged — manual review needed"; }
      } else if (r.category === "monitor_needed") {
        // Add proactive regression entry
        try {
          const lead = await env.DB.prepare(`SELECT entity_name FROM prospect_leads WHERE lead_id = ?`).bind(inv.lead_id).first<{ entity_name: string }>();
          if (lead) {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO prospect_regressions (regression_id, dimension, key, occurrence_count, severity_trend, first_seen_at, last_seen_at)
               VALUES (?, 'entity', ?, 1, 'watching', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
            ).bind(uuid(), lead.entity_name).run();
            action = `Added "${lead.entity_name}" to regression watchlist`;
          }
        } catch { action = "Monitor flagged — manual review needed"; }
      } else if (r.category === "integration_needed") {
        // Add Shodan query to source config
        try {
          const src = await env.DB.prepare(`SELECT source_id, config_json FROM prospect_sources WHERE source_id = 'shodan'`).first<{ source_id: string; config_json: string | null }>();
          if (src?.config_json) {
            const cfg = JSON.parse(src.config_json);
            const queries: string[] = cfg.queries ?? [];
            const lead = await env.DB.prepare(`SELECT entity_name FROM prospect_leads WHERE lead_id = ?`).bind(inv.lead_id).first<{ entity_name: string }>();
            if (lead && !queries.some(q => q.includes(lead.entity_name.toLowerCase()))) {
              queries.push(`org:"${lead.entity_name}"`);
              cfg.queries = queries;
              await env.DB.prepare(`UPDATE prospect_sources SET config_json = ? WHERE source_id = 'shodan'`).bind(JSON.stringify(cfg)).run();
              action = `Added Shodan query for "${lead.entity_name}"`;
            }
          }
        } catch { action = "Integration flagged — manual review needed"; }
      } else {
        // capability_gap: human action needed
        action = null;
      }

      if (action) {
        await env.DB.prepare(
          `UPDATE investigation_requirements SET resolved = 1, resolution_action = ? WHERE requirement_id = ?`
        ).bind(action, r.requirement_id).run();
        actionsTaken.push(action);
        resolvedCount++;
      }
    }

    const unresolvedCount = (reqs.results?.length ?? 0) - resolvedCount;
    await env.DB.prepare(
      `UPDATE investigations SET solutions_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE investigation_id = ?`
    ).bind(JSON.stringify(actionsTaken), investigationId).run();

    return okJson({ ok: true, investigation_id: investigationId, resolved_count: resolvedCount, unresolved_count: unresolvedCount, actions_taken: actionsTaken }, requestId, corsHeaders(req, env));
  }

  // ---- POST /v1/prospect/leads/:id/re-investigate ----
  if (req.method === "POST" && url.pathname.match(/^\/v1\/prospect\/leads\/[^/]+\/re-investigate$/)) {
    const u = await authSessionUser(req, env, requestId);
    const parts = url.pathname.split("/");
    const leadId = parts[parts.length - 2];

    const lead = await env.DB.prepare(
      `SELECT lead_id, entity_name, vulnerability_id, summary, cvss_score, source_id FROM prospect_leads WHERE lead_id = ?`
    ).bind(leadId).first<{
      lead_id: string; entity_name: string; vulnerability_id: string | null;
      summary: string; cvss_score: number | null; source_id: string | null;
    }>();
    if (!lead) return err("not_found", "Lead not found", requestId, 404, corsHeaders(req, env));

    // Find most recent completed investigation
    const prevInv = await env.DB.prepare(
      `SELECT investigation_id, aggregate_score, risk_score_before FROM investigations
       WHERE lead_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1`
    ).bind(leadId).first<{ investigation_id: string; aggregate_score: number | null; risk_score_before: number | null }>();

    const riskScoreBefore = prevInv?.risk_score_before ?? prevInv?.aggregate_score ?? null;

    // Budget gate
    const budget = await checkBudget();
    if (!budget.allowed) {
      return err("rate_limited", `Budget exceeded — re-investigation deferred. ${budget.detail ?? ""}`, requestId, 503, corsHeaders(req, env));
    }

    const investigationId = uuid();
    const startedAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO investigations (investigation_id, lead_id, user_id, status, budget_level, risk_score_before, started_at)
       VALUES (?, ?, ?, 're_investigating', ?, ?, ?)`
    ).bind(investigationId, leadId, u.user_login, budget.level, riskScoreBefore, startedAt).run();

    await env.DB.prepare(
      `UPDATE prospect_leads SET investigation_status = 're_investigating', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lead_id = ?`
    ).bind(leadId).run();

    const { steps, aggregateScore } = await runPipeline(investigationId, lead);

    const riskReduction = riskScoreBefore !== null ? Math.round((riskScoreBefore - aggregateScore) * 100) / 100 : null;

    const completedAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE investigations SET status = 'completed', aggregate_score = ?, risk_score_after = ?,
       completed_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE investigation_id = ?`
    ).bind(aggregateScore, aggregateScore, completedAt, investigationId).run();

    await env.DB.prepare(
      `UPDATE prospect_leads SET investigation_status = 'investigated', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lead_id = ?`
    ).bind(leadId).run();

    return okJson({
      investigation_id: investigationId,
      lead_id: leadId,
      status: "completed",
      risk_score_before: riskScoreBefore,
      risk_score_after: aggregateScore,
      risk_reduction: riskReduction,
      budget_level: budget.level,
      steps: steps.map(s => ({ service: s.service, score: s.score, findings: s.findings, recommendation: s.recommendation, duration_ms: s.duration_ms, status: s.status })),
      started_at: startedAt,
      completed_at: completedAt,
    }, requestId, corsHeaders(req, env));
  }

  // ---- GET /v1/prospect/investigations ----
  if (req.method === "GET" && url.pathname === "/v1/prospect/investigations") {
    const u = await authSessionUser(req, env, requestId);
    const leadFilter = url.searchParams.get("lead_id");
    const statusFilter = url.searchParams.get("status");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);

    let query = `SELECT investigation_id, lead_id, status, aggregate_score, claude_used, budget_level, created_at FROM investigations WHERE user_id = ?`;
    const binds: unknown[] = [u.user_login];
    if (leadFilter) { query += ` AND lead_id = ?`; binds.push(leadFilter); }
    if (statusFilter) { query += ` AND status = ?`; binds.push(statusFilter); }
    query += ` ORDER BY created_at DESC LIMIT ?`;
    binds.push(limit);

    const rows = await env.DB.prepare(query).bind(...binds).all();
    return okJson({ items: rows.results ?? [] }, requestId, corsHeaders(req, env));
  }

  // ---- GET /v1/prospect/investigations/:id ----
  const invDetailMatch = url.pathname.match(/^\/v1\/prospect\/investigations\/([a-f0-9-]+)$/);
  if (req.method === "GET" && invDetailMatch) {
    const u = await authSessionUser(req, env, requestId);
    const investigationId = invDetailMatch[1];

    const inv = await env.DB.prepare(
      `SELECT * FROM investigations WHERE investigation_id = ? AND user_id = ?`
    ).bind(investigationId, u.user_login).first();
    if (!inv) return err("not_found", "Investigation not found", requestId, 404, corsHeaders(req, env));

    const steps = await env.DB.prepare(
      `SELECT step_id, service, step_order, status, score, findings_json, recommendation, duration_ms, input_context_json FROM investigation_steps WHERE investigation_id = ? ORDER BY step_order ASC`
    ).bind(investigationId).all();

    const reqs = await env.DB.prepare(
      `SELECT requirement_id, category, description, resolved, resolution_action FROM investigation_requirements WHERE investigation_id = ?`
    ).bind(investigationId).all();

    return okJson({
      ...inv,
      claude_summary: inv.claude_summary ? JSON.parse(inv.claude_summary as string) : null,
      requirements_json: inv.requirements_json ? JSON.parse(inv.requirements_json as string) : null,
      solutions_json: inv.solutions_json ? JSON.parse(inv.solutions_json as string) : null,
      steps: (steps.results ?? []).map((s: any) => ({
        ...s,
        findings: s.findings_json ? JSON.parse(s.findings_json) : [],
        input_context: s.input_context_json ? JSON.parse(s.input_context_json) : null,
        findings_json: undefined,
        input_context_json: undefined,
      })),
      requirements: (reqs.results ?? []),
    }, requestId, corsHeaders(req, env));
  }

  // ---- GET /v1/prospect/investigations/:id/requirements ----
  const invReqMatch = url.pathname.match(/^\/v1\/prospect\/investigations\/([a-f0-9-]+)\/requirements$/);
  if (req.method === "GET" && invReqMatch) {
    const u = await authSessionUser(req, env, requestId);
    const investigationId = invReqMatch[1];

    const inv = await env.DB.prepare(
      `SELECT investigation_id FROM investigations WHERE investigation_id = ? AND user_id = ?`
    ).bind(investigationId, u.user_login).first();
    if (!inv) return err("not_found", "Investigation not found", requestId, 404, corsHeaders(req, env));

    const reqs = await env.DB.prepare(
      `SELECT requirement_id, category, description, resolved, resolution_action, created_at FROM investigation_requirements WHERE investigation_id = ?`
    ).bind(investigationId).all();

    return okJson({ items: reqs.results ?? [] }, requestId, corsHeaders(req, env));
  }

  // ======================================================================
  // BROKER CONNECTIONS
  // ======================================================================

  // ---- PUT /v1/broker/connections/:broker ----
  const brokerPutMatch = url.pathname.match(/^\/v1\/broker\/connections\/(alpaca|schwab)$/);
  if (req.method === "PUT" && brokerPutMatch) {
    const u = await authSessionUser(req, env, requestId);
    const broker = brokerPutMatch[1];

    // Rate limit: hash user_login as key, free tier default
    const brokerRlKey = await sha256Hex(u.user_login + ":broker");
    const brokerRl = await consumeRateLimit(env, brokerRlKey, "free", 1);
    if (!brokerRl.allowed) return err("rate_limited", "Rate limit exceeded", requestId, 429, corsHeaders(req, env));

    const body = await req.json().catch(() => null) as null | {
      account_id?: string;
      constraints_json?: string;
    };

    // Validate constraints_json: max 10KB, must be valid JSON if provided
    if (body?.constraints_json != null) {
      if (body.constraints_json.length > 10240) {
        return err("invalid_request", "constraints_json exceeds 10KB limit", requestId, 400, corsHeaders(req, env));
      }
      try { JSON.parse(body.constraints_json); } catch {
        return err("invalid_request", "constraints_json must be valid JSON", requestId, 400, corsHeaders(req, env));
      }
    }

    // Encrypt account_id at rest (envelope encryption, same pattern as prospect credentials)
    let encryptedAccountId: string | null = null;
    if (body?.account_id) {
      if (body.account_id.length > 256) {
        return err("invalid_request", "account_id too long", requestId, 400, corsHeaders(req, env));
      }
      const masterKey = await importMasterKey(env.CREDENTIAL_KEY);
      encryptedAccountId = await encryptCredential(masterKey, body.account_id);
    }

    await env.DB.prepare(`
      INSERT INTO broker_connections (user_id, broker, account_id, constraints_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, broker) DO UPDATE SET
        account_id = COALESCE(excluded.account_id, broker_connections.account_id),
        constraints_json = COALESCE(excluded.constraints_json, broker_connections.constraints_json),
        status = 'active',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).bind(
      u.user_login,
      broker,
      encryptedAccountId,
      body?.constraints_json ?? null
    ).run();

    return okJson({ ok: true, broker, status: "active" }, requestId, corsHeaders(req, env));
  }

  // ---- GET /v1/broker/connections/:broker ----
  const brokerGetMatch = url.pathname.match(/^\/v1\/broker\/connections\/(alpaca|schwab)$/);
  if (req.method === "GET" && brokerGetMatch) {
    const u = await authSessionUser(req, env, requestId);
    const broker = brokerGetMatch[1];

    // Rate limit
    const brokerRlKey = await sha256Hex(u.user_login + ":broker");
    const brokerRl = await consumeRateLimit(env, brokerRlKey, "free", 1);
    if (!brokerRl.allowed) return err("rate_limited", "Rate limit exceeded", requestId, 429, corsHeaders(req, env));

    const row = await env.DB.prepare(
      `SELECT broker, account_id, account_type, status, constraints_json, connected_at, last_sync_at, updated_at
       FROM broker_connections WHERE user_id = ? AND broker = ?`
    ).bind(u.user_login, broker).first<Record<string, unknown>>();

    if (!row) return err("not_found", "No connection found", requestId, 404, corsHeaders(req, env));

    // Decrypt account_id before returning
    if (row.account_id && typeof row.account_id === "string") {
      try {
        const masterKey = await importMasterKey(env.CREDENTIAL_KEY);
        row.account_id = await decryptCredential(masterKey, row.account_id);
      } catch {
        row.account_id = null; // graceful fallback if decryption fails (legacy plaintext row)
      }
    }

    return okJson(row, requestId, corsHeaders(req, env));
  }

  // ---- DELETE /v1/broker/connections/:broker ----
  const brokerDelMatch = url.pathname.match(/^\/v1\/broker\/connections\/(alpaca|schwab)$/);
  if (req.method === "DELETE" && brokerDelMatch) {
    const u = await authSessionUser(req, env, requestId);
    const broker = brokerDelMatch[1];

    // Rate limit
    const brokerRlKey = await sha256Hex(u.user_login + ":broker");
    const brokerRl = await consumeRateLimit(env, brokerRlKey, "free", 1);
    if (!brokerRl.allowed) return err("rate_limited", "Rate limit exceeded", requestId, 429, corsHeaders(req, env));

    await env.DB.prepare(
      `UPDATE broker_connections SET status = 'disconnected', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE user_id = ? AND broker = ?`
    ).bind(u.user_login, broker).run();

    return okJson({ ok: true, broker, status: "disconnected" }, requestId, corsHeaders(req, env));
  }

  // ---- POST /v1/broker/sync ----
  if (req.method === "POST" && url.pathname === "/v1/broker/sync") {
    const u = await authSessionUser(req, env, requestId);

    // Rate limit
    const brokerRlKey = await sha256Hex(u.user_login + ":broker");
    const brokerRl = await consumeRateLimit(env, brokerRlKey, "free", 1);
    if (!brokerRl.allowed) return err("rate_limited", "Rate limit exceeded", requestId, 429, corsHeaders(req, env));

    const body = await req.json().catch(() => null) as null | {
      broker?: string;
      source?: string;
      date?: string;
      kpis?: Array<{ name: string; value: number; unit: string; source: string }>;
      positions?: Array<{ symbol: string; qty: number; side: string; entry_price: number; current_price: number; market_value: number; unrealized_pl: number }>;
    };
    if (!body?.broker || !body?.kpis) {
      return err("invalid_request", "broker and kpis are required", requestId, 400, corsHeaders(req, env));
    }

    // Validate broker connection exists and is active
    const conn = await env.DB.prepare(
      `SELECT broker FROM broker_connections WHERE user_id = ? AND broker = ? AND status = 'active'`
    ).bind(u.user_login, body.broker).first();
    if (!conn) return err("not_found", "No active broker connection found", requestId, 404, corsHeaders(req, env));

    // Validate KPIs: count cap + name/unit format
    if (body.kpis.length > 100) {
      return err("invalid_request", "kpis array exceeds 100 items", requestId, 400, corsHeaders(req, env));
    }
    const KPI_RE = /^[\w\s.:/%()+-]{1,100}$/;
    for (const kpi of body.kpis) {
      if (!kpi.name || !KPI_RE.test(kpi.name)) {
        return err("invalid_request", "Invalid KPI name format", requestId, 400, corsHeaders(req, env));
      }
      if (kpi.unit && !KPI_RE.test(kpi.unit)) {
        return err("invalid_request", "Invalid KPI unit format", requestId, 400, corsHeaders(req, env));
      }
      if (typeof kpi.value !== "number" || !isFinite(kpi.value)) {
        return err("invalid_request", "KPI value must be a finite number", requestId, 400, corsHeaders(req, env));
      }
    }

    const syncId = uuid();
    const now = new Date().toISOString();

    // Log the sync
    await env.DB.prepare(`
      INSERT INTO broker_sync_log (sync_id, user_id, broker, sync_type, records_count, status, created_at)
      VALUES (?, ?, ?, 'kpis', ?, 'success', ?)
    `).bind(syncId, u.user_login, body.broker, body.kpis.length, now).run();

    // Update last_sync_at
    await env.DB.prepare(`
      UPDATE broker_connections SET last_sync_at = ?, updated_at = ?
      WHERE user_id = ? AND broker = ?
    `).bind(now, now, u.user_login, body.broker).run();

    return okJson({
      ok: true,
      sync_id: syncId,
      broker: body.broker,
      kpis_count: body.kpis.length,
      positions_count: body.positions?.length ?? 0,
      source: body.source ?? "paper:" + body.broker,
    }, requestId, corsHeaders(req, env));
  }

  // ---- SIGNAL: WebSocket stream ----
  // GET /v1/signal/stream?token=<JWT>
  if (req.method === "GET" && url.pathname === "/v1/signal/stream") {
    if (req.headers.get("upgrade") !== "websocket") {
      return err("invalid_request", "Expected WebSocket upgrade", requestId, 400, corsHeaders(req, env));
    }

    // Auth via query param (WebSocket can't send custom headers)
    const wsToken = url.searchParams.get("token") || "";
    if (!wsToken) return err("unauthorized", "Missing token query param", requestId, 401, corsHeaders(req, env));
    try {
      await verifyUserFromJwt(wsToken, env.JWT_SECRET);
    } catch {
      return err("unauthorized", "Invalid token", requestId, 401, corsHeaders(req, env));
    }

    // Proxy to SignalFeedDO
    const feedId = env.SIGNAL_FEED.idFromName("global");
    const feed = env.SIGNAL_FEED.get(feedId);
    return feed.fetch(req);
  }

  // ---- SIGNAL: rules CRUD ----

  // GET /v1/signal/rules
  if (req.method === "GET" && url.pathname === "/v1/signal/rules") {
    const u = await authSessionUser(req, env, requestId);
    const rows = await env.DB.prepare(
      `SELECT rule_id, name, status, symbols_json, entry_conditions_json, exit_conditions_json,
              order_side, order_type, order_qty, order_tif, cooldown_seconds, temporal_json,
              version, created_at, updated_at
       FROM signal_rules WHERE user_id = ? AND status != 'disabled' ORDER BY created_at DESC`
    ).bind(u.user_login).all();
    return okJson({ items: rows.results ?? [] }, requestId, corsHeaders(req, env));
  }

  // POST /v1/signal/rules
  if (req.method === "POST" && url.pathname === "/v1/signal/rules") {
    const u = await authSessionUser(req, env, requestId);
    const body = await req.json().catch(() => null) as any;
    if (!body?.rule_id || !body?.name || !body?.entry_conditions_json || !body?.order_side || !body?.order_qty) {
      return err("invalid_request", "Missing required fields: rule_id, name, entry_conditions_json, order_side, order_qty", requestId, 400, corsHeaders(req, env));
    }

    // Cap active rules at 50
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM signal_rules WHERE user_id = ? AND status = 'active'`
    ).bind(u.user_login).first<{ cnt: number }>();
    if ((countRow?.cnt ?? 0) >= 50) {
      return err("invalid_request", "Maximum 50 active rules", requestId, 400, corsHeaders(req, env));
    }

    await env.DB.prepare(`
      INSERT INTO signal_rules (rule_id, user_id, name, status, symbols_json,
        entry_conditions_json, exit_conditions_json, order_side, order_type,
        order_qty, order_tif, cooldown_seconds, temporal_json, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.rule_id, u.user_login, body.name, body.status || "active",
      body.symbols_json || null, body.entry_conditions_json, body.exit_conditions_json || null,
      body.order_side, body.order_type || "market", body.order_qty,
      body.order_tif || "day", body.cooldown_seconds ?? 300,
      body.temporal_json || null, body.version ?? 1
    ).run();

    return okJson({ ok: true, rule_id: body.rule_id }, requestId, corsHeaders(req, env));
  }

  // PUT /v1/signal/rules/:id
  const signalRulePutMatch = url.pathname.match(/^\/v1\/signal\/rules\/([a-f0-9]+)$/);
  if (req.method === "PUT" && signalRulePutMatch) {
    const u = await authSessionUser(req, env, requestId);
    const ruleId = signalRulePutMatch[1];
    const body = await req.json().catch(() => null) as any;
    if (!body) return err("invalid_request", "Invalid JSON body", requestId, 400, corsHeaders(req, env));

    const result = await env.DB.prepare(`
      UPDATE signal_rules SET
        name = COALESCE(?, name),
        status = COALESCE(?, status),
        symbols_json = COALESCE(?, symbols_json),
        entry_conditions_json = COALESCE(?, entry_conditions_json),
        exit_conditions_json = COALESCE(?, exit_conditions_json),
        order_side = COALESCE(?, order_side),
        order_type = COALESCE(?, order_type),
        order_qty = COALESCE(?, order_qty),
        order_tif = COALESCE(?, order_tif),
        cooldown_seconds = COALESCE(?, cooldown_seconds),
        temporal_json = COALESCE(?, temporal_json),
        version = COALESCE(?, version),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE rule_id = ? AND user_id = ?
    `).bind(
      body.name ?? null, body.status ?? null, body.symbols_json ?? null,
      body.entry_conditions_json ?? null, body.exit_conditions_json ?? null,
      body.order_side ?? null, body.order_type ?? null,
      body.order_qty ?? null, body.order_tif ?? null,
      body.cooldown_seconds ?? null, body.temporal_json ?? null,
      body.version ?? null, ruleId, u.user_login
    ).run();

    if (!result.meta.changes) return err("not_found", "Rule not found", requestId, 404, corsHeaders(req, env));
    return okJson({ ok: true, rule_id: ruleId }, requestId, corsHeaders(req, env));
  }

  // DELETE /v1/signal/rules/:id — soft-delete (set status=disabled)
  const signalRuleDeleteMatch = url.pathname.match(/^\/v1\/signal\/rules\/([a-f0-9]+)$/);
  if (req.method === "DELETE" && signalRuleDeleteMatch) {
    const u = await authSessionUser(req, env, requestId);
    const ruleId = signalRuleDeleteMatch[1];
    const result = await env.DB.prepare(
      `UPDATE signal_rules SET status = 'disabled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE rule_id = ? AND user_id = ?`
    ).bind(ruleId, u.user_login).run();

    if (!result.meta.changes) return err("not_found", "Rule not found", requestId, 404, corsHeaders(req, env));
    return okJson({ ok: true, rule_id: ruleId }, requestId, corsHeaders(req, env));
  }

  // ---- SIGNAL: events ----

  // GET /v1/signal/events?since=<ISO>&limit=<n>
  if (req.method === "GET" && url.pathname === "/v1/signal/events") {
    const u = await authSessionUser(req, env, requestId);
    const since = url.searchParams.get("since") || "1970-01-01T00:00:00Z";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 500);

    const rows = await env.DB.prepare(
      `SELECT event_id, rule_id, event_type, trigger_snapshot_json, matched_conditions_json,
              symbol, order_id, order_side, order_qty, order_price, daemon_id, created_at
       FROM signal_events WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT ?`
    ).bind(u.user_login, since, limit).all();

    return okJson({ items: rows.results ?? [] }, requestId, corsHeaders(req, env));
  }

  // POST /v1/signal/events — log event from CLI daemon
  if (req.method === "POST" && url.pathname === "/v1/signal/events") {
    const u = await authSessionUser(req, env, requestId);
    const body = await req.json().catch(() => null) as any;
    if (!body?.event_id || !body?.rule_id || !body?.event_type) {
      return err("invalid_request", "Missing required fields: event_id, rule_id, event_type", requestId, 400, corsHeaders(req, env));
    }

    await env.DB.prepare(`
      INSERT OR IGNORE INTO signal_events (event_id, rule_id, user_id, event_type,
        trigger_snapshot_json, matched_conditions_json, symbol, order_id,
        order_side, order_qty, order_price, daemon_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.event_id, body.rule_id, u.user_login, body.event_type,
      body.trigger_snapshot_json || null, body.matched_conditions_json || null,
      body.symbol || null, body.order_id || null,
      body.order_side || null, body.order_qty ?? null,
      body.order_price ?? null, body.daemon_id || null
    ).run();

    return okJson({ ok: true, event_id: body.event_id }, requestId, corsHeaders(req, env));
  }

  // POST /v1/signal/rules/sync — bulk upsert rules from CLI
  if (req.method === "POST" && url.pathname === "/v1/signal/rules/sync") {
    const u = await authSessionUser(req, env, requestId);
    const body = await req.json().catch(() => null) as any;
    if (!body?.rules || !Array.isArray(body.rules)) {
      return err("invalid_request", "Expected { rules: [...] }", requestId, 400, corsHeaders(req, env));
    }

    if (body.rules.length > 50) {
      return err("invalid_request", "Maximum 50 rules per sync", requestId, 400, corsHeaders(req, env));
    }

    let upserted = 0;
    for (const r of body.rules) {
      if (!r.rule_id || !r.name || !r.entry_conditions_json || !r.order_side || !r.order_qty) continue;

      await env.DB.prepare(`
        INSERT INTO signal_rules (rule_id, user_id, name, status, symbols_json,
          entry_conditions_json, exit_conditions_json, order_side, order_type,
          order_qty, order_tif, cooldown_seconds, temporal_json, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (rule_id) DO UPDATE SET
          name = excluded.name,
          status = excluded.status,
          symbols_json = excluded.symbols_json,
          entry_conditions_json = excluded.entry_conditions_json,
          exit_conditions_json = excluded.exit_conditions_json,
          order_side = excluded.order_side,
          order_type = excluded.order_type,
          order_qty = excluded.order_qty,
          order_tif = excluded.order_tif,
          cooldown_seconds = excluded.cooldown_seconds,
          temporal_json = excluded.temporal_json,
          version = excluded.version,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      `).bind(
        r.rule_id, u.user_login, r.name, r.status || "active",
        r.symbols_json || null, r.entry_conditions_json, r.exit_conditions_json || null,
        r.order_side, r.order_type || "market", r.order_qty,
        r.order_tif || "day", r.cooldown_seconds ?? 300,
        r.temporal_json || null, r.version ?? 1
      ).run();
      upserted++;
    }

    return okJson({ ok: true, upserted }, requestId, corsHeaders(req, env));
  }

  return err("not_found", "Not found", requestId, 404, corsHeaders(req, env));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const res = await route(req, env);
      // ✅ ALWAYS attach CORS (covers 200/401/403/404/etc)
      return withCors(req, res, env.ALLOWED_ORIGINS);
    } catch (e: any) {
      // ✅ If inner code threw a Response, still attach CORS
      if (e instanceof Response) return withCors(req, e, env.ALLOWED_ORIGINS);

      const requestId = uuid();
      console.error("❌ Unhandled error:", e);

      const res = err("internal", "Internal error", requestId, 500);
      return withCors(req, res, env.ALLOWED_ORIGINS);
    }
  }
};
