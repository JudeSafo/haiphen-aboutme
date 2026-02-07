var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/rss.ts
function esc(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
__name(esc, "esc");
function buildRss(d) {
  const title = `Haiphen Trading Metrics \u2014 ${d.date}`;
  const link = `https://haiphen.io/docs/#docs:metrics-daily`;
  const guid = `haiphen-metrics:${d.date}`;
  const rows = d.rows.map((r) => `<li><strong>${esc(r.kpi)}:</strong> ${esc(r.value)}</li>`).join("");
  const desc = `
    <p>${esc(d.headline)}</p>
    <p>${esc(d.summary)}</p>
    <ul>${rows}</ul>
  `.trim();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc("Haiphen Trading Metrics")}</title>
    <link>${esc(link)}</link>
    <description>${esc("Daily high-frequency execution telemetry, delivered as RSS.")}</description>
    <language>en-us</language>

    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(guid)}</guid>
      <pubDate>${esc(new Date(d.updated_at).toUTCString())}</pubDate>
      <description><![CDATA[${desc}]]></description>
    </item>
  </channel>
</rss>`;
}
__name(buildRss, "buildRss");

// src/crypto.ts
function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hex, "hex");
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return hex(digest);
}
__name(sha256Hex, "sha256Hex");
async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return hex(sig);
}
__name(hmacSha256Hex, "hmacSha256Hex");
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
__name(safeEqual, "safeEqual");
function json(v) {
  return JSON.stringify(v);
}
__name(json, "json");
function uuid() {
  return crypto.randomUUID();
}
__name(uuid, "uuid");

// src/rate_limit_do.ts
var RateLimiterDO = class {
  static {
    __name(this, "RateLimiterDO");
  }
  state;
  constructor(state) {
    this.state = state;
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/consume") return new Response("Not found", { status: 404 });
    const body = await req.json().catch(() => null);
    if (!body?.plan) return new Response("Bad request", { status: 400 });
    const cost = Math.max(1, Math.floor(body.cost ?? 1));
    const nowMs = body.nowMs ?? Date.now();
    const key = "rl_state";
    const stored = await this.state.storage.get(key) ?? null;
    const limit = body.plan.limitPerMinute;
    const burst = body.plan.burst;
    const refillPerMs = limit / 6e4;
    let tokens = stored?.tokens ?? burst;
    let lastRefillMs = stored?.lastRefillMs ?? nowMs;
    const elapsed = Math.max(0, nowMs - lastRefillMs);
    tokens = Math.min(burst, tokens + elapsed * refillPerMs);
    lastRefillMs = nowMs;
    const allowed = tokens >= cost;
    if (allowed) tokens -= cost;
    const msUntil1 = tokens >= 1 ? 0 : Math.ceil((1 - tokens) / refillPerMs);
    const resetMs = nowMs + msUntil1;
    await this.state.storage.put(key, { tokens, lastRefillMs });
    const res = {
      allowed,
      remaining: Math.max(0, Math.floor(tokens)),
      limit,
      resetMs
    };
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// src/ingest.ts
function _isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
__name(_isObj, "_isObj");
function _asString(v) {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}
__name(_asString, "_asString");
function _mustString(v, field) {
  const s = _asString(v).trim();
  if (!s) throw new Error(`normalizeTradesJson: missing/invalid ${field}`);
  return s;
}
__name(_mustString, "_mustString");
function normalizeTradesJson(payload) {
  if (!_isObj(payload)) throw new Error("normalizeTradesJson: payload must be an object");
  const date = _mustString(payload.date, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("normalizeTradesJson: date must be YYYY-MM-DD");
  }
  const updated_at = _asString(payload.updated_at).trim() || (/* @__PURE__ */ new Date()).toISOString();
  const headline = _asString(payload.headline).trim() || `Haiphen metrics for ${date}`;
  const summary = _asString(payload.summary).trim() || "";
  const rawRows = Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload.kpis) ? payload.kpis : [];
  const rows = [];
  for (const r of rawRows) {
    if (!_isObj(r)) continue;
    const kpi = (_asString(r.kpi) || _asString(r.name) || _asString(r.label)).trim();
    const value = _asString(r.value ?? r.val ?? r.text).trim();
    if (!kpi) continue;
    rows.push({ kpi, value });
  }
  const overlayRaw = _isObj(payload.overlay) ? payload.overlay : {};
  const seriesByKpiRaw = _isObj(overlayRaw.seriesByKpi) ? overlayRaw.seriesByKpi : _isObj(overlayRaw.series) ? overlayRaw.series : {};
  const seriesByKpi = {};
  for (const [kpi, pts] of Object.entries(seriesByKpiRaw ?? {})) {
    if (!Array.isArray(pts)) continue;
    const normPts = [];
    for (const p of pts) {
      if (!_isObj(p)) continue;
      const t = _asString(p.t ?? p.time ?? p.ts).trim();
      const vRaw = p.v ?? p.value;
      const v = typeof vRaw === "number" ? vRaw : Number(vRaw);
      if (!t || !Number.isFinite(v)) continue;
      const src = _asString(p.src).trim() || void 0;
      normPts.push(src ? { t, v, src } : { t, v });
    }
    if (normPts.length) seriesByKpi[kpi] = normPts;
  }
  const extremesRaw = _isObj(overlayRaw.extremes) ? overlayRaw.extremes : {};
  const byKpi = _isObj(extremesRaw.byKpi) ? extremesRaw.byKpi : void 0;
  const extremes = {
    byKpi,
    legacyKpi: _asString(extremesRaw.legacyKpi).trim() || void 0,
    source: _asString(extremesRaw.source).trim() || void 0
  };
  const assetsRaw = Array.isArray(overlayRaw.portfolioAssets) ? overlayRaw.portfolioAssets : Array.isArray(overlayRaw.assets) ? overlayRaw.assets : [];
  const portfolioAssets = [];
  for (const a of assetsRaw) {
    if (!_isObj(a)) continue;
    const tradeIdRaw = a.trade_id ?? a.tradeId ?? a.id;
    const trade_id = typeof tradeIdRaw === "number" ? Math.trunc(tradeIdRaw) : Math.trunc(Number(tradeIdRaw));
    const contract_name = _asString(a.contract_name ?? a.contractName ?? a.contract).trim();
    const symbol = _asString(a.symbol).trim() || null;
    if (!Number.isFinite(trade_id) || !contract_name) continue;
    portfolioAssets.push({ trade_id, symbol, contract_name });
  }
  const source = _asString(payload.source).trim() || void 0;
  return {
    date,
    updated_at,
    headline,
    summary,
    rows,
    overlay: { seriesByKpi, extremes, portfolioAssets },
    source
  };
}
__name(normalizeTradesJson, "normalizeTradesJson");
function parseNumericValue(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { value_num: null, value_kind: "text" };
  if (/%$/.test(s)) {
    const n = Number(s.replace(/[%+,]/g, "").trim());
    return Number.isFinite(n) ? { value_num: n, value_kind: "percent" } : { value_num: null, value_kind: "text" };
  }
  const numish = s.replace(/,/g, "").trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(numish)) {
    const n = Number(numish);
    return Number.isFinite(n) ? { value_num: n, value_kind: "number" } : { value_num: null, value_kind: "text" };
  }
  return { value_num: null, value_kind: "text" };
}
__name(parseNumericValue, "parseNumericValue");
function asRecord(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v;
}
__name(asRecord, "asRecord");
function numOrNull(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
__name(numOrNull, "numOrNull");
function strOrNull(v) {
  return typeof v === "string" && v.length ? v : null;
}
__name(strOrNull, "strOrNull");
function intOrNull(v) {
  const n = numOrNull(v);
  if (n === null) return null;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
__name(intOrNull, "intOrNull");
async function upsertMetricsDaily(env, payload) {
  const date = payload.date;
  await env.DB.prepare(`
    INSERT INTO metrics_daily(date, updated_at, headline, summary, rows_json, overlay_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      updated_at=excluded.updated_at,
      headline=excluded.headline,
      summary=excluded.summary,
      rows_json=excluded.rows_json,
      overlay_json=excluded.overlay_json
  `).bind(
    payload.date,
    payload.updated_at,
    payload.headline,
    payload.summary,
    json(payload.rows),
    json(payload.overlay)
  ).run();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM metrics_kpi_values WHERE date = ?`).bind(date),
    env.DB.prepare(`DELETE FROM metrics_series_points WHERE date = ?`).bind(date),
    env.DB.prepare(`DELETE FROM metrics_extremes_items WHERE date = ?`).bind(date),
    env.DB.prepare(`DELETE FROM metrics_portfolio_assets WHERE date = ?`).bind(date)
  ]);
  const stmts = [];
  for (const r of payload.rows ?? []) {
    const kpi = String(r?.kpi ?? "").trim();
    const value_text = String(r?.value ?? "").trim();
    if (!kpi) continue;
    const parsed = parseNumericValue(value_text);
    stmts.push(
      env.DB.prepare(`
        INSERT INTO metrics_kpi_values(date, kpi, value_text, value_num, value_kind)
        VALUES (?, ?, ?, ?, ?)
      `).bind(date, kpi, value_text, parsed.value_num, parsed.value_kind)
    );
  }
  const sbk = payload.overlay?.seriesByKpi ?? {};
  for (const [kpi, points] of Object.entries(sbk)) {
    if (!kpi || !Array.isArray(points)) continue;
    for (const p of points) {
      const t = strOrNull(p?.t);
      const v = numOrNull(p?.v);
      const src = strOrNull(p?.src);
      if (!t || v === null) continue;
      stmts.push(
        env.DB.prepare(`
          INSERT INTO metrics_series_points(date, kpi, t, v, src)
          VALUES (?, ?, ?, ?, ?)
        `).bind(date, kpi, t, v, src)
      );
    }
  }
  const byKpi = payload.overlay?.extremes?.byKpi ?? {};
  for (const [kpi, v] of Object.entries(byKpi)) {
    const obj = asRecord(v);
    if (!kpi || !obj) continue;
    const hi = Array.isArray(obj.hi) ? obj.hi : [];
    const lo = Array.isArray(obj.lo) ? obj.lo : [];
    const insertOne = /* @__PURE__ */ __name((side, item, rank) => {
      const rec = asRecord(item) ?? {};
      const trade_id = intOrNull(rec.trade_id);
      const symbol = strOrNull(rec.symbol);
      const contract_name = strOrNull(rec.contract_name) ?? "";
      if (!contract_name) return;
      stmts.push(
        env.DB.prepare(`
          INSERT INTO metrics_extremes_items(
            date, kpi, side, rank,
            trade_id, symbol, contract_name,
            metric_raw, metric_abs,
            individual_pnl, abs_individual_pnl,
            percent_change, cost_basis, qty,
            bid_price, ask_price, mid_price, mid_ts,
            mid_mark_pnl, liquidity_drag,
            item_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          date,
          kpi,
          side,
          rank,
          trade_id,
          symbol,
          contract_name,
          numOrNull(rec.metric_raw),
          numOrNull(rec.metric_abs),
          numOrNull(rec.individual_pnl),
          numOrNull(rec.abs_individual_pnl),
          numOrNull(rec.percent_change),
          numOrNull(rec.cost_basis),
          numOrNull(rec.qty),
          numOrNull(rec.bid_price),
          numOrNull(rec.ask_price),
          numOrNull(rec.mid_price),
          strOrNull(rec.mid_ts),
          numOrNull(rec.mid_mark_pnl),
          numOrNull(rec.liquidity_drag),
          JSON.stringify(item)
        )
      );
    }, "insertOne");
    for (let i = 0; i < hi.length; i++) insertOne("hi", hi[i], i + 1);
    for (let i = 0; i < lo.length; i++) insertOne("lo", lo[i], i + 1);
  }
  for (const a of payload.overlay?.portfolioAssets ?? []) {
    const trade_id = intOrNull(a?.trade_id);
    const contract_name = strOrNull(a?.contract_name);
    const symbol = strOrNull(a?.symbol);
    if (trade_id === null || !contract_name) continue;
    stmts.push(
      env.DB.prepare(`
        INSERT INTO metrics_portfolio_assets(date, trade_id, symbol, contract_name)
        VALUES (?, ?, ?, ?)
      `).bind(date, trade_id, symbol, contract_name)
    );
  }
  const chunkSize = 200;
  for (let i = 0; i < stmts.length; i += chunkSize) {
    await env.DB.batch(stmts.slice(i, i + chunkSize));
  }
}
__name(upsertMetricsDaily, "upsertMetricsDaily");

// src/auth.ts
function base64UrlToBytes(b64url) {
  const pad = "=".repeat((4 - b64url.length % 4) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
__name(base64UrlToBytes, "base64UrlToBytes");
async function hmacSha256Verify(secret, data, sigB64Url) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sig = base64UrlToBytes(sigB64Url);
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(data));
}
__name(hmacSha256Verify, "hmacSha256Verify");
function parseCookie(req, name) {
  const h = req.headers.get("Cookie") || "";
  const parts = h.split(";").map((x) => x.trim());
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    const k = p.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(p.slice(idx + 1));
  }
  return null;
}
__name(parseCookie, "parseCookie");
async function requireUserFromAuthCookie(req, jwtSecret) {
  const token = parseCookie(req, "auth");
  if (!token) throw Object.assign(new Error("Missing auth cookie"), { status: 401 });
  const parts = token.split(".");
  if (parts.length !== 3) throw Object.assign(new Error("Malformed JWT"), { status: 401 });
  const [hB64, pB64, sB64] = parts;
  const signed = `${hB64}.${pB64}`;
  const ok = await hmacSha256Verify(jwtSecret, signed, sB64);
  if (!ok) throw Object.assign(new Error("Invalid JWT signature"), { status: 401 });
  const payloadJson = new TextDecoder().decode(base64UrlToBytes(pB64));
  const claims = JSON.parse(payloadJson);
  if (claims.aud && claims.aud !== "haiphen-auth") {
    throw Object.assign(new Error("Invalid JWT audience"), { status: 401 });
  }
  const now = Math.floor(Date.now() / 1e3);
  if (typeof claims.exp === "number" && claims.exp < now) {
    throw Object.assign(new Error("Expired session"), { status: 401 });
  }
  if (!claims.sub) throw Object.assign(new Error("JWT missing sub"), { status: 401 });
  return {
    login: claims.sub,
    name: claims.name ?? null,
    avatar: claims.avatar ?? null,
    email: claims.email ?? null
  };
}
__name(requireUserFromAuthCookie, "requireUserFromAuthCookie");

// src/metrics_queries.ts
async function getKpis(env, date) {
  const rows = await env.DB.prepare(`
    SELECT kpi, value_text, value_num, value_kind
    FROM metrics_kpi_values
    WHERE date = ?
    ORDER BY kpi ASC
  `).bind(date).all();
  return rows.results ?? [];
}
__name(getKpis, "getKpis");
async function getSeries(env, date, kpi, from, to, limit = 500) {
  const lim = Math.min(2e3, Math.max(1, limit));
  let sql = `
    SELECT t, v, src
    FROM metrics_series_points
    WHERE date = ? AND kpi = ?
  `;
  const binds = [date, kpi];
  if (from) {
    sql += ` AND t >= ?`;
    binds.push(from);
  }
  if (to) {
    sql += ` AND t <= ?`;
    binds.push(to);
  }
  sql += ` ORDER BY t ASC LIMIT ?`;
  binds.push(lim);
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return rows.results ?? [];
}
__name(getSeries, "getSeries");
async function getExtremes(env, date, kpi, side, limit = 10) {
  const lim = Math.min(50, Math.max(1, limit));
  const rows = await env.DB.prepare(`
    SELECT
      rank, trade_id, symbol, contract_name,
      metric_raw, metric_abs, individual_pnl, abs_individual_pnl,
      percent_change, cost_basis, qty,
      bid_price, ask_price, mid_price, mid_ts,
      mid_mark_pnl, liquidity_drag,
      item_json
    FROM metrics_extremes_items
    WHERE date = ? AND kpi = ? AND side = ?
    ORDER BY rank ASC
    LIMIT ?
  `).bind(date, kpi, side, lim).all();
  return (rows.results ?? []).map((r) => ({
    ...r,
    item: JSON.parse(r.item_json)
  }));
}
__name(getExtremes, "getExtremes");
async function getPortfolioAssets(env, date, symbol, limit = 200) {
  const lim = Math.min(2e3, Math.max(1, limit));
  if (symbol) {
    const rows2 = await env.DB.prepare(`
      SELECT trade_id, symbol, contract_name
      FROM metrics_portfolio_assets
      WHERE date = ? AND symbol = ?
      ORDER BY trade_id DESC
      LIMIT ?
    `).bind(date, symbol, lim).all();
    return rows2.results ?? [];
  }
  const rows = await env.DB.prepare(`
    SELECT trade_id, symbol, contract_name
    FROM metrics_portfolio_assets
    WHERE date = ?
    ORDER BY trade_id DESC
    LIMIT ?
  `).bind(date, lim).all();
  return rows.results ?? [];
}
__name(getPortfolioAssets, "getPortfolioAssets");

// src/index.ts
function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io,https://auth.haiphen.io").split(",").map((s) => s.trim());
  const o = allowed.includes(origin) ? origin : "https://haiphen.io";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function withReqId(headers, requestId) {
  headers.set("X-Request-Id", requestId);
  return headers;
}
__name(withReqId, "withReqId");
function err(code, message, requestId, status, extraHeaders) {
  const body = { error: { code, message, request_id: requestId } };
  const h = new Headers({ "Content-Type": "application/json", ...extraHeaders ?? {} });
  withReqId(h, requestId);
  return new Response(JSON.stringify(body, null, 2), { status, headers: h });
}
__name(err, "err");
function okJson(data, requestId, headers) {
  const h = new Headers({ "Content-Type": "application/json", ...headers ?? {} });
  withReqId(h, requestId);
  return new Response(JSON.stringify(data, null, 2), { status: 200, headers: h });
}
__name(okJson, "okJson");
function bearer(req) {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}
__name(bearer, "bearer");
async function ensureUser(env, userLogin) {
  await env.DB.prepare(`INSERT OR IGNORE INTO users(user_login) VALUES (?)`).bind(userLogin).run();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO plans(user_login, plan, active) VALUES (?, 'free', 1)
  `).bind(userLogin).run();
}
__name(ensureUser, "ensureUser");
async function getPlan(env, userLogin) {
  const cacheKey = `plan:${userLogin}`;
  const cached = await env.CACHE_KV.get(cacheKey);
  if (cached === "free" || cached === "pro" || cached === "enterprise") return cached;
  const row = await env.DB.prepare(`SELECT plan, active FROM plans WHERE user_login = ?`).bind(userLogin).first();
  const plan = row?.active ? row.plan : "free";
  const normalized = plan === "pro" || plan === "enterprise" ? plan : "free";
  await env.CACHE_KV.put(cacheKey, normalized, { expirationTtl: 300 });
  return normalized;
}
__name(getPlan, "getPlan");
function planToRateLimit(plan) {
  if (plan === "pro") return { limitPerMinute: 600, burst: 60 };
  if (plan === "enterprise") return { limitPerMinute: 6e3, burst: 600 };
  return { limitPerMinute: 60, burst: 10 };
}
__name(planToRateLimit, "planToRateLimit");
function planToEntitlements(plan) {
  const paid = plan === "pro" || plan === "enterprise";
  return {
    active: paid,
    plan,
    features: {
      docs: true,
      // docs page should render
      api: paid,
      // request access / try-it gating
      rss: paid,
      // rss endpoints
      services: paid,
      // whatever else you gate
      trade_engine: paid
    }
  };
}
__name(planToEntitlements, "planToEntitlements");
async function consumeRateLimit(env, apiKeyHash, plan, cost = 1) {
  const id = env.RATE_LIMITER.idFromName(apiKeyHash);
  const stub = env.RATE_LIMITER.get(id);
  const res = await stub.fetch("https://rate-limiter/consume", {
    method: "POST",
    body: JSON.stringify({ plan: planToRateLimit(plan), cost })
  });
  const data = await res.json();
  return data;
}
__name(consumeRateLimit, "consumeRateLimit");
async function authApiKey(req, env, requestId) {
  const token = bearer(req);
  if (!token) throw err("unauthorized", "Missing or invalid API key", requestId, 401);
  const tokenHash = await sha256Hex(`${token}.${env.API_KEY_PEPPER}`);
  const revoked = await env.REVOKE_KV.get(`revoked:${tokenHash}`);
  if (revoked) throw err("unauthorized", "Missing or invalid API key", requestId, 401);
  const row = await env.DB.prepare(`SELECT key_id, user_login, scopes, status FROM api_keys WHERE key_hash = ?`).bind(tokenHash).first();
  if (!row || row.status !== "active") throw err("unauthorized", "Missing or invalid API key", requestId, 401);
  const plan = await getPlan(env, row.user_login);
  const rl = await consumeRateLimit(env, tokenHash, plan, 1);
  if (!rl.allowed) {
    const resetSeconds = Math.ceil((rl.resetMs - Date.now()) / 1e3);
    throw err(
      "rate_limited",
      "Rate limit exceeded",
      requestId,
      429,
      {
        "Retry-After": String(Math.max(1, resetSeconds)),
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(Math.max(0, rl.remaining)),
        "X-RateLimit-Reset": String(Math.floor(rl.resetMs / 1e3))
      }
    );
  }
  env.DB.prepare(`UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key_id = ?`).bind(row.key_id).run().catch(() => {
  });
  const scopes = JSON.parse(row.scopes);
  return { user_login: row.user_login, scopes, key_id: row.key_id, plan, key_hash: tokenHash };
}
__name(authApiKey, "authApiKey");
function requireScope(scopes, needed, requestId) {
  if (!scopes.includes(needed)) throw err("forbidden", "Insufficient scope", requestId, 403);
}
__name(requireScope, "requireScope");
async function authCookieUser(req, env, requestId) {
  try {
    const user = await requireUserFromAuthCookie(req, env.JWT_SECRET);
    return { user_login: user.login };
  } catch (e) {
    throw err("unauthorized", "Unauthorized", requestId, 401);
  }
}
__name(authCookieUser, "authCookieUser");
function parseDateParam(s) {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}
__name(parseDateParam, "parseDateParam");
async function latestDate(env) {
  const row = await env.DB.prepare(`SELECT date FROM metrics_daily ORDER BY date DESC LIMIT 1`).first();
  return row?.date ?? null;
}
__name(latestDate, "latestDate");
async function getDaily(env, date) {
  const row = await env.DB.prepare(`SELECT * FROM metrics_daily WHERE date = ?`).bind(date).first();
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
__name(getDaily, "getDaily");
async function route(req, env) {
  const requestId = uuid();
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req, env) });
  if (!url.pathname.startsWith("/v1/")) {
    return err("not_found", "Not found", requestId, 404, corsHeaders(req, env));
  }
  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson(
      { ok: true, time: (/* @__PURE__ */ new Date()).toISOString(), version: "v1.0.0" },
      requestId,
      corsHeaders(req, env)
    );
  }
  if (req.method === "GET" && (url.pathname === "/v1/whoami" || url.pathname === "/v1/me")) {
    const u = await authCookieUser(req, env, requestId);
    await ensureUser(env, u.user_login);
    const plan = await getPlan(env, u.user_login);
    const entitlements = planToEntitlements(plan);
    const key = await env.DB.prepare(`
      SELECT key_id, key_prefix, scopes, status, created_at, last_used_at
      FROM api_keys
      WHERE user_login = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(u.user_login).first();
    return okJson({
      user_login: u.user_login,
      plan,
      // keep for back-compat
      entitlements,
      // ✅ this is what your front-end expects
      api_key: key ? {
        key_id: key.key_id,
        key_prefix: key.key_prefix,
        scopes: (() => {
          try {
            return JSON.parse(key.scopes);
          } catch {
            return [];
          }
        })(),
        status: key.status,
        created_at: key.created_at,
        last_used_at: key.last_used_at
      } : null
    }, requestId, corsHeaders(req, env));
  }
  if (req.method === "POST" && url.pathname === "/v1/admin/metrics/upsert") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));
    const body = await req.json().catch(() => null);
    if (!body) return err("invalid_request", "Invalid JSON body", requestId, 400, corsHeaders(req, env));
    try {
      let payload = body;
      if (typeof body?.url === "string") {
        const r = await fetch(body.url, { headers: { "Accept": "application/json" } });
        if (!r.ok) return err("invalid_request", `Failed to fetch url (status ${r.status})`, requestId, 400, corsHeaders(req, env));
        payload = await r.json();
      }
      const normalized = normalizeTradesJson(payload);
      await upsertMetricsDaily(env, normalized);
      await env.CACHE_KV.delete("metrics:latest").catch(() => {
      });
      return okJson({ ok: true, date: normalized.date, updated_at: normalized.updated_at }, requestId, corsHeaders(req, env));
    } catch (e) {
      console.error("\u274C admin/metrics/upsert failed:", e);
      return err("invalid_request", `Upsert failed: ${String(e?.message ?? e)}`, requestId, 400, corsHeaders(req, env));
    }
  }
  if (req.method === "GET" && url.pathname === "/v1/admin/debug/auth-cookie") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));
    const rawCookie = req.headers.get("Cookie") || "";
    const token = rawCookie.match(/(?:^|;\s*)auth=([^;]+)/)?.[1] ?? null;
    if (!token) return okJson({ ok: false, reason: "missing_auth_cookie", rawCookiePresent: Boolean(rawCookie) }, requestId, corsHeaders(req, env));
    const parts = token.split(".");
    if (parts.length !== 3) return okJson({ ok: false, reason: "malformed_jwt", parts: parts.length }, requestId, corsHeaders(req, env));
    const [h, p] = parts;
    const b64urlToString = /* @__PURE__ */ __name((b64url) => {
      const pad = "=".repeat((4 - b64url.length % 4) % 4);
      const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
      return atob(b64);
    }, "b64urlToString");
    let payload = null;
    try {
      payload = JSON.parse(b64urlToString(p));
    } catch {
    }
    let verified = false;
    let error = null;
    try {
      const user = await requireUserFromAuthCookie(req, env.JWT_SECRET);
      verified = true;
      return okJson({ ok: true, verified, user, payload }, requestId, corsHeaders(req, env));
    } catch (e) {
      error = String(e?.message ?? e);
    }
    return okJson({ ok: false, verified, error, payload }, requestId, corsHeaders(req, env));
  }
  if (req.method === "GET" && url.pathname === "/v1/metrics/daily") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);
    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? await latestDate(env);
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));
    const daily = await getDaily(env, date);
    if (!daily) return err("not_found", "Metrics not found", requestId, 404, corsHeaders(req, env));
    return okJson(daily, requestId, corsHeaders(req, env));
  }
  if (req.method === "GET" && url.pathname === "/v1/metrics/kpis") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);
    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? await latestDate(env);
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));
    const items = await getKpis(env, date);
    return okJson({ date, items }, requestId, corsHeaders(req, env));
  }
  if (req.method === "GET" && url.pathname === "/v1/metrics/series") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);
    const kpi = String(url.searchParams.get("kpi") ?? "").trim();
    if (!kpi) return err("invalid_request", "Missing kpi", requestId, 400, corsHeaders(req, env));
    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? await latestDate(env);
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));
    const from = url.searchParams.get("from") || void 0;
    const to = url.searchParams.get("to") || void 0;
    const limit = Number(url.searchParams.get("limit") ?? "500");
    const points = await getSeries(env, date, kpi, from, to, limit);
    return okJson({ date, kpi, points }, requestId, corsHeaders(req, env));
  }
  if (req.method === "GET" && url.pathname === "/v1/metrics/extremes") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);
    const kpi = String(url.searchParams.get("kpi") ?? "").trim();
    if (!kpi) return err("invalid_request", "Missing kpi", requestId, 400, corsHeaders(req, env));
    const sideRaw = String(url.searchParams.get("side") ?? "hi").trim().toLowerCase();
    const side = sideRaw === "lo" ? "lo" : "hi";
    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? await latestDate(env);
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));
    const limit = Number(url.searchParams.get("limit") ?? "10");
    const items = await getExtremes(env, date, kpi, side, limit);
    return okJson({ date, kpi, side, items }, requestId, corsHeaders(req, env));
  }
  if (req.method === "GET" && url.pathname === "/v1/metrics/portfolio-assets") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);
    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? await latestDate(env);
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));
    const symbol = url.searchParams.get("symbol") || void 0;
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const items = await getPortfolioAssets(env, date, symbol, limit);
    return okJson({ date, symbol: symbol ?? null, items }, requestId, corsHeaders(req, env));
  }
  if (req.method === "GET" && url.pathname === "/v1/metrics/dates") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "metrics:read", requestId);
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(200, Math.max(1, Number(limitRaw ?? "50")));
    const cursor = url.searchParams.get("cursor");
    let stmt;
    if (cursor && /^\d{4}-\d{2}-\d{2}$/.test(cursor)) {
      stmt = env.DB.prepare(`SELECT date FROM metrics_daily WHERE date < ? ORDER BY date DESC LIMIT ?`).bind(cursor, limit);
    } else {
      stmt = env.DB.prepare(`SELECT date FROM metrics_daily ORDER BY date DESC LIMIT ?`).bind(limit);
    }
    const rows = await stmt.all();
    const items = (rows.results ?? []).map((r) => ({ date: r.date }));
    const next_cursor = items.length === limit ? items[items.length - 1].date : null;
    return okJson({ items, next_cursor }, requestId, corsHeaders(req, env));
  }
  if (req.method === "GET" && url.pathname === "/v1/rss/daily") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "rss:read", requestId);
    const dateParam = parseDateParam(url.searchParams.get("date"));
    const date = dateParam ?? await latestDate(env);
    if (!date) return err("not_found", "No metrics available", requestId, 404, corsHeaders(req, env));
    const daily = await getDaily(env, date);
    if (!daily) return err("not_found", "Metrics not found", requestId, 404, corsHeaders(req, env));
    const xml = buildRss(daily);
    const h = new Headers({ "Content-Type": "application/rss+xml; charset=utf-8", ...corsHeaders(req, env) });
    withReqId(h, requestId);
    return new Response(xml, { status: 200, headers: h });
  }
  if (req.method === "POST" && url.pathname === "/v1/admin/metrics/upsert") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));
    const body = await req.json().catch(() => null);
    if (!body) return err("invalid_request", "Invalid JSON body", requestId, 400, corsHeaders(req, env));
    let payload = body;
    if (typeof body?.url === "string") {
      const u = body.url;
      if (!/^https:\/\/.+/i.test(u)) return err("invalid_request", "url must be https://", requestId, 400, corsHeaders(req, env));
      const r = await fetch(u, { headers: { "Accept": "application/json" } });
      if (!r.ok) return err("invalid_request", `Failed to fetch url (status ${r.status})`, requestId, 400, corsHeaders(req, env));
      payload = await r.json();
    }
    const normalized = normalizeTradesJson(payload);
    await upsertMetricsDaily(env, normalized);
    await env.CACHE_KV.delete("metrics:latest").catch(() => {
    });
    return okJson({ ok: true, date: normalized.date, updated_at: normalized.updated_at }, requestId, corsHeaders(req, env));
  }
  if (req.method === "POST" && url.pathname === "/v1/webhooks") {
    const auth = await authApiKey(req, env, requestId);
    requireScope(auth.scopes, "webhooks:write", requestId);
    if (auth.plan === "free") throw err("forbidden", "Webhooks require Pro or Enterprise", requestId, 403);
    const body = await req.json().catch(() => null);
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
  if (req.method === "POST" && url.pathname === "/v1/keys/issue") {
    const u = await authCookieUser(req, env, requestId);
    await ensureUser(env, u.user_login);
    const plan = await getPlan(env, u.user_login);
    const body = await req.json().catch(() => ({}));
    const scopes = Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : ["metrics:read", "rss:read"];
    const allowedScopes = /* @__PURE__ */ new Set(["metrics:read", "rss:read", "webhooks:write"]);
    for (const s of scopes) {
      if (!allowedScopes.has(s)) return err("invalid_request", `Unknown scope: ${s}`, requestId, 400, corsHeaders(req, env));
      if (s === "webhooks:write" && plan === "free") {
        return err("forbidden", "webhooks:write requires Pro or Enterprise", requestId, 403, corsHeaders(req, env));
      }
    }
    const key_id = uuid();
    const raw = `hp_live_${uuid().replaceAll("-", "")}${uuid().replaceAll("-", "")}`;
    const key_hash = await sha256Hex(`${raw}.${env.API_KEY_PEPPER}`);
    const key_prefix = raw.slice(0, 16);
    await env.DB.prepare(`
      INSERT INTO api_keys(key_id, user_login, key_prefix, key_hash, scopes, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).bind(key_id, u.user_login, key_prefix, key_hash, json(scopes)).run();
    return okJson(
      { api_key: raw, key_id, key_prefix, scopes },
      requestId,
      corsHeaders(req, env)
    );
  }
  if (req.method === "POST" && url.pathname === "/v1/keys/rotate") {
    const u = await authCookieUser(req, env, requestId);
    await ensureUser(env, u.user_login);
    const body = await req.json().catch(() => ({}));
    const revokeKeyId = body.revoke_key_id;
    const issueRes = await route(new Request(req.url.replace("/v1/keys/rotate", "/v1/keys/issue"), {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({ scopes: body.scopes })
    }), env);
    if (revokeKeyId) {
      const row = await env.DB.prepare(`SELECT key_hash FROM api_keys WHERE key_id = ? AND user_login = ? AND status = 'active'`).bind(revokeKeyId, u.user_login).first();
      if (row?.key_hash) {
        await env.DB.prepare(`UPDATE api_keys SET status='revoked', revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key_id = ?`).bind(revokeKeyId).run();
        await env.REVOKE_KV.put(`revoked:${row.key_hash}`, "1", { expirationTtl: 60 * 60 * 24 * 365 });
      }
    }
    return issueRes;
  }
  if (req.method === "POST" && url.pathname === "/v1/keys/revoke") {
    const u = await authCookieUser(req, env, requestId);
    const body = await req.json().catch(() => null);
    if (!body?.key_id) return err("invalid_request", "Missing key_id", requestId, 400, corsHeaders(req, env));
    const row = await env.DB.prepare(`SELECT key_hash FROM api_keys WHERE key_id = ? AND user_login = ? AND status='active'`).bind(body.key_id, u.user_login).first();
    if (!row) return err("not_found", "Key not found", requestId, 404, corsHeaders(req, env));
    await env.DB.prepare(`UPDATE api_keys SET status='revoked', revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key_id = ?`).bind(body.key_id).run();
    await env.REVOKE_KV.put(`revoked:${row.key_hash}`, "1", { expirationTtl: 60 * 60 * 24 * 365 });
    return okJson({ ok: true }, requestId, corsHeaders(req, env));
  }
  if (req.method === "POST" && url.pathname === "/v1/admin/plan") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));
    const body = await req.json().catch(() => null);
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
  if (req.method === "POST" && url.pathname === "/v1/admin/publish") {
    const tok = req.headers.get("X-Admin-Token") || "";
    if (!safeEqual(tok, env.ADMIN_TOKEN)) return err("forbidden", "Forbidden", requestId, 403, corsHeaders(req, env));
    const body = await req.json().catch(() => null);
    const date = parseDateParam(body?.date ?? null);
    if (!date) return err("invalid_request", "Invalid date", requestId, 400, corsHeaders(req, env));
    const event = body?.event ?? "metrics.published";
    const daily = await getDaily(env, date);
    if (!daily) return err("not_found", "Metrics not found", requestId, 404, corsHeaders(req, env));
    const hooks = await env.DB.prepare(`SELECT webhook_id, url, events_json, secret FROM webhooks WHERE status='active'`).all();
    const payload = { event, data: daily, sent_at: (/* @__PURE__ */ new Date()).toISOString() };
    const payloadStr = JSON.stringify(payload);
    const deliveries = await Promise.all((hooks.results ?? []).map(async (h) => {
      const events = JSON.parse(h.events_json);
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
      } catch (e) {
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
__name(route, "route");
var src_default = {
  async fetch(req, env) {
    try {
      return await route(req, env);
    } catch (e) {
      if (e instanceof Response) return e;
      const requestId = uuid();
      console.error("\u274C Unhandled error:", e);
      return err("internal", "Internal error", requestId, 500, corsHeaders(req, env));
    }
  }
};

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-kjJbIs/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-kjJbIs/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  RateLimiterDO,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
