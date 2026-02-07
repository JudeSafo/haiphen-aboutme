/* eslint-disable no-console */

import { jwtVerify } from "jose";

type WelcomeCallResult =
  | { ok: true; status: number; data: any }
  | { ok: false; status: number; data: any };
type OnboardingCallResult =
  | { ok: true; status: number; data: any }
  | { ok: false; status: number; data: any };

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function postWelcome(env: Env, payload: {
  user_login: string;
  entitlement_updated_at?: number;
  source?: string;
  request_id?: string;
}): Promise<WelcomeCallResult> {
  const contactOrigin = (env.CONTACT_ORIGIN || "").replace(/\/+$/, "");
  if (!contactOrigin) {
    console.error("welcome.misconfig", { error: "CONTACT_ORIGIN missing" });
    return { ok: false, status: 0, data: { error: "CONTACT_ORIGIN missing" } };
  }

  if (!env.WELCOME_HMAC_SECRET) {
    console.error("welcome.misconfig", { error: "WELCOME_HMAC_SECRET missing" });
    return { ok: false, status: 0, data: { error: "WELCOME_HMAC_SECRET missing" } };
  }

  const bodyObj = {
    user_login: payload.user_login,
    entitlement_updated_at: payload.entitlement_updated_at,
    source: payload.source ?? "stripe_webhook",
    request_id: payload.request_id ?? crypto.randomUUID(),
  };

  const body = JSON.stringify(bodyObj);

  const ts = String(Date.now());
  const sig = await hmacSha256Hex(env.WELCOME_HMAC_SECRET, `${ts}.${body}`);

  const url = `${contactOrigin}/api/welcome`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-haiphen-ts": ts,
        "x-haiphen-sig": sig,
      },
      body,
    });
  } catch (err: any) {
    console.error("welcome.fetch_failed", { message: err?.message ?? String(err) });
    return { ok: false, status: 0, data: { error: "fetch_failed" } };
  }

  const text = await resp.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    console.error("welcome.call_failed", { status: resp.status, data });
    return { ok: false, status: resp.status, data };
  }

  console.log("welcome.call_ok", { status: resp.status, data });
  return { ok: true, status: resp.status, data };
}

async function postOnboardingConfirm(env: Env, payload: {
  user_login: string;
  plan?: "pro" | "enterprise";
  source?: string;
  request_id?: string;
}): Promise<OnboardingCallResult> {
  const contactOrigin = (env.CONTACT_ORIGIN || "").replace(/\/+$/, "");
  if (!contactOrigin) {
    console.error("onboarding.misconfig", { error: "CONTACT_ORIGIN missing" });
    return { ok: false, status: 0, data: { error: "CONTACT_ORIGIN missing" } };
  }

  if (!env.WELCOME_HMAC_SECRET) {
    console.error("onboarding.misconfig", { error: "WELCOME_HMAC_SECRET missing" });
    return { ok: false, status: 0, data: { error: "WELCOME_HMAC_SECRET missing" } };
  }

  const bodyObj = {
    user_login: payload.user_login,
    plan: payload.plan ?? "pro",
    source: payload.source ?? "stripe_webhook",
    request_id: payload.request_id ?? crypto.randomUUID(),
  };

  const body = JSON.stringify(bodyObj);
  const ts = String(Date.now());
  const sig = await hmacSha256Hex(env.WELCOME_HMAC_SECRET, `${ts}.${body}`);

  const url = `${contactOrigin}/api/onboarding/confirm`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-haiphen-ts": ts,
        "x-haiphen-sig": sig,
      },
      body,
    });
  } catch (err: any) {
    console.error("onboarding.fetch_failed", { message: err?.message ?? String(err) });
    return { ok: false, status: 0, data: { error: "fetch_failed" } };
  }

  const text = await resp.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    console.error("onboarding.call_failed", { status: resp.status, data });
    return { ok: false, status: resp.status, data };
  }

  console.log("onboarding.call_ok", { status: resp.status, data });
  return { ok: true, status: resp.status, data };
}

export interface Env {
  DB: D1Database;
  STATUS_DO: DurableObjectNamespace;

  // ✅ add this (used in requireAuth)
  REVOKE_KV: KVNamespace;
  ENTITLE_KV: KVNamespace;
  JWT_SECRET: string;

  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PROMO_CODE_ID?: string; // e.g. "promo_1SwwX7JRL3AYFpZZN1xpLCzH"
  WELCOME_HMAC_SECRET: string;
  CONTACT_ORIGIN: string; // e.g. https://haiphen-contact.pi-307.workers.dev

  // Optional: tighten CORS / redirects
  PUBLIC_SITE_ORIGIN?: string; // e.g. https://haiphen.io
  CHECKOUT_SUCCESS_URL?: string; // e.g. https://haiphen.io/#/success
  CHECKOUT_CANCEL_URL?: string; // e.g. https://haiphen.io/#/cancel
  ONBOARDING_REDIRECT_URL?: string; // e.g. https://haiphen.io/#onboarding
}

// ── Service catalogue constants ─────────────────────────────────────────────

const VALID_SERVICE_IDS = new Set([
  "haiphen_cli", "haiphen_webapp", "daily_newsletter", "haiphen_mobile",
  "haiphen_desktop", "slackbot_discord", "haiphen_secure", "network_trace",
  "knowledge_graph", "risk_analysis", "causal_chain", "supply_chain",
]);

const WAITLIST_SERVICE_IDS = new Set([
  "haiphen_secure", "network_trace", "knowledge_graph", "risk_analysis",
  "causal_chain", "supply_chain", "haiphen_mobile", "slackbot_discord",
]);

