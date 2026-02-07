import { buildRss } from "./rss";
import { hmacSha256Hex, json, safeEqual, sha256Hex, uuid } from "./crypto";
import { RateLimiterDO, RateLimitPlan } from "./rate_limit_do";
import { normalizeTradesJson, upsertMetricsDaily } from "./ingest";
import { requireUserFromAuthCookie, verifyUserFromJwt } from "./auth";
import { getExtremes, getKpis, getPortfolioAssets, getSeries } from "./metrics_queries";
import { withCors, handleOptions as corsOptions } from "./cors";

// Export DO class for Wrangler
export { RateLimiterDO };

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

  // Shared with haiphen-auth so we can verify the same cookie JWT for key issuance.
  JWT_SECRET: string;

  // Pepper used to hash API keys (server-side secret; rotate carefully).
  API_KEY_PEPPER: string;

  // Admin token for privileged ops
  ADMIN_TOKEN: string;

  // Webhook signing: optional global secret salt (per-hook secret is stored anyway)
  WEBHOOK_SALT?: string;

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
  | "invalid_request"
  | "internal";

type ApiError = { error: { code: ErrorCode; message: string; request_id: string } };

function corsHeaders(req: Request, env: Env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io,https://auth.haiphen.io")
    .split(",")
    .map(s => s.trim());

  const o = allowed.includes(origin) ? origin : "https://haiphen.io";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

async function ensureUser(env: Env, userLogin: string) {
  await env.DB.prepare(`INSERT OR IGNORE INTO users(user_login) VALUES (?)`).bind(userLogin).run();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO plans(user_login, plan, active) VALUES (?, 'free', 1)
  `).bind(userLogin).run();
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
  if (plan === "pro") return { limitPerMinute: 600, burst: 60 };
  if (plan === "enterprise") return { limitPerMinute: 6000, burst: 600 };
  return { limitPerMinute: 60, burst: 10 };
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

async function authCookieUser(req: Request, env: Env, requestId: string): Promise<{ user_login: string }> {
  try {
    const user = await requireUserFromAuthCookie(req, env.JWT_SECRET);
    // Optional: mirror revocation if you want (jti is available in auth.ts claims currently only internally)
    return { user_login: user.login };
  } catch (e: any) {
    // Normalize to your API error format
    throw err("unauthorized", "Unauthorized", requestId, 401);
  }
}

async function authSessionUser(req: Request, env: Env, requestId: string): Promise<{ user_login: string }> {
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
    return { user_login: user.login };
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
    cli_docs_url: String(env.ONBOARDING_CLI_DOCS_URL ?? "https://haiphen.io/#docs").trim(),
    api_base_url: String(env.ONBOARDING_API_BASE_URL ?? "https://api.haiphen.io").trim(),
    websocket_url: String(env.ONBOARDING_WEBSOCKET_URL ?? "wss://api.haiphen.io/v1/telemetry/stream").trim(),
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

  // ---- whoami / me (cookie auth) ----
  if (req.method === "GET" && (url.pathname === "/v1/whoami" || url.pathname === "/v1/me")) {
    const u = await authCookieUser(req, env, requestId);
    await ensureUser(env, u.user_login);

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
    await ensureUser(env, u.user_login);

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
    await ensureUser(env, u.user_login);

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
    await ensureUser(env, u.user_login);

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
    await ensureUser(env, u.user_login);

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

    await ensureUser(env, body.user_login);
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
