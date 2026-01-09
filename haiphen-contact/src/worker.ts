// src/worker.ts
import { DurableObject } from "cloudflare:workers";

export interface Env {
  // secrets
  TURNSTILE_SECRET_KEY: string;
  SENDGRID_API_KEY: string;

  // vars
  ALLOWED_ORIGINS: string; // comma-separated
  FROM_EMAIL: string;
  FROM_NAME?: string;
  OWNER_EMAIL: string;
  TICKET_PREFIX?: string;
  SENDGRID_TEMPLATE_ID_CONFIRM?: string;
  TURNSTILE_VERIFY_URL?: string;

  // durable objects
  TICKETS: DurableObjectNamespace<TicketQueue>;
}

type ContactPayload = {
  token: string;
  name?: string;
  email?: string;
  message?: string;
  pageUrl?: string;

  // Optional fields from the frontend component:
  phone?: string;
  userAgent?: string;
  company?: string; // honeypot
};

type TicketAllocation = {
  ticketId: string;
  ticketNumber: number;
  queuePosition: number;
  receivedAtISO: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method === "POST" && url.pathname === "/api/contact") {
      const res = await handleContact(request, env);
      // ensure CORS on all responses
      return withCors(res, request, env);
    }

    return withCors(new Response("Not found", { status: 404 }), request, env);
  },
};

/**
 * Durable Object: allocates ticket numbers + queue position.
 * MUST be exported for Wrangler to deploy it.
 */
export class TicketQueue extends DurableObject {
  private static readonly KEY_COUNTER = "counter";
  private static readonly KEY_QUEUE_POS = "queue_pos";

  // IMPORTANT: Cloudflare's module DO base exposes the DurableObjectState as `this.ctx`
  // (not `this.state`).
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/allocate") {
      const body = await safeJson<{ prefix?: string }>(request);
      const prefix = (body?.prefix ?? "H").trim() || "H";

      const allocation = await this.ctx.storage.transaction(async (txn) => {
        const counter = (await txn.get<number>(TicketQueue.KEY_COUNTER)) ?? 0;
        const queuePos = (await txn.get<number>(TicketQueue.KEY_QUEUE_POS)) ?? 0;

        const nextCounter = counter + 1;
        const nextQueuePos = queuePos + 1;

        await txn.put(TicketQueue.KEY_COUNTER, nextCounter);
        await txn.put(TicketQueue.KEY_QUEUE_POS, nextQueuePos);

        const receivedAtISO = new Date().toISOString();
        const ticketId = formatTicketId(prefix, receivedAtISO, nextCounter);

        const result: TicketAllocation = {
          ticketId,
          ticketNumber: nextCounter,
          queuePosition: nextQueuePos,
          receivedAtISO,
        };
        return result;
      });