const SERVICE_TRIAL_LIMITS: Record<string, { type: "requests" | "days"; limit: number }> = {
  haiphen_cli:     { type: "requests", limit: 100 },
  haiphen_webapp:  { type: "days",     limit: 7 },
  haiphen_mobile:  { type: "days",     limit: 14 },
  haiphen_desktop: { type: "days",     limit: 30 },
  haiphen_secure:  { type: "requests", limit: 50 },
  network_trace:   { type: "requests", limit: 10 },
  knowledge_graph: { type: "requests", limit: 1000 },
  risk_analysis:   { type: "requests", limit: 25 },
  causal_chain:    { type: "requests", limit: 10 },
  supply_chain:    { type: "requests", limit: 5 },
};

interface ServiceCheckoutRequest {
  service_id: string;
  price_lookup_key: string;
  return_url?: string;
}

interface WaitlistRequest {
  email: string;
  service_id: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

function badRequest(msg: string, extras?: Record<string, unknown>) {
  return json({ ok: false, error: msg, ...(extras ?? {}) }, { status: 400 });
}

function unauthorized(msg = "Unauthorized") {
  return json({ ok: false, error: msg }, { status: 401 });
}

function isBrowserNav(req: Request): boolean {
  const dest = (req.headers.get("sec-fetch-dest") ?? "").toLowerCase();
  const mode = (req.headers.get("sec-fetch-mode") ?? "").toLowerCase();
  const accept = (req.headers.get("accept") ?? "").toLowerCase();
  return dest === "document" || mode === "navigate" || accept.includes("text/html");
}

function safeReturnTo(env: Env, raw: string | null): string {
  const fallback = env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io";

  if (!raw) return fallback;

  try {
    const u = new URL(raw);

    // Require https
    if (u.protocol !== "https:") return fallback;

    // Allow only haiphen.io and subdomains
    const host = u.hostname.toLowerCase();
    if (host === "haiphen.io" || host.endsWith(".haiphen.io")) return u.toString();
  } catch {
    // If it's not a full URL, reject it (avoid open redirects)
  }

  return fallback;
}

type AccessState = {
  entitled: boolean;
  plan: "free" | "pro" | "enterprise";
  planActive: boolean;
  entitlementActive: boolean;
};

function toOnboardingPlan(plan: "free" | "pro" | "enterprise"): "pro" | "enterprise" {
  return plan === "enterprise" ? "enterprise" : "pro";
}

function onboardingRedirectUrl(env: Env): string {
  const raw = String(env.ONBOARDING_REDIRECT_URL ?? "https://haiphen.io/#onboarding").trim();
  if (!raw) return "https://haiphen.io/#onboarding";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return "https://haiphen.io/#onboarding";
    const host = u.hostname.toLowerCase();
    if (host === "haiphen.io" || host.endsWith(".haiphen.io")) return u.toString();
  } catch {
    // fall through
  }
  return "https://haiphen.io/#onboarding";
}

async function getAccessState(env: Env, userLogin: string): Promise<AccessState> {
  const row = await env.DB.prepare(
    `SELECT
       COALESCE(p.plan, 'free') AS plan,
       COALESCE(p.active, 0) AS plan_active,
       COALESCE(e.active, 0) AS ent_active
     FROM users u
     LEFT JOIN plans p ON p.user_login = u.user_login
     LEFT JOIN entitlements e ON e.user_login = u.user_login
     WHERE u.user_login = ?
     LIMIT 1`
  )
    .bind(userLogin)
    .first<{ plan: string; plan_active: number; ent_active: number }>();

  const normalizedPlan =
    row?.plan === "pro" || row?.plan === "enterprise" ? row.plan : "free";
  const planActive = Number(row?.plan_active ?? 0) === 1;
  const entitlementActive = Number(row?.ent_active ?? 0) === 1;
  const entitled = entitlementActive || (planActive && normalizedPlan !== "free");

  return {
    entitled,
    plan: normalizedPlan,
    planActive,
    entitlementActive,
  };
}

function redirect(url: string, status: 302 | 303 = 302): Response {
  return new Response(null, { status, headers: { Location: url } });
}

function getFullRequestUrl(req: Request): string {
  return new URL(req.url).toString();
}

/**
 * Builds an auth login URL that returns back to the *current* URL.
 * This preserves the "continue to checkout" intent across OAuth.
 */
function buildLoginUrlToSelf(req: Request): string {
  const authOrigin = "https://auth.haiphen.io";
  const returnTo = getFullRequestUrl(req);
  return `${authOrigin}/login?to=${encodeURIComponent(returnTo)}`;
}

type CheckoutSessionArgs = {
  priceId: string;
  plan?: string;
  tosVersion: string;
};

