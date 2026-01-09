/* eslint-disable no-console */

import { jwtVerify } from "jose";

export interface Env {
  DB: D1Database;
  STATUS_DO: DurableObjectNamespace;

  JWT_SECRET: string;

  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;

  // Optional: tighten CORS / redirects
  PUBLIC_SITE_ORIGIN?: string; // e.g. https://haiphen.io
  CHECKOUT_SUCCESS_URL?: string; // e.g. https://haiphen.io/#/success
  CHECKOUT_CANCEL_URL?: string; // e.g. https://haiphen.io/#/cancel
}

type Authed = { userId: string; email?: string };

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

function corsHeaders(env: Env, req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const allow =
    env.PUBLIC_SITE_ORIGIN && origin === env.PUBLIC_SITE_ORIGIN
      ? origin
      : env.PUBLIC_SITE_ORIGIN ?? "*";

  return {
    "access-control-allow-origin": allow,
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

type Authed = { userId: string; email?: string };

function getCookieValue(header: string | null, key: string): string | null {
  return header?.match(new RegExp(`${key}=([^;]+)`))?.[1] ?? null;
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireAuth(req: Request, env: Env): Promise<Authed> {
  // Prefer cookie-based auth (matches your browser flow)
  const cookieJwt = getCookieValue(req.headers.get("cookie"), "auth");
  const bearerJwt = getBearerToken(req);

  const token = cookieJwt ?? bearerJwt;
  if (!token) {
    // IMPORTANT: throw a typed error so we return 401 not 500
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
    payload = verified.payload;
  } catch (err) {
    const e = new Error("unauthorized: Invalid token");
    (e as any).status = 401;
    throw e;
  }

  // Revocation check (same semantics as haiphen-auth)
  if (payload?.jti) {
    const revoked = await env.REVOKE_KV.get(`revoke:${payload.jti}`);
    if (revoked) {
      const e = new Error("unauthorized: Token revoked");
      (e as any).status = 401;
      throw e;
    }
  }

  const userId = (payload.sub as string | undefined) ?? (payload.user_id as string | undefined);
  if (!userId) {
    const e = new Error("unauthorized: JWT missing sub");
    (e as any).status = 401;
    throw e;
  }

  return { userId, email: payload.email as string | undefined };
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
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

      // Create checkout session
      // POST /v1/checkout/session  { price_id, plan? }
      if (url.pathname === "/v1/checkout/session" && req.method === "POST") {
        const authed = await requireAuth(req, env);

        const body = await readJson<{ price_id: string; plan?: string }>(req);
        if (!body.price_id) return badRequest("Missing price_id");

        const checkoutId = crypto.randomUUID();
        const successUrl =
          env.CHECKOUT_SUCCESS_URL ??
          `${env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io"}/?checkout=success`;
        const cancelUrl =
          env.CHECKOUT_CANCEL_URL ??
          `${env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io"}/?checkout=cancel`;

        // Persist "pending" first (gives us a stable id even if Stripe flakes)
        await env.DB.prepare(
          `INSERT INTO checkout_sessions (checkout_id, user_id, status, created_at, updated_at)
           VALUES (?, ?, 'created', unixepoch(), unixepoch())`
        )
          .bind(checkoutId, authed.userId)
          .run();

        const form = new URLSearchParams();
        form.set("mode", "payment"); // or "subscription"
        form.set("success_url", `${successUrl}&checkout_id=${checkoutId}`);
        form.set("cancel_url", `${cancelUrl}&checkout_id=${checkoutId}`);

        form.set("client_reference_id", checkoutId);

        // One line item with a Stripe Price ID
        form.set("line_items[0][price]", body.price_id);
        form.set("line_items[0][quantity]", "1");

        // metadata (shows up in Stripe Dashboard + webhook payload)
        form.set("metadata[user_id]", authed.userId);
        if (body.plan) form.set("metadata[plan]", body.plan);

        const session = await stripePostForm(env, "/v1/checkout/sessions", form);

        await env.DB.prepare(
          `UPDATE checkout_sessions
           SET stripe_session_id = ?, status='stripe_session_created', updated_at=unixepoch()
           WHERE checkout_id = ?`
        )
          .bind(session.id, checkoutId)
          .run();

        // notify any listeners
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
            url: session.url, // redirect user here
          },
          { headers: h }
        );
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

        // Minimal routing
        const type = event.type as string;
        const obj = event.data?.object;

        if (type === "checkout.session.completed") {
          const checkoutId =
            (obj?.client_reference_id as string | undefined) ??
            (obj?.metadata?.checkout_id as string | undefined);

          const userId = obj?.metadata?.user_id as string | undefined;

          if (checkoutId) {
            await env.DB.prepare(
              `UPDATE checkout_sessions
               SET status='completed', updated_at=unixepoch()
               WHERE checkout_id = ?`
            )
              .bind(checkoutId)
              .run();

            // Example entitlement write (customize to your model)
            if (userId) {
              await env.DB.prepare(
                `INSERT INTO entitlements (user_id, active, updated_at)
                 VALUES (?, 1, unixepoch())
                 ON CONFLICT(user_id) DO UPDATE SET active=1, updated_at=unixepoch()`
              )
                .bind(userId)
                .run();
            }

            await broadcastStatus(env, checkoutId, {
              type: "checkout.completed",
              checkout_id: checkoutId,
              stripe_session_id: obj?.id,
              ts: Date.now(),
            });
          }
        }

        return json({ ok: true });
      }

      return json({ ok: false, error: "Not found" }, { status: 404, headers: h });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const status = Number.isInteger(err?.status) ? err.status : (msg.toLowerCase().startsWith("unauthorized:") ? 401 : 500);
      console.error("Request error:", msg);
      return json({ ok: false, error: msg }, { status, headers: h });
    }
  },
};