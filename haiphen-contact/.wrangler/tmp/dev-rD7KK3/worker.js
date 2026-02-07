var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.ts
import { DurableObject } from "cloudflare:workers";
function envBool(v, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}
__name(envBool, "envBool");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (request.method === "POST" && url.pathname === "/api/contact") {
      const res = await handleContact(request, env);
      return withCors(res, request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/welcome") {
      const res = await handleWelcome(request, env);
      return withCors(res, request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/sg/events") {
      const body = await request.text();
      console.log("[sendgrid-event]", body);
      return new Response("ok");
    }
    if (request.method === "POST" && url.pathname === "/api/digest/send") {
      const res = await handleDigestSend(request, env);
      return withCors(res, request, env);
    }
    return withCors(new Response("Not found", { status: 404 }), request, env);
  },
  // ✅ Cron Trigger entrypoint
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          const when = new Date(event.scheduledTime);
          const out = await runDailyDigest(env, when);
          console.log("[digest] scheduled ok", out);
        } catch (err) {
          console.error("[digest] scheduled failed", err);
        }
      })()
    );
  }
};
async function handleWelcome(request, env) {
  const raw = await request.text();
  const sigOk = await verifyHmacRequest(request, env.WELCOME_HMAC_SECRET, raw);
  if (!sigOk) return json({ ok: false, error: "unauthorized" }, 401);
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!body) return json({ ok: false, error: "Invalid JSON" }, 400);
  const userLogin = String(body.user_login ?? "").trim();
  if (!userLogin) return json({ ok: false, error: "Missing user_login" }, 400);
  const requestId = String(body.request_id ?? "").trim() || crypto.randomUUID();
  const source = String(body.source ?? "").trim() || "unknown";
  const entitlementUpdatedAt = Number.isFinite(body.entitlement_updated_at) ? Number(body.entitlement_updated_at) : null;
  const user = await env.DB.prepare(
    `SELECT user_login, email, name FROM users WHERE user_login = ? LIMIT 1`
  ).bind(userLogin).first();
  if (!user) return json({ ok: false, error: "Unknown user" }, 404);
  const email = (user.email ?? "").trim();
  if (!email) return json({ ok: false, error: "User has no email" }, 412);
  if (envBool(env.WELCOME_REQUIRED_ENTITLEMENT, true)) {
    const ent = await env.DB.prepare(
      `SELECT active, updated_at FROM entitlements WHERE user_login = ? LIMIT 1`
    ).bind(userLogin).first();
    if (!ent || Number(ent.active) !== 1) {
      return json({ ok: false, error: "Entitlement not active" }, 412);
    }
  }
  const already = await env.DB.prepare(
    `SELECT sent_at, message_id FROM welcome_emails WHERE user_login = ? LIMIT 1`
  ).bind(userLogin).first();
  if (already) {
    return json(
      {
        ok: true,
        alreadySent: true,
        sentAt: already.sent_at,
        messageId: already.message_id ?? void 0
      },
      200
    );
  }
  const templateId = String(env.WELCOME_TEMPLATE_ID ?? "").trim();
  if (!templateId) return json({ ok: false, error: "WELCOME_TEMPLATE_ID not set" }, 500);
  const fromName = (env.WELCOME_FROM_NAME ?? env.FROM_NAME ?? "Haiphen").trim();
  const fromEmail = env.FROM_EMAIL;
  const portalUrl = (env.WELCOME_PORTAL_URL ?? "https://app.haiphen.io/#docs").trim();
  const calendarUrl = (env.WELCOME_CALENDAR_URL ?? "").trim();
  const surveyUrl = (env.WELCOME_SURVEY_URL ?? "").trim();
  const supportEmail = (env.WELCOME_SUPPORT_EMAIL ?? "pi@haiphenai.com").trim();
  const sgResp = await sendSendGrid(env.SENDGRID_API_KEY, {
    from: { email: fromEmail, name: fromName },
    template_id: templateId,
    personalizations: [
      {
        to: [{ email, name: user.name ?? void 0 }],
        subject: "Welcome to Haiphen",
        dynamic_template_data: {
          name: user.name ?? userLogin,
          user_login: userLogin,
          app_url: "https://app.haiphen.io/",
          docs_url: "https://haiphen.io/#docs",
          portal_url: portalUrl,
          calendar_url: calendarUrl,
          survey_url: surveyUrl,
          support_email: supportEmail
        }
      }
    ]
  });
  if (!sgResp.ok) {
    return json({ ok: false, error: "SendGrid send failed", details: sgResp.details }, 502);
  }
  await env.DB.prepare(
    `INSERT INTO welcome_emails(user_login, entitlement_updated_at, sent_at, message_id, source, request_id, details_json)
     VALUES (?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ','now')), ?, ?, ?, ?)`
  ).bind(
    userLogin,
    entitlementUpdatedAt,
    sgResp.messageId ?? null,
    source,
    requestId,
    JSON.stringify({ email, templateId })
  ).run();
  return json({ ok: true, alreadySent: false, messageId: sgResp.messageId ?? void 0 }, 200);
}
__name(handleWelcome, "handleWelcome");
async function verifyHmacRequest(req, secret, rawBody) {
  const ts = req.headers.get("x-haiphen-ts") ?? "";
  const sig = req.headers.get("x-haiphen-sig") ?? "";
  if (!ts || !sig) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const now = Date.now();
  if (Math.abs(now - tsNum) > 5 * 60 * 1e3) return false;
  const msg = `${ts}.${rawBody}`;
  const expected = await hmacSha256Hex(secret, msg);
  return timingSafeEqualHex(sig, expected);
}
__name(verifyHmacRequest, "verifyHmacRequest");
async function hmacSha256Hex(secret, msg) {
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
__name(hmacSha256Hex, "hmacSha256Hex");
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
__name(timingSafeEqualHex, "timingSafeEqualHex");
var TicketQueue = class _TicketQueue extends DurableObject {
  static {
    __name(this, "TicketQueue");
  }
  static KEY_COUNTER = "counter";
  static KEY_QUEUE_POS = "queue_pos";
  // IMPORTANT: Cloudflare's module DO base exposes the DurableObjectState as `this.ctx`
  // (not `this.state`).
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/allocate") {
      const body = await safeJson(request);
      const prefix = (body?.prefix ?? "H").trim() || "H";
      const allocation = await this.ctx.storage.transaction(async (txn) => {
        const counter = await txn.get(_TicketQueue.KEY_COUNTER) ?? 0;
        const queuePos = await txn.get(_TicketQueue.KEY_QUEUE_POS) ?? 0;
        const nextCounter = counter + 1;
        const nextQueuePos = queuePos + 1;
        await txn.put(_TicketQueue.KEY_COUNTER, nextCounter);
        await txn.put(_TicketQueue.KEY_QUEUE_POS, nextQueuePos);
        const receivedAtISO = (/* @__PURE__ */ new Date()).toISOString();
        const ticketId = formatTicketId(prefix, receivedAtISO, nextCounter);
        const result = {
          ticketId,
          ticketNumber: nextCounter,
          queuePosition: nextQueuePos,
          receivedAtISO
        };
        return result;
      });
      return json(allocation, 200);
    }
    return new Response("Not found", { status: 404 });
  }
};
async function handleContact(request, env) {
  const payload = await safeJson(request);
  if (!payload) return json({ ok: false, error: "Invalid JSON" }, 400);
  const name = (payload.name ?? "").trim();
  const userEmail = (payload.email ?? "").trim();
  const message = (payload.message ?? "").trim();
  const pageUrl = (payload.pageUrl ?? "").trim();
  const honeypot = String(payload?.website ?? "").trim();
  if (honeypot) {
    console.log("[contact] honeypot tripped", { pageUrl });
    return json({ ok: true }, 200);
  }
  if (!message) return json({ ok: false, error: "Message is required" }, 400);
  const bypassHeader = request.headers.get("x-contact-test-bypass") || "";
  const bypassOk = !!env.CONTACT_TEST_BYPASS_KEY && bypassHeader === env.CONTACT_TEST_BYPASS_KEY;
  const token = (payload.token ?? "").trim();
  const turnstileRequired = envBool(env.TURNSTILE_REQUIRED, false);
  if (bypassOk) {
    console.log("[contact] Turnstile bypass accepted (test)");
  } else if (turnstileRequired) {
    if (!token) return json({ ok: false, error: "Missing Turnstile token" }, 400);
    const verified = await verifyTurnstile(env, token);
    if (!verified.ok) {
      return json({ ok: false, error: "Turnstile verification failed", details: verified.details }, 403);
    }
  } else {
    console.log("[contact] Turnstile not required (TURNSTILE_REQUIRED=false)");
  }
  if (!message) return json({ ok: false, error: "Message is required" }, 400);
  const prefix = (env.TICKET_PREFIX ?? "H").trim() || "H";
  const ticketsId = env.TICKETS.idFromName("global");
  const stub = env.TICKETS.get(ticketsId);
  const allocationResp = await stub.fetch("https://do/allocate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prefix })
  });
  if (!allocationResp.ok) {
    const errText = await allocationResp.text().catch(() => "");
    return json({ ok: false, error: "Ticket allocation failed", details: errText }, 502);
  }
  const ticket = await allocationResp.json();
  const fromEmail = env.FROM_EMAIL;
  const fromName = env.FROM_NAME ?? "Haiphen";
  const ownerEmail = env.OWNER_EMAIL;
  const ownerSubject = `Haiphen contact form \u2014 ${ticket.ticketId}${name ? ` \u2014 ${name}` : ""}`;
  const ownerText = [
    "New contact form submission",
    "",
    `Ticket: ${ticket.ticketId}`,
    `Received: ${ticket.receivedAtISO}`,
    `Queue position: ${ticket.queuePosition}`,
    "",
    `Name: ${name || "(none)"}`,
    `Email: ${userEmail || "(none)"}`,
    `Page: ${pageUrl || "(unknown)"}`,
    "",
    "Message:",
    message
  ].join("\n");
  const ownerHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;">
    <h2 style="margin:0 0 12px 0;">New contact form submission</h2>
    <p style="margin:0 0 12px 0;">
      <strong>Ticket:</strong> ${escapeHtml(ticket.ticketId)}<br/>
      <strong>Received:</strong> ${escapeHtml(ticket.receivedAtISO)}<br/>
      <strong>Queue position:</strong> ${ticket.queuePosition}
    </p>
    <p style="margin:0 0 12px 0;">
      <strong>Name:</strong> ${escapeHtml(name || "(none)")}<br/>
      <strong>Email:</strong> ${escapeHtml(userEmail || "(none)")}<br/>
      <strong>Page:</strong> ${escapeHtml(pageUrl || "(unknown)")}
    </p>
    <div style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;white-space:pre-wrap;">
      ${escapeHtml(message)}
    </div>
  </div>`;
  const notifyOwner = await sendSendGrid(env.SENDGRID_API_KEY, {
    from: { email: fromEmail, name: fromName },
    personalizations: [{ to: [{ email: ownerEmail }], subject: ownerSubject }],
    content: [
      { type: "text/plain", value: ownerText },
      { type: "text/html", value: ownerHtml }
    ],
    reply_to: userEmail ? { email: userEmail, name: name || void 0 } : void 0
  });
  if (!notifyOwner.ok) {
    return json({ ok: false, error: "Owner email failed", details: notifyOwner.details }, 502);
  }
  const templateId = (env.SENDGRID_TEMPLATE_ID_CONFIRM ?? "").trim();
  if (templateId && userEmail) {
    const receivedAtHuman = formatReceivedAtCT(ticket.receivedAtISO);
    const confirm = await sendSendGrid(env.SENDGRID_API_KEY, {
      from: { email: fromEmail, name: fromName },
      template_id: templateId,
      personalizations: [
        {
          to: [{ email: userEmail, name: name || void 0 }],
          subject: "Haiphen \u2014 we received your message",
          dynamic_template_data: {
            name: name || "there",
            ticketId: ticket.ticketId,
            receivedAt: receivedAtHuman,
            queuePosition: String(ticket.queuePosition),
            pageUrl: pageUrl || "https://haiphen.io/#contact"
          }
        }
      ]
    });
    if (!confirm.ok) {
      console.log("SendGrid confirm failed:", JSON.stringify(confirm.details ?? {}, null, 2));
    }
  }
  return json(
    {
      ok: true,
      ticketId: ticket.ticketId,
      queuePosition: ticket.queuePosition,
      receivedAt: ticket.receivedAtISO,
      email: userEmail || void 0
    },
    200
  );
}
__name(handleContact, "handleContact");
function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "https://haiphen.io";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-Contact-Test-Bypass, X-Haiphen-Ts, X-Haiphen-Sig, Authorization",
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    Vary: "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function withCors(res, req, env) {
  const h = new Headers(res.headers);
  const cors = corsHeaders(req, env);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}
__name(withCors, "withCors");
async function verifyTurnstile(env, token) {
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  const url = env.TURNSTILE_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  const resp = await fetch(url, { method: "POST", body: form });
  const data = await resp.json().catch(() => ({}));
  return { ok: data.success === true, details: data };
}
__name(verifyTurnstile, "verifyTurnstile");
async function sendSendGrid(apiKey, body) {
  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const messageId = resp.headers.get("x-message-id");
  const status = resp.status;
  if (resp.ok) return { ok: true, status, messageId };
  let details = { status };
  try {
    details = await resp.json();
  } catch {
    details = { status, body: await resp.text().catch(() => "") };
  }
  return { ok: false, status, messageId, details };
}
__name(sendSendGrid, "sendSendGrid");
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");
async function safeJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
__name(safeJson, "safeJson");
function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
__name(escapeHtml, "escapeHtml");
function formatTicketId(prefix, receivedAtISO, num) {
  const d = receivedAtISO.slice(0, 10);
  const [yyyy, mm, dd] = d.split("-");
  const n = String(num).padStart(4, "0");
  const p = prefix.toUpperCase();
  return `${p}-${yyyy}-${mm}-${dd}-${n}`;
}
__name(formatTicketId, "formatTicketId");
function formatReceivedAtCT(receivedAtISO) {
  return receivedAtISO.replace("T", " ").replace("Z", " UTC");
}
__name(formatReceivedAtCT, "formatReceivedAtCT");
function yyyyMmDdUtc(d) {
  return d.toISOString().slice(0, 10);
}
__name(yyyyMmDdUtc, "yyyyMmDdUtc");
function isWeekdayUtc(d) {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}
__name(isWeekdayUtc, "isWeekdayUtc");
function formatDateLabel(d) {
  const ymd = yyyyMmDdUtc(d);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${ymd} (${day})`;
}
__name(formatDateLabel, "formatDateLabel");
function pickTopRows(rows, max = 10) {
  const arr = Array.isArray(rows) ? rows : [];
  return arr.slice(0, Math.max(1, max)).map((r) => ({
    kpi: String(r.kpi ?? "").trim(),
    value: String(r.value ?? "").trim()
  })).filter((r) => r.kpi && r.value);
}
__name(pickTopRows, "pickTopRows");
function safeParseJson(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
__name(safeParseJson, "safeParseJson");
async function fetchTradesJson(env) {
  const url = (env.TRADES_JSON_URL || "https://haiphen.io/assets/trades/trades.json").trim();
  const resp = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } });
  if (!resp.ok) throw new Error(`[digest] trades.json fetch failed: HTTP ${resp.status}`);
  const data = await resp.json();
  return data;
}
__name(fetchTradesJson, "fetchTradesJson");
async function handleDigestSend(request, env) {
  const raw = await request.text();
  const secret = (env.DIGEST_HMAC_SECRET || "").trim();
  if (!secret) return json({ ok: false, error: "DIGEST_HMAC_SECRET not set" }, 500);
  const sigOk = await verifyHmacRequest(request, secret, raw);
  if (!sigOk) return json({ ok: false, error: "unauthorized" }, 401);
  const body = raw ? safeParseJson(raw) : null;
  const now = /* @__PURE__ */ new Date();
  let when = now;
  if (body?.send_date) {
    const cand = /* @__PURE__ */ new Date(`${body.send_date}T00:00:00Z`);
    if (Number.isFinite(cand.getTime())) when = cand;
  }
  const out = await runDailyDigest(env, when);
  return json({ ok: true, ...out }, 200);
}
__name(handleDigestSend, "handleDigestSend");
async function runDailyDigest(env, when) {
  const sendDate = yyyyMmDdUtc(when);
  if (!isWeekdayUtc(when)) {
    console.log("[digest] weekend skip", { sendDate });
    return { sendDate, attempted: 0, sent: 0, skipped: 0, failed: 0 };
  }
  const templateId = String(env.SENDGRID_TEMPLATE_ID_DAILY ?? "").trim();
  if (!templateId) throw new Error("[digest] SENDGRID_TEMPLATE_ID_DAILY not set");
  const fromEmail = env.FROM_EMAIL;
  const fromName = (env.DAILY_FROM_NAME ?? env.FROM_NAME ?? "Haiphen").trim();
  const subjPrefix = (env.DAILY_SUBJECT_PREFIX ?? "Haiphen Daily").trim();
  const manageUrl = (env.PUBLIC_APP_PROFILE_URL ?? "https://haiphen.io/#profile").trim();
  const trades = await fetchTradesJson(env);
  const subs = await env.DB.prepare(
    `
    SELECT
      s.user_login AS user_login,
      u.email AS email,
      u.name AS name,
      s.prefs_json AS prefs_json
    FROM user_email_subscriptions s
    JOIN users u ON u.user_login = s.user_login
    WHERE s.list_id = 'daily_digest' AND s.active = 1
    ORDER BY s.user_login ASC
    `
  ).all();
  const rows = subs.results ?? [];
  console.log("[digest] subscribers", rows.length);
  let attempted = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const top = pickTopRows(trades.rows, 12);
  const sections = [
    {
      title: trades.headline ? String(trades.headline) : `Daily snapshot \u2014 ${sendDate}`,
      bullets: [
        trades.summary ? String(trades.summary) : "",
        ...top.map((r) => `${r.kpi}: ${r.value}`)
      ].filter(Boolean)
    }
  ];
  for (const r of rows) {
    attempted++;
    const userLogin = String(r.user_login ?? "").trim();
    const email = (r.email ?? "").trim();
    if (!userLogin || !email) {
      skipped++;
      continue;
    }
    const deliveryId = crypto.randomUUID();
    try {
      const ins = await env.DB.prepare(
        `
        INSERT INTO email_deliveries(delivery_id, user_login, list_id, send_date, status, created_at, updated_at)
        VALUES (?, ?, 'daily_digest', ?, 'queued', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now')))
        `
      ).bind(deliveryId, userLogin, sendDate).run();
      if (!ins.success) {
        skipped++;
        continue;
      }
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (/UNIQUE|constraint/i.test(msg)) {
        skipped++;
        continue;
      }
      failed++;
      console.error("[digest] delivery insert failed", { userLogin, msg });
      continue;
    }
    const prefs = safeParseJson(r.prefs_json);
    const subject = `${subjPrefix} \u2014 ${sendDate}`;
    const dynamicData = {
      name: r.name ?? userLogin,
      user_login: userLogin,
      date_label: formatDateLabel(when),
      summary: trades.summary ?? "",
      sections,
      manage_url: manageUrl,
      source: trades.source ?? "",
      updated_at: trades.updated_at ?? "",
      prefs: prefs ?? void 0
      // harmless, template can ignore
    };
    const sg = await sendSendGrid(env.SENDGRID_API_KEY, {
      from: { email: fromEmail, name: fromName },
      template_id: templateId,
      personalizations: [
        {
          to: [{ email }],
          subject,
          dynamic_template_data: dynamicData
        }
      ]
    });
    if (sg.ok) {
      sent++;
      await env.DB.prepare(
        `
        UPDATE email_deliveries
           SET status='sent', message_id=?, updated_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         WHERE delivery_id=?
        `
      ).bind(sg.messageId ?? null, deliveryId).run();
    } else {
      failed++;
      await env.DB.prepare(
        `
        UPDATE email_deliveries
           SET status='failed', error=?, updated_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         WHERE delivery_id=?
        `
      ).bind(JSON.stringify(sg.details ?? {}), deliveryId).run();
      console.error("[digest] send failed", { userLogin, details: sg.details });
    }
  }
  return { sendDate, attempted, sent, skipped, failed };
}
__name(runDailyDigest, "runDailyDigest");

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

// ../node_modules/wrangler/templates/middleware/middleware-scheduled.ts
var scheduled = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  const url = new URL(request.url);
  if (url.pathname === "/__scheduled") {
    const cron = url.searchParams.get("cron") ?? "";
    await middlewareCtx.dispatch("scheduled", { cron });
    return new Response("Ran scheduled event");
  }
  const resp = await middlewareCtx.next(request, env);
  if (request.headers.get("referer")?.endsWith("/__scheduled") && url.pathname === "/favicon.ico" && resp.status === 500) {
    return new Response(null, { status: 404 });
  }
  return resp;
}, "scheduled");
var middleware_scheduled_default = scheduled;

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

// .wrangler/tmp/bundle-cDYfFu/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_scheduled_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

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

// .wrangler/tmp/bundle-cDYfFu/middleware-loader.entry.ts
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
  TicketQueue,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