async function createStripeCheckoutSession(
  env: Env,
  authed: Authed,
  args: CheckoutSessionArgs
): Promise<{ checkoutId: string; stripeSessionId: string; stripeUrl: string }> {
  const { priceId, plan, tosVersion } = args;

  // Enforce ToS acceptance (same as your POST route)
  await requireTosAccepted(env, authed.userLogin, tosVersion);

  const checkoutId = crypto.randomUUID();

  const successUrl =
    env.CHECKOUT_SUCCESS_URL ??
    `${env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io"}/?checkout=success`;

  const cancelUrl =
    env.CHECKOUT_CANCEL_URL ??
    `${env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io"}/?checkout=cancel`;

  // Persist "pending" first
  await env.DB.prepare(
    `INSERT INTO checkout_sessions (checkout_id, user_login, status, created_at, updated_at)
     VALUES (?, ?, 'created', unixepoch(), unixepoch())`
  )
    .bind(checkoutId, authed.userLogin)
    .run();

  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("success_url", `${successUrl}&checkout_id=${checkoutId}`);
  form.set("cancel_url", `${cancelUrl}&checkout_id=${checkoutId}`);

  // tie Stripe session back to our checkout_id
  form.set("client_reference_id", checkoutId);

  // line item
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");

  // Optional: pre-apply a promotion code (configured in env)
  const promoId = String(env.STRIPE_PROMO_CODE_ID ?? "").trim();
  if (promoId) {
    form.set("discounts[0][promotion_code]", promoId);
  }

  // metadata
  form.set("metadata[user_login]", authed.userLogin);
  form.set("metadata[checkout_id]", checkoutId);
  form.set("metadata[tos_version]", tosVersion);
  if (plan) form.set("metadata[plan]", plan);

  form.set("subscription_data[metadata][user_login]", authed.userLogin);
  form.set("subscription_data[metadata][checkout_id]", checkoutId);
  form.set("subscription_data[metadata][tos_version]", tosVersion);
  if (plan) form.set("subscription_data[metadata][plan]", plan);

  const session = await stripePostForm(env, "/v1/checkout/sessions", form);

  await env.DB.prepare(
    `UPDATE checkout_sessions
     SET stripe_session_id = ?, status='stripe_session_created', updated_at=unixepoch()
     WHERE checkout_id = ?`
  )
    .bind(session.id, checkoutId)
    .run();

  await broadcastStatus(env, checkoutId, {
    type: "checkout.created",
    checkout_id: checkoutId,
    stripe_session_id: session.id,
    ts: Date.now(),
  });

  return {
    checkoutId,
    stripeSessionId: session.id,
    stripeUrl: session.url,
  };
}

function buildLoginUrl(env: Env, req: Request): string {
  const authOrigin = "https://auth.haiphen.io";
  const url = new URL(req.url);
  // Client can provide the UI return location
  const returnTo = safeReturnTo(env, url.searchParams.get("return_to"));
  return `${authOrigin}/login?to=${encodeURIComponent(returnTo)}`;
}

function corsHeaders(env: Env, req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";

  const allowedOrigins = [
    env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io",
    "https://haiphen.io",
    "https://www.haiphen.io",
    "https://app.haiphen.io",
    "https://auth.haiphen.io",
  ];

  // Allow localhost origins for local development
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    allowedOrigins.push(origin);
  }

  const allowOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : "https://haiphen.io";

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "vary": "origin",
  };
}

async function readJson<T>(req: Request): Promise<T> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    throw new Error(`Expected application/json, got: ${ct}`);
  }
  return (await req.json()) as T;
}

function getCookieValue(header: string | null, key: string): string | null {
  return header?.match(new RegExp(`${key}=([^;]+)`))?.[1] ?? null;
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

type Authed = {
  userLogin: string;
  email?: string | null;
  sub: string;
  jti?: string | null;
  exp?: number | null;
  iat?: number | null;
};

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

async function requireAuth(req: Request, env: Env): Promise<Authed> {
  const cookieHeader = req.headers.get("cookie");
  const cookieJwt = getCookieValue(cookieHeader, "auth");
  const bearerJwt = getBearerToken(req);

  const token = cookieJwt ?? bearerJwt;

  console.log("auth.debug", {
    hasCookieHeader: Boolean(cookieHeader),
    hasAuthCookie: Boolean(cookieJwt),
    hasBearer: Boolean(bearerJwt),
    tokenSource: cookieJwt ? "cookie" : bearerJwt ? "bearer" : "none",
    tokenLen: token?.length ?? 0,
    origin: req.headers.get("origin"),
    host: new URL(req.url).host,
    path: new URL(req.url).pathname,
  });

  if (!token) {
    const e = new Error("unauthorized: Missing auth token");
    (e as any).status = 401;
    throw e;
  }

  const key = new TextEncoder().encode(env.JWT_SECRET);

  let payload: any;
  try {
    const verified = await jwtVerify(token, key, {
      audience: "haiphen-auth",
      algorithms: ["HS256"],
    });
    payload = verified.payload as any;

    console.log("auth.verified", {
      sub: payload?.sub,
      aud: payload?.aud,
      jti: payload?.jti ? String(payload.jti).slice(0, 8) + "…" : null,
      exp: payload?.exp,
      iat: payload?.iat,
    });
  } catch (err: any) {
    console.error("auth.verify_failed", { message: err?.message ?? String(err) });
    const e = new Error("unauthorized: Invalid token");
    (e as any).status = 401;
    throw e;
  }

  // ---- Claim extraction (be tolerant of older/newer token shapes) ----
  const sub = asString(payload?.sub);
  const userLogin =
    asString(payload?.user_login) ??
    asString(payload?.login) ??
    sub;

  // NOTE: your example token has email: null. Do NOT treat null email as unauthorized.
  const email = (typeof payload?.email === "string" ? payload.email : null);

  const jti = asString(payload?.jti);
  const exp = asNumber(payload?.exp);
  const iat = asNumber(payload?.iat);

  if (!userLogin) {
    console.error("auth.bad_claims", { hasSub: Boolean(sub), hasUserLogin: Boolean(payload?.user_login) });
    const e = new Error("unauthorized: Missing subject");
    (e as any).status = 401;
    throw e;
  }

  // ---- Revocation check (fail closed) ----
  if (!jti) {
    console.error("auth.missing_jti");
    const e = new Error("unauthorized: Token missing jti claim");
    (e as any).status = 401;
    throw e;
  }
  if (!env.REVOKE_KV) {
    console.error("auth.revoke_kv_unbound");
    const e = new Error("unauthorized: REVOKE_KV binding not available");
    (e as any).status = 401;
    throw e;
  }
  const revoked = await env.REVOKE_KV.get(`revoke:${jti}`);
  if (revoked) {
    console.warn("auth.revoked", { jti: jti.slice(0, 8) + "…" });
    const e = new Error("unauthorized: Revoked token");
    (e as any).status = 401;
    throw e;
  }

  return { userLogin, email, sub: sub ?? userLogin, jti, exp, iat };
}


/**
 * Stripe helpers: minimal fetch wrapper.
 */
async function stripePostForm(
  env: Env,
  path: string,
  form: URLSearchParams
): Promise<any> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.error("Stripe error", res.status, data);
    throw new Error(
      `Stripe error ${res.status}: ${data?.error?.message ?? "unknown"}`
    );
  }
  return data;
}