      return json(allocation, 200);
    }

    return new Response("Not found", { status: 404 });
  }
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  const payload = await safeJson<ContactPayload>(request);
  if (!payload) return json({ ok: false, error: "Invalid JSON" }, 400);

  // Normalize inputs early
  const name = (payload.name ?? "").trim();
  const userEmail = (payload.email ?? "").trim();
  const message = (payload.message ?? "").trim();
  const pageUrl = (payload.pageUrl ?? "").trim();

  // Honeypot: pretend success (don’t teach bots)
  const honeypot = String((payload as any)?.company ?? "").trim();
  if (honeypot) return json({ ok: true }, 200);

  if (!message) return json({ ok: false, error: "Message is required" }, 400);

  // ---- Turnstile or test bypass ----
  const bypassHeader = request.headers.get("x-contact-test-bypass") || "";
  const bypassOk = !!env.CONTACT_TEST_BYPASS_KEY && bypassHeader === env.CONTACT_TEST_BYPASS_KEY;

  const token = (payload.token ?? "").trim();

  if (!bypassOk) {
    if (!token) return json({ ok: false, error: "Missing Turnstile token" }, 400);

    const verified = await verifyTurnstile(env, token);
    if (!verified.ok) {
      return json({ ok: false, error: "Turnstile verification failed", details: verified.details }, 403);
    }
  } else {
    console.log("[contact] Turnstile bypass accepted (test)");
  }

  if (!message) return json({ ok: false, error: "Message is required" }, 400);

  // 2) Allocate ticket via DO
  const prefix = (env.TICKET_PREFIX ?? "H").trim() || "H";
  const ticketsId = env.TICKETS.idFromName("global");
  const stub = env.TICKETS.get(ticketsId);

  const allocationResp = await stub.fetch("https://do/allocate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prefix }),
  });

  if (!allocationResp.ok) {
    const errText = await allocationResp.text().catch(() => "");
    return json({ ok: false, error: "Ticket allocation failed", details: errText }, 502);
  }

  const ticket = (await allocationResp.json()) as TicketAllocation;

  // 3) Owner notification email (plain + html)
  const fromEmail = env.FROM_EMAIL;
  const fromName = env.FROM_NAME ?? "Haiphen";
  const ownerEmail = env.OWNER_EMAIL;

  const ownerSubject = `Haiphen contact form — ${ticket.ticketId}${name ? ` — ${name}` : ""}`;

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
    message,
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
      { type: "text/html", value: ownerHtml },
    ],
    reply_to: userEmail ? { email: userEmail, name: name || undefined } : undefined,
  });

  if (!notifyOwner.ok) {
    return json({ ok: false, error: "Owner email failed", details: notifyOwner.details }, 502);
  }

  // 4) User confirmation email via dynamic template (optional if email provided)
  const templateId = (env.SENDGRID_TEMPLATE_ID_CONFIRM ?? "").trim();
  if (templateId && userEmail) {
    const receivedAtHuman = formatReceivedAtCT(ticket.receivedAtISO);

    const confirm = await sendSendGrid(env.SENDGRID_API_KEY, {
      from: { email: fromEmail, name: fromName },
      template_id: templateId,
      personalizations: [
        {
          to: [{ email: userEmail, name: name || undefined }],
          subject: "Haiphen — we received your message",
          dynamic_template_data: {
            name: name || "there",
            ticketId: ticket.ticketId,
            receivedAt: receivedAtHuman,
            queuePosition: String(ticket.queuePosition),
            pageUrl: pageUrl || "https://haiphen.io/#contact",
          },
        },
      ],
    });

    // Don’t fail the whole request if confirmation fails; log details instead.
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
      email: userEmail || undefined,
    },
    200,
  );
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "https://haiphen.io";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
}

function withCors(res: Response, req: Request, env: Env): Response {
  const h = new Headers(res.headers);
  const cors = corsHeaders(req, env);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

async function verifyTurnstile(
  env: Env,
  token: string,
): Promise<{ ok: boolean; details?: unknown }> {
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);

  const url = env.TURNSTILE_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  const resp = await fetch(url, { method: "POST", body: form });

  const data = (await resp.json().catch(() => ({}))) as { success?: boolean; [k: string]: unknown };
  return { ok: data.success === true, details: data };
}

/** SendGrid payload (supports either content OR dynamic template). */
type SendGridRequest = {
  from: { email: string; name?: string };
  personalizations: Array<{
    to: Array<{ email: string; name?: string }>;
    subject?: string;
    dynamic_template_data?: Record<string, unknown>;
  }>;
  template_id?: string;
  content?: Array<{ type: "text/plain" | "text/html"; value: string }>;
  reply_to?: { email: string; name?: string };
};

async function sendSendGrid(apiKey: string, body: SendGridRequest): Promise<{ ok: boolean; details?: unknown }> {
  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (resp.ok) return { ok: true };

  let details: unknown = { status: resp.status };
  try {
    details = await resp.json();
  } catch {
    details = { status: resp.status, body: await resp.text().catch(() => "") };
  }
  return { ok: false, details };
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function safeJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTicketId(prefix: string, receivedAtISO: string, num: number): string {
  // Example: HPHN-2026-01-08-0001 (or H-2026-01-08-0001 based on prefix)
  const d = receivedAtISO.slice(0, 10); // YYYY-MM-DD
  const [yyyy, mm, dd] = d.split("-");
  const n = String(num).padStart(4, "0");
  const p = prefix.toUpperCase();
  // If you want exactly "HPHN", set TICKET_PREFIX=HPHN
  return `${p}-${yyyy}-${mm}-${dd}-${n}`;
}

/**
 * Human-ish timestamp. Keep it simple and deterministic.
 * (Workers don’t have full ICU in all modes; avoid fancy locale assumptions.)
 */
function formatReceivedAtCT(receivedAtISO: string): string {
  // You can later swap this for exact TZ conversion if needed.
  return receivedAtISO.replace("T", " ").replace("Z", " UTC");
}