/**
 * Stripe webhook signature verification (v1).
 * We compute HMAC-SHA256 over `${t}.${rawBody}` and compare with any v1 signature.
 */
async function verifyStripeWebhook(
  env: Env,
  req: Request,
  rawBody: string
): Promise<{ ok: true; event: any } | { ok: false; error: string }> {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return { ok: false, error: "Missing stripe-signature header" };

  const parts = Object.fromEntries(
    sig.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k.trim(), (v ?? "").trim()];
    })
  );

  const t = parts["t"];
  if (!t) return { ok: false, error: "Missing timestamp (t=) in signature" };

  const ts = Number(t);
  if (!Number.isFinite(ts)) return { ok: false, error: "Invalid timestamp (t=)" };
  // 5 minute tolerance (adjust if needed)
  const now = Math.floor(Date.now() / 1000);
  const toleranceSec = 5 * 60;
  if (Math.abs(now - ts) > toleranceSec) {
    return { ok: false, error: "Timestamp outside tolerance" };
  }

  const v1s = sig
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1="))
    .map((s) => s.slice(3));

  if (v1s.length === 0) {
    return { ok: false, error: "No v1 signatures found" };
  }

  const signedPayload = `${t}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const match = v1s.some((v1) => timingSafeEqualHex(v1, expected));
  if (!match) return { ok: false, error: "Invalid Stripe signature" };

  // Stripe event is JSON
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }

  return { ok: true, event };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  // constant-time compare on equal length strings
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/**
 * Durable Object: broadcasts status updates to all websocket clients for a checkout_id.
 */
export class StatusDO {
  private state: DurableObjectState;
  private sockets: Set<WebSocket>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sockets = new Set();
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.headers.get("upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      this.sockets.add(server);

      server.addEventListener("close", () => this.sockets.delete(server));
      server.addEventListener("error", () => this.sockets.delete(server));

      // Optional hello
      server.send(JSON.stringify({ type: "hello", ts: Date.now() }));

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith("/broadcast") && req.method === "POST") {
      const payload = await req.text();
      for (const ws of this.sockets) {
        try {
          ws.send(payload);
        } catch {
          // drop on error
          this.sockets.delete(ws);
        }
      }
      return json({ ok: true, sent: this.sockets.size });
    }

    return json({ ok: false, error: "Not found" }, { status: 404 });
  }
}

async function broadcastStatus(env: Env, checkoutId: string, msg: any) {
  const id = env.STATUS_DO.idFromName(checkoutId);
  const stub = env.STATUS_DO.get(id);
  await stub.fetch("https://do/broadcast", {
    method: "POST",
    body: JSON.stringify(msg),
  });
}

function getClientIp(req: Request): string | null {
  // Cloudflare usually sets cf-connecting-ip
  return (
    req.headers.get("cf-connecting-ip") ??
    (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null)
  );
}

async function requireTosAccepted(
  env: Env,
  userLogin: string,
  tosVersion: string,
): Promise<void> {
  // Ensure the document exists (prevents accepting nonsense versions)
  const doc = await env.DB.prepare(
    `SELECT tos_version, content_sha256 FROM tos_documents WHERE tos_version = ?`
  ).bind(tosVersion).first<{ tos_version: string; content_sha256: string }>();

  if (!doc) {
    const e = new Error(`Unknown tos_version: ${tosVersion}`);
    (e as any).status = 400;
    throw e;
  }

  const acceptance = await env.DB.prepare(
    `SELECT 1
       FROM tos_acceptances
      WHERE user_login = ? AND tos_version = ?
      LIMIT 1`
  ).bind(userLogin, tosVersion).first();

  if (!acceptance) {
    const e = new Error("tos_required");
    (e as any).status = 412; // Precondition Failed
    (e as any).extras = { tos_version: tosVersion };
    throw e;
  }
}

async function dedupeStripeEvent(env: Env, event: any): Promise<{ deduped: boolean; eventId: string | null }> {
  const eventId = typeof event?.id === "string" ? event.id : null;
  if (!eventId) return { deduped: false, eventId: null };

  const type = typeof event?.type === "string" ? event.type : null;
  const created = typeof event?.created === "number" ? event.created : null;

  // Atomic insert-first dedupe. If it already exists, changes === 0.
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO stripe_webhook_events (event_id, type, created, processed_at)
     VALUES (?, ?, ?, unixepoch())`
  )
    .bind(eventId, type, created)
    .run();

  const deduped = (res?.meta?.changes ?? 0) === 0;
  return { deduped, eventId };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    }

    const h = corsHeaders(env, req);

    try {
      // Health
      if (url.pathname === "/health") {
        return json({ ok: true, service: "haiphen-checkout" }, { headers: h });
      }

      // Websocket stream: /v1/checkout/stream?checkout_id=...
      if (url.pathname === "/v1/checkout/stream") {
        const checkoutId = url.searchParams.get("checkout_id");
        if (!checkoutId) return badRequest("Missing checkout_id");

        // Optional: gate stream by JWT too (recommended)
        await requireAuth(req, env);

        const id = env.STATUS_DO.idFromName(checkoutId);
        const stub = env.STATUS_DO.get(id);

        // hand off websocket upgrade to DO
        return stub.fetch(req);
      }

      // Browser entrypoint: redirects to auth if needed, otherwise redirects to Stripe Checkout.
      if (url.pathname === "/v1/checkout/start" && req.method === "GET") {
        // Must be a browser navigation — this endpoint returns redirects, not JSON.
        // If someone calls it via fetch(), it will still work, but redirects may not be followed as expected.
        const priceId = (url.searchParams.get("price_id") ?? "").trim();
        if (!priceId) return badRequest("Missing price_id");

        const plan = (url.searchParams.get("plan") ?? "").trim() || undefined;
        const tosVersion = (url.searchParams.get("tos_version") ?? "sla_v0.2_2026-01-22").trim();

        let authed: Authed;
        try {
          authed = await requireAuth(req, env);
        } catch {
          // Not logged in → go to auth, then return right back here (same URL).
          return redirect(buildLoginUrlToSelf(req), 302);
        }

        const access = await getAccessState(env, authed.userLogin);
        if (access.entitled) {
          // Manual entitlement path (no Stripe webhook) should still emit onboarding email once.
          ctx.waitUntil(
            postOnboardingConfirm(env, {
              user_login: authed.userLogin,
              plan: toOnboardingPlan(access.plan),
              source: "checkout_start_entitled",
              request_id: `entitled:${authed.userLogin}:start`,
            })
          );
          return redirect(onboardingRedirectUrl(env), 302);
        }

        try {
          const out = await createStripeCheckoutSession(env, authed, { priceId, plan, tosVersion });
          // Logged in + ToS ok → go to Stripe
          return redirect(out.stripeUrl, 302);
        } catch (err: any) {
          // If ToS required (412), send user to docs page (or a dedicated ToS screen),
          // carrying the "resume" URL so after acceptance you can continue.
          const msg = err?.message ?? String(err);
          const status = Number.isInteger(err?.status) ? err.status : 500;

          if (status === 412 && msg === "tos_required") {
            const resume = encodeURIComponent(getFullRequestUrl(req));
            const tosV = encodeURIComponent((err as any)?.extras?.tos_version ?? tosVersion);
            return redirect(
              `https://haiphen.io/#services?tos=required&tos_version=${tosV}&resume=${resume}`,
              302
            );
          }

          console.error("checkout.start error:", msg);
          return json({ ok: false, error: msg }, { status, headers: corsHeaders(env, req) });
        }
      }

      // Create checkout session
      // POST /v1/checkout/session  { price_id, plan?, tos_version? }
      if (url.pathname === "/v1/checkout/session" && req.method === "POST") {
        const authed = await requireAuth(req, env);
        const access = await getAccessState(env, authed.userLogin);
        if (access.entitled) {
          // Programmatic callers should also fire onboarding confirm when already entitled.
          ctx.waitUntil(
            postOnboardingConfirm(env, {
              user_login: authed.userLogin,
              plan: toOnboardingPlan(access.plan),
              source: "checkout_session_entitled",
              request_id: `entitled:${authed.userLogin}:session`,
            })
          );
          return json(
            {
              ok: false,
              error: "already_entitled",
              redirect_url: onboardingRedirectUrl(env),
            },
            { status: 409, headers: h },
          );
        }

        type CheckoutSessionBody = {
          price_id: string;
          plan?: string;
          tos_version?: string;
        };

        const body = await readJson<CheckoutSessionBody>(req);

        const priceId = (body.price_id ?? "").trim();
        if (!priceId) return badRequest("Missing price_id");

        const plan = (body.plan ?? "").trim() || undefined;

        // ✅ enforce ToS acceptance here
        const tosVersion = (body.tos_version ?? "sla_v0.2_2026-01-22").trim();
        await requireTosAccepted(env, authed.userLogin, tosVersion);

        const checkoutId = crypto.randomUUID();

        const successUrl =
          env.CHECKOUT_SUCCESS_URL ??
          `${env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io"}/?checkout=success`;

        const cancelUrl =
          env.CHECKOUT_CANCEL_URL ??
          `${env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io"}/?checkout=cancel`;

        // Persist "pending" first (stable id even if Stripe flakes)
        await env.DB.prepare(
          `INSERT INTO checkout_sessions (checkout_id, user_login, status, created_at, updated_at)
           VALUES (?, ?, 'created', unixepoch(), unixepoch())`
        )
          .bind(checkoutId, authed.userLogin)
          .run();

        const form = new URLSearchParams();
        form.set("mode", "subscription");
        form.set("success_url", `${successUrl}&checkout_id=${checkoutId}`);
        form.set("cancel_url", `${cancelUrl}&checkout_id=${checkoutId}`);

        // tie Stripe session back to our checkout_id
        form.set("client_reference_id", checkoutId);

        // One line item with a Stripe Price ID
        form.set("line_items[0][price]", priceId);
        form.set("line_items[0][quantity]", "1");

        // Optional: pre-apply a promotion code (configured in env)
        const promoId = String(env.STRIPE_PROMO_CODE_ID ?? "").trim();
        if (promoId) {
          form.set("discounts[0][promotion_code]", promoId);
        }

        // metadata for webhook + auditability
        form.set("metadata[user_login]", authed.userLogin);
        form.set("metadata[checkout_id]", checkoutId);
        form.set("metadata[tos_version]", tosVersion);
        if (plan) form.set("metadata[plan]", plan);

        // Also attach metadata to the subscription object itself (useful for downstream events).
        form.set("subscription_data[metadata][user_login]", authed.userLogin);
        form.set("subscription_data[metadata][checkout_id]", checkoutId);
        form.set("subscription_data[metadata][tos_version]", tosVersion);
        if (plan) form.set("subscription_data[metadata][plan]", plan);

        // Optional but often helpful:
        // If your Stripe settings allow incomplete payments, this makes Stripe require a payment method up front.
        // (Stripe may ignore depending on account settings / API version.)
        // form.set("payment_method_collection", "always");
        const session = await stripePostForm(env, "/v1/checkout/sessions", form);

        await env.DB.prepare(
          `UPDATE checkout_sessions
           SET stripe_session_id = ?, status='stripe_session_created', updated_at=unixepoch()
           WHERE checkout_id = ?`
        )
          .bind(session.id, checkoutId)
          .run();

        await broadcastStatus(env, checkoutId, {
          type: "checkout.created",
          checkout_id: checkoutId,
          stripe_session_id: session.id,
          ts: Date.now(),
        });

        return json(
          {
            ok: true,
            checkout_id: checkoutId,
            stripe_session_id: session.id,
            url: session.url,
          },
          { headers: h }
        );
      }

      // GET /v1/auth/require -> 200 if logged in, else 401 { login_url }
      if (url.pathname === "/v1/auth/require" && req.method === "GET") {
        const h = corsHeaders(env, req);
        try {
          const authed = await requireAuth(req, env);
          const returnTo = safeReturnTo(env, url.searchParams.get("return_to"));
          const access = await getAccessState(env, authed.userLogin);

          return json(
            {
              ok: true,
              user: { login: authed.userLogin, email: authed.email },
              return_to: returnTo,
              entitled: access.entitled,
              redirect_url: access.entitled ? onboardingRedirectUrl(env) : null,
            },
            { status: 200, headers: h }
          );
        } catch (err: any) {
          const status = Number(err?.status) === 401 || Number(err?.status) === 403 ? Number(err.status) : 401;
          const loginUrl = buildLoginUrl(env, req);

          return json(
            { ok: false, error: "unauthorized", login_url: loginUrl },
            { status, headers: h }
          );
        }
      }

      // Poll status
      // GET /v1/checkout/status?checkout_id=...
      if (url.pathname === "/v1/checkout/status" && req.method === "GET") {
        await requireAuth(req, env);
        const checkoutId = url.searchParams.get("checkout_id");
        if (!checkoutId) return badRequest("Missing checkout_id");

        const row = await env.DB.prepare(
          `SELECT checkout_id, status, stripe_session_id, created_at, updated_at
           FROM checkout_sessions WHERE checkout_id = ?`
        )
          .bind(checkoutId)
          .first();

        if (!row) return json({ ok: false, error: "Not found" }, { status: 404, headers: h });
        return json({ ok: true, ...row }, { headers: h });
      }
      // POST /v1/tos/accept { tos_version, origin? }
      if (url.pathname === "/v1/tos/accept" && req.method === "POST") {
        const authed = await requireAuth(req, env);

        const body = await readJson<{
          tos_version: string;
          origin?: string;
          content_url?: string;
          page_url?: string;
        }>(req);
        const tosVersion = (body.tos_version ?? "").trim();
        if (!tosVersion) return badRequest("Missing tos_version");

        const doc = await env.DB.prepare(
          `SELECT tos_version, content_sha256 FROM tos_documents WHERE tos_version = ?`
        ).bind(tosVersion).first<{ tos_version: string; content_sha256: string }>();

        if (!doc) return badRequest("Unknown tos_version", { tos_version: tosVersion });

        const acceptanceId = crypto.randomUUID();
        const ip = getClientIp(req);
        const ua = req.headers.get("user-agent");
        const origin = (body.origin ?? req.headers.get("origin") ?? "").trim() || null;

        await env.DB.prepare(
          `INSERT INTO tos_acceptances (
              acceptance_id, user_login, tos_version, content_sha256, ip, user_agent, origin
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            acceptanceId,
            authed.userLogin,
            doc.tos_version,
            doc.content_sha256,
            ip,
            ua,
            origin,
          )
          .run();

        return json(
          { ok: true, acceptance_id: acceptanceId, tos_version: doc.tos_version },
          { headers: h },
        );
      }
      // Stripe webhook
      // POST /v1/stripe/webhook (raw body)
      if (url.pathname === "/v1/stripe/webhook" && req.method === "POST") {
        const rawBody = await req.text();

        const verified = await verifyStripeWebhook(env, req, rawBody);
        if (!verified.ok) {
          console.error("Webhook verify failed:", verified.error);
          return json({ ok: false, error: verified.error }, { status: 400 });
        }

        const event = verified.event;

        // ✅ DEDUPE HERE (after verify, before doing anything)
        const { deduped, eventId } = await dedupeStripeEvent(env, event);
        if (deduped) {
          console.log("stripe.webhook.duplicate", { eventId, type: event?.type });
          return json({ ok: true, deduped: true });
        }

        // Minimal routing
        const type = event.type as string;
        const obj = event.data?.object;

        if (type === "checkout.session.completed") {
          const userLogin = obj?.metadata?.user_login as string | undefined;
          const rawPlan = String(obj?.metadata?.plan ?? "").trim().toLowerCase();
          const normalizedPlan: "pro" | "enterprise" =
            rawPlan === "enterprise" ? "enterprise" : "pro";
        
          const checkoutId =
            (obj?.client_reference_id as string | undefined) ??
            (obj?.metadata?.checkout_id as string | undefined);
        
          if (checkoutId) {
            await env.DB.prepare(
              `UPDATE checkout_sessions
               SET status='completed', updated_at=unixepoch()
               WHERE checkout_id = ?`
            )
              .bind(checkoutId)
              .run();
        
            await broadcastStatus(env, checkoutId, {
              type: "checkout.completed",
              checkout_id: checkoutId,
              stripe_session_id: obj?.id,
              ts: Date.now(),
            });
          }
        
          if (userLogin) {
            // 1) Flip entitlement on
            await env.DB.prepare(
              `INSERT INTO entitlements (user_login, active, updated_at)
               VALUES (?, 1, unixepoch())
               ON CONFLICT(user_login) DO UPDATE SET active=1, updated_at=unixepoch()`
            )
              .bind(userLogin)
              .run();

            // 1b) Keep plans table in sync with entitlements for API gating.
            await env.DB.prepare(
              `INSERT INTO plans (user_login, plan, active, updated_at)
               VALUES (?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
               ON CONFLICT(user_login) DO UPDATE SET
                 plan = excluded.plan,
                 active = 1,
                 updated_at = excluded.updated_at`
            )
              .bind(userLogin, normalizedPlan)
              .run();
             
              // NEW: KV gate for app/auth
              await env.ENTITLE_KV.put(`paid:${userLogin}`, "1");

              
            // 2) Read back updated_at (optional, but useful for logging)
            const ent = await env.DB.prepare(
              `SELECT updated_at FROM entitlements WHERE user_login = ? LIMIT 1`
            )
              .bind(userLogin)
              .first<{ updated_at: number }>();
        
            // 3) Call haiphen-contact welcome endpoint (do NOT throw)
            await postWelcome(env, {
              user_login: userLogin,
              entitlement_updated_at: ent?.updated_at ?? undefined,
              source: "stripe_webhook",
              request_id: checkoutId ? `checkout:${checkoutId}` : undefined,
            });
            await postOnboardingConfirm(env, {
              user_login: userLogin,
              plan: normalizedPlan,
              source: "stripe_webhook",
              request_id: checkoutId ? `checkout:${checkoutId}:onboarding` : undefined,
            });
          } else {
            console.warn("stripe.checkout_completed_missing_user_login", {
              stripe_session_id: obj?.id,
              checkout_id: checkoutId ?? null,
            });
          }

          // Service subscription tracking
          const serviceId = obj?.metadata?.service_id as string | undefined;
          if (userLogin && serviceId && VALID_SERVICE_IDS.has(serviceId)) {
            await env.DB.prepare(
              `INSERT INTO service_subscriptions (user_login, service_id, stripe_subscription_id, stripe_customer_id, status, current_period_start, updated_at)
               VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
               ON CONFLICT(user_login, service_id) DO UPDATE SET
                 stripe_subscription_id = excluded.stripe_subscription_id,
                 stripe_customer_id = excluded.stripe_customer_id,
                 status = 'active',
                 current_period_start = excluded.current_period_start,
                 updated_at = excluded.updated_at`
            )
              .bind(
                userLogin,
                serviceId,
                obj?.subscription ?? null,
                obj?.customer ?? null,
              )
              .run();
            console.log("service_subscription.activated", { userLogin, serviceId });
          }
        }

        // Handle subscription status changes
        if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
          const subId = obj?.id as string | undefined;
          const subStatus = obj?.status as string | undefined;
          const serviceId = obj?.metadata?.service_id as string | undefined;

          if (subId && subStatus) {
            const mappedStatus =
              subStatus === "active" ? "active" :
              subStatus === "trialing" ? "trialing" :
              subStatus === "past_due" ? "past_due" :
              subStatus === "canceled" || type === "customer.subscription.deleted" ? "canceled" :
              subStatus === "paused" ? "paused" : null;

            if (mappedStatus) {
              const periodEnd = obj?.current_period_end
                ? new Date(obj.current_period_end * 1000).toISOString()
                : null;

              await env.DB.prepare(
                `UPDATE service_subscriptions
                 SET status = ?, current_period_end = ?, updated_at = datetime('now')
                 WHERE stripe_subscription_id = ?`
              )
                .bind(mappedStatus, periodEnd, subId)
                .run();

              console.log("service_subscription.status_updated", {
                subId,
                serviceId,
                status: mappedStatus,
              });
            }
          }
        }

        return json({ ok: true });
      }

      // ── Service-aware checkout ────────────────────────────────────────────
      // POST /v1/checkout/service { service_id, price_lookup_key, return_url? }
      if (url.pathname === "/v1/checkout/service" && req.method === "POST") {
        const authed = await requireAuth(req, env);
        const body = await readJson<ServiceCheckoutRequest>(req);

        const serviceId = (body.service_id ?? "").trim();
        if (!serviceId || !VALID_SERVICE_IDS.has(serviceId)) {
          return badRequest("Invalid service_id");
        }

        const lookupKey = (body.price_lookup_key ?? "").trim();
        if (!lookupKey) return badRequest("Missing price_lookup_key");

        // Check for existing active subscription
        const existingSub = await env.DB.prepare(
          `SELECT status, trial_requests_used, trial_requests_limit, trial_ends_at
           FROM service_subscriptions
           WHERE user_login = ? AND service_id = ? AND status IN ('active','trialing')
           LIMIT 1`
        )
          .bind(authed.userLogin, serviceId)
          .first<{ status: string; trial_requests_used: number; trial_requests_limit: number; trial_ends_at: string | null }>();

        if (existingSub && existingSub.status === "active") {
          return json(
            { ok: false, error: "already_subscribed", service_id: serviceId },
            { status: 409, headers: h },
          );
        }

        // Check trial eligibility
        const trialConfig = SERVICE_TRIAL_LIMITS[serviceId];
        if (trialConfig && !existingSub) {
          const trialEndsAt = trialConfig.type === "days"
            ? new Date(Date.now() + trialConfig.limit * 86400000).toISOString()
            : null;

          await env.DB.prepare(
            `INSERT INTO service_subscriptions (user_login, service_id, status, trial_requests_limit, trial_ends_at, updated_at)
             VALUES (?, ?, 'trialing', ?, ?, datetime('now'))
             ON CONFLICT(user_login, service_id) DO UPDATE SET
               status = 'trialing',
               trial_requests_limit = excluded.trial_requests_limit,
               trial_ends_at = excluded.trial_ends_at,
               updated_at = excluded.updated_at`
          )
            .bind(
              authed.userLogin,
              serviceId,
              trialConfig.type === "requests" ? trialConfig.limit : 0,
              trialEndsAt,
            )
            .run();

          return json(
            {
              ok: true,
              trial: true,
              service_id: serviceId,
              trial_type: trialConfig.type,
              trial_limit: trialConfig.limit,
              trial_ends_at: trialEndsAt,
            },
            { headers: h },
          );
        }

        // Resolve price from lookup_key
        const priceRes = await fetch(
          `https://api.stripe.com/v1/prices?lookup_keys=${encodeURIComponent(lookupKey)}&limit=1`,
          { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } },
        );
        const priceData = await priceRes.json() as any;
        const priceId = priceData?.data?.[0]?.id;
        if (!priceId) {
          return badRequest("Price not found for lookup_key", { lookup_key: lookupKey });
        }

        // Create Stripe checkout session with service metadata
        const checkoutId = crypto.randomUUID();
        const successUrl =
          env.CHECKOUT_SUCCESS_URL ??
          `${env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io"}/?checkout=success`;
        const cancelUrl =
          env.CHECKOUT_CANCEL_URL ??
          `${env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io"}/?checkout=cancel`;

        await env.DB.prepare(
          `INSERT INTO checkout_sessions (checkout_id, user_login, status, created_at, updated_at)
           VALUES (?, ?, 'created', unixepoch(), unixepoch())`
        )
          .bind(checkoutId, authed.userLogin)
          .run();

        const form = new URLSearchParams();
        form.set("mode", "subscription");
        form.set("success_url", `${successUrl}&checkout_id=${checkoutId}&service_id=${serviceId}`);
        form.set("cancel_url", `${cancelUrl}&checkout_id=${checkoutId}`);
        form.set("client_reference_id", checkoutId);
        form.set("line_items[0][price]", priceId);
        form.set("line_items[0][quantity]", "1");

        const promoId = String(env.STRIPE_PROMO_CODE_ID ?? "").trim();
        if (promoId) form.set("discounts[0][promotion_code]", promoId);

        form.set("metadata[user_login]", authed.userLogin);
        form.set("metadata[checkout_id]", checkoutId);
        form.set("metadata[service_id]", serviceId);
        form.set("subscription_data[metadata][user_login]", authed.userLogin);
        form.set("subscription_data[metadata][checkout_id]", checkoutId);
        form.set("subscription_data[metadata][service_id]", serviceId);

        const session = await stripePostForm(env, "/v1/checkout/sessions", form);

        await env.DB.prepare(
          `UPDATE checkout_sessions
           SET stripe_session_id = ?, status='stripe_session_created', updated_at=unixepoch()
           WHERE checkout_id = ?`
        )
          .bind(session.id, checkoutId)
          .run();

        return json(
          {
            ok: true,
            checkout_id: checkoutId,
            stripe_session_id: session.id,
            url: session.url,
            service_id: serviceId,
          },
          { headers: h },
        );
      }

      // ── Waitlist for coming-soon services ─────────────────────────────────
      // POST /v1/waitlist { email, service_id }
      if (url.pathname === "/v1/waitlist" && req.method === "POST") {
        const body = await readJson<WaitlistRequest>(req);

        const email = (body.email ?? "").trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return badRequest("Invalid email address");
        }

        const serviceId = (body.service_id ?? "").trim();
        if (!serviceId || !WAITLIST_SERVICE_IDS.has(serviceId)) {
          return badRequest("Invalid or non-waitlist service_id");
        }

        const listId = `waitlist_${serviceId}`;

        await env.DB.prepare(
          `INSERT INTO email_list_subscribers (email, list_id, active, source, updated_at)
           VALUES (?, ?, 1, 'services_waitlist', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           ON CONFLICT(email, list_id) DO UPDATE SET
             active = 1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
        )
          .bind(email, listId)
          .run();

        console.log("waitlist.signup", { email: email.slice(0, 3) + "***", serviceId, listId });

        return json(
          { ok: true, service_id: serviceId, message: "You'll be notified when this service launches." },
          { headers: h },
        );
      }

      return json({ ok: false, error: "Not found" }, { status: 404, headers: h });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const status =
        Number.isInteger(err?.status)
          ? err.status
          : (msg.toLowerCase().startsWith("unauthorized:") ? 401 : 500);

      const loginUrl = status === 401 ? buildLoginUrl(env, req) : undefined;

      console.error("Request error:", msg);

      // If someone *navigates* to the API endpoint (rare), you can redirect.
      // For fetch/XHR, return JSON with a login_url the client can act on.
      if (status === 401 && isBrowserNav(req) && loginUrl) {
        return new Response(null, { status: 302, headers: { Location: loginUrl } });
      }

      return json(
        {
          ok: false,
          error: msg,
          ...(err?.extras ?? {}),
          ...(loginUrl ? { login_url: loginUrl } : {}),
        },
        { status, headers: h },
      );
    }
  },
};
