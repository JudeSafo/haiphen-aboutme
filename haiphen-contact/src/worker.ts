// src/worker.ts
import { DurableObject } from "cloudflare:workers";
const BUILD_ID = "haiphen-contact@2026-01-26Tdebug-1";

export interface Env {
  // secrets
  TURNSTILE_SECRET_KEY: string;
  SENDGRID_API_KEY: string;

  CONTACT_TEST_BYPASS_KEY?: string;
  COHORT_FROM_NAME?: string;
  COHORT_OWNER_SUBJECT_PREFIX?: string; // default "Haiphen Cohort"
  COHORT_CONFIRM_SUBJECT?: string;      // default "Haiphen — cohort survey received"
  COHORT_TEMPLATE_ID_CONFIRM?: string; // SendGrid dynamic template id for cohort confirmation

  DB: D1Database;
  WELCOME_HMAC_SECRET: string;        // secret
  WELCOME_TEMPLATE_ID?: string;       // var
  WELCOME_REQUIRED_ENTITLEMENT?: string; // var "true"/"false"
  WELCOME_FROM_NAME?: string;         // var
  WELCOME_PORTAL_URL?: string;
  WELCOME_CALENDAR_URL?: string;
  WELCOME_SURVEY_URL?: string;
  WELCOME_SUPPORT_EMAIL?: string;
  WELCOME_TOS_PDF_URL?: string;   // e.g. https://haiphen.io/assets/legal/Haiphen_Service_Agreement_sla_v0.2_2026-01-22.pdf
  WELCOME_TOS_VERSION?: string;   // e.g. sla_v0.2_2026-01-22
  WELCOME_TOS_EFFECTIVE?: string; // e.g. 2026-01-22
  WELCOME_LEGAL_TERMS_URL?: string; // e.g. https://haiphen.io/terms.html
  ONBOARDING_TEMPLATE_ID?: string;
  ONBOARDING_APP_URL?: string;
  ONBOARDING_DOCS_URL?: string;
  ONBOARDING_PROFILE_URL?: string;
  ONBOARDING_COHORT_URL?: string;
  ONBOARDING_URL?: string;
  ONBOARDING_CALENDAR_URL?: string;
  ONBOARDING_SUPPORT_EMAIL?: string;
  ONBOARDING_API_BASE_URL?: string;
  ONBOARDING_CLI_DOCS_URL?: string;
  ONBOARDING_WEBSOCKET_URL?: string;

  // Purchase confirmation
  PURCHASE_TEMPLATE_ID?: string;
  PURCHASE_FROM_NAME?: string;

  // Trial expiry
  TRIAL_EXPIRING_TEMPLATE_ID?: string;
  TRIAL_FROM_NAME?: string;

  // Usage alert
  USAGE_ALERT_TEMPLATE_ID?: string;
  USAGE_FROM_NAME?: string;

  // vars
  ALLOWED_ORIGINS: string;
  FROM_EMAIL: string;
  FROM_NAME?: string;
  OWNER_EMAIL: string;
  TICKET_PREFIX?: string;
  SENDGRID_TEMPLATE_ID_CONFIRM?: string;
  TURNSTILE_VERIFY_URL?: string;

  // NEW
  TURNSTILE_REQUIRED?: string; // "true" | "false"

  // durable objects
  TICKETS: DurableObjectNamespace<TicketQueue>;

  JWT_SECRET: string;
  REVOKE_KV: KVNamespace;

  // Digest (you already created the secret)
  DIGEST_HMAC_SECRET: string;

  // Prospect outreach HMAC (shared with haiphen-api INTERNAL_TOKEN)
  PROSPECT_HMAC_SECRET?: string;

  // Digest template + config
  SENDGRID_TEMPLATE_ID_DAILY?: string; // add as [vars]
  DAILY_FROM_NAME?: string;
  DAILY_SUBJECT_PREFIX?: string;
  PUBLIC_APP_PROFILE_URL?: string;  
  TRADES_JSON_URL?: string;
}

/* ── IP-based rate limiter (in-memory, per-isolate) ── */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_CONTACT = 5; // 5 contact form submissions per minute per IP
const _rl = new Map<string, { ts: number; count: number }>();

function rateLimit(ip: string, max: number): boolean {
  const now = Date.now();
  let entry = _rl.get(ip);
  if (!entry || now - entry.ts > RATE_WINDOW_MS) {
    entry = { ts: now, count: 0 };
  }
  entry.count++;
  _rl.set(ip, entry);
  if (_rl.size > 500) {
    for (const [k, v] of _rl) {
      if (now - v.ts > RATE_WINDOW_MS) _rl.delete(k);
    }
  }
  return entry.count > max;
}

function getBuildId(env: Env): string {
  // Optional override via env var later (e.g. set in wrangler.toml [vars])
  const v = (env as any)?.BUILD_ID;
  return typeof v === "string" && v.trim() ? v.trim() : BUILD_ID;
}

function debugHttp(env: Env): boolean {
  // Default OFF in prod; turn on only when needed.
  // Set with wrangler.toml: DEBUG_HTTP="true"
  const v = (env as any)?.DEBUG_HTTP;
  return envBool(typeof v === "string" ? v : undefined, false);
}

function envBool(v: string | undefined, def = false): boolean {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isAllowedOrigin(req: Request, env: Env): boolean {
  const origin = req.headers.get("Origin") || "";
  if (!origin) return false; // require Origin for cookie-auth endpoints

  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return allowed.includes(origin);
}

// Add near SendGridRequest type
type SendGridAttachment = {
  content: string; // base64
  filename: string;
  type?: string; // e.g. "application/pdf"
  disposition?: "attachment" | "inline";
};

type CohortPayload = {
  token?: string; // optional turnstile if you later enable
  pageUrl?: string;
  userAgent?: string;
  website?: string; // honeypot

  // identity
  name?: string;
  email?: string;
  occupation?: string;
  education?: string;
  linkedin?: string;

  // answers
  financial_affiliation?: string; // multiple choice-ish
  broker?: string;
  entrepreneurial_background?: string;
  sigint_familiarity?: string;
  trading_experience?: string;
  retirement_portfolio?: string;
  tech_background?: string;
  macro_interest?: string;

  // subscribe
  subscribeDaily?: boolean;
};

const SUBSCRIPTION_LISTS = ["daily_digest", "weekly_summary", "product_updates", "cohort_comms"] as const;
type SubscriptionListId = typeof SUBSCRIPTION_LISTS[number];

const SUBSCRIPTION_LABELS: Record<SubscriptionListId, string> = {
  daily_digest: "Daily Market Digest",
  weekly_summary: "Weekly Performance Summary",
  product_updates: "Product Updates & Announcements",
  cohort_comms: "Cohort Program Communications",
};

type SubscriptionPreferences = {
  daily_digest: boolean;
  weekly_summary: boolean;
  product_updates: boolean;
  cohort_comms: boolean;
};

type SubscriptionPreferencesRequest =
  | { preferences?: Partial<SubscriptionPreferences> }
  | Partial<SubscriptionPreferences>;

type AuthClaims = {
  sub: string;
  name?: string | null;
  avatar?: string | null;
  email?: string | null;
  aud?: string | null;
  exp?: number;
  jti?: string;
};

type AuthedUser = {
  user_login: string;
  name?: string | null;
  avatar?: string | null;
  email?: string | null;
};

const COHORT_SCHEMA_VERSION = "v2_2026-02-11";

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
  attachments?: SendGridAttachment[];
};

type ContactPayload = {
  token: string;
  name?: string;
  email?: string;
  message?: string;
  pageUrl?: string;

  // Optional fields from the frontend component:
  phone?: string;
  userAgent?: string;
  website?: string; // honeypot
};

type TicketAllocation = {
  ticketId: string;
  ticketNumber: number;
  queuePosition: number;
  receivedAtISO: string;
};

function normPath(p: string): string {
  const collapsed = p.replace(/\/{2,}/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
}

function debugNotFound(req: Request, url: URL, path: string): Response {
  const body = {
    ok: false,
    error: "Not found",
    build: BUILD_ID,
    seen: {
      method: req.method,
      url: url.toString(),
      host: req.headers.get("host"),
      pathname: url.pathname,
      normalized: path,
      search: url.search,
    },
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: 404,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-haiphen-build": BUILD_ID,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = normPath(url.pathname);

    const build = getBuildId(env);

    if (debugHttp(env)) {
      console.log("[http] enter", {
        build,
        method: request.method,
        path,
        rawPath: url.pathname,
        search: url.search,
        host: request.headers.get("host"),
      });
    }

    try {
      if (request.method === "OPTIONS") {
        return withCorsAndBuild(new Response(null, { status: 204 }), request, env, path);
      }

      // Optional: keep /__id if you like; if not, remove it.
      // If you keep it, update it to use `build`:
      if (request.method === "GET" && path === "/__id") {
        const res = new Response(
          JSON.stringify(
            {
              ok: true,
              build,
              now: new Date().toISOString(),
              host: request.headers.get("host"),
              rawPath: url.pathname,
              path,
            },
            null,
            2,
          ),
          { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
        );
        return withCorsAndBuild(res, request, env, path);
      }

      if (request.method === "GET" && path === "/api/health") {
        const res = jsonWithBuild(
          {
            ok: true,
            build,
            now: new Date().toISOString(),
            seen: { host: request.headers.get("host"), path, rawPath: url.pathname, search: url.search },
          },
          200,
        );
        return withCorsAndBuild(res, request, env, path);
      }

      let res: Response;

      if ((request.method === "GET" || request.method === "POST") && path === "/preferences/subscriptions") {
        // CSRF/Origin gate: this endpoint is authenticated by cookie.
        if (!isAllowedOrigin(request, env)) {
          res = json({ ok: false, error: "Forbidden origin" }, 403);
        } else {
          res = await handleSubscriptionPreferences(request, env);
        }
      } else if (request.method === "POST" && path === "/api/cohort/submit") {
        res = await handleCohortSubmit(request, env);
      } else if (request.method === "POST" && path === "/api/contact") {
        res = await handleContact(request, env);
      } else if (request.method === "POST" && path === "/api/welcome") {
        res = await handleWelcome(request, env);
      } else if (request.method === "POST" && path === "/api/onboarding/confirm") {
        res = await handleOnboardingConfirm(request, env);
      } else if (request.method === "POST" && path === "/api/sg/events") {
        const body = await request.text();
        // Keep this log (useful), but only when debug enabled:
        if (debugHttp(env)) console.log("[sendgrid-event]", { build, path, body });
        res = new Response("ok", { status: 200 });
      } else if (request.method === "POST" && path === "/api/digest/send") {
        res = await handleDigestSend(request, env);
      } else if (request.method === "POST" && path === "/api/purchase/confirm") {
        res = await handlePurchaseConfirm(request, env);
      } else if (request.method === "POST" && path === "/api/trial/expiring") {
        res = await handleTrialExpiring(request, env);
      } else if (request.method === "POST" && path === "/api/usage/alert") {
        res = await handleUsageAlert(request, env);
      } else if (request.method === "POST" && path === "/api/prospect/outreach/send") {
        res = await handleProspectOutreachSend(request, env);
      } else {
        res = debugNotFound(request, url, path);
      }

      return withCorsAndBuild(res, request, env, path);
    } catch (err) {
      console.error("[http] unhandled", err, { build, path });

      return withCorsAndBuild(
        jsonWithBuild(
          {
            ok: false,
            error: "Unhandled exception",
            build,
            path,
          },
          500,
        ),
        request,
        env,
        path,
      );
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        try {
          const when = new Date(event.scheduledTime);
          const out = await runDailyDigest(env, when);
          console.log("[digest] scheduled ok", out, { build: BUILD_ID });
        } catch (err) {
          console.error("[digest] scheduled failed", err, { build: BUILD_ID });
        }
      })(),
    );
  },
};

type WelcomePayload = {
  user_login: string;
  request_id?: string;
  source?: string; // e.g. "stripe_webhook"
  entitlement_updated_at?: number; // unixepoch
};

type OnboardingConfirmPayload = {
  user_login: string;
  plan?: "pro" | "enterprise";
  request_id?: string;
  source?: string;
};

async function fetchPdfAsBase64(url: string): Promise<{ base64: string; bytes: number }> {
  const resp = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } as any });
  if (!resp.ok) throw new Error(`tos pdf fetch failed: HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const bytes = buf.byteLength;

  // Safety: keep attachments small (SendGrid supports attachments but don’t push it)
  if (bytes > 7_000_000) throw new Error(`tos pdf too large: ${bytes} bytes`);

  // base64 encode
  const u8 = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  const base64 = btoa(bin);
  return { base64, bytes };
}

async function handleCohortSubmit(request: Request, env: Env): Promise<Response> {
  const payload = await safeJson<CohortPayload>(request);
  if (!payload) return json({ ok: false, error: "Invalid JSON" }, 400);

  // Honeypot
  const honeypot = String((payload as any)?.website ?? "").trim();
  if (honeypot) {
    console.log("[cohort] honeypot tripped");
    return json({ ok: true }, 200);
  }

  // Normalize
  const name = String(payload.name ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const occupation = String(payload.occupation ?? "").trim();
  const education = String(payload.education ?? "").trim();
  const linkedin = String(payload.linkedin ?? "").trim();
  const pageUrl = String(payload.pageUrl ?? "").trim();
  const userAgent = String(payload.userAgent ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Valid email is required" }, 400);
  }

  // Turnstile (optional) — reuse your existing toggle if you want later:
  // if (envBool(env.TURNSTILE_REQUIRED, false)) { ... verifyTurnstile ... }

  const answers = {
    financial_affiliation: String(payload.financial_affiliation ?? "").trim(),
    broker: String(payload.broker ?? "").trim(),
    entrepreneurial_background: String(payload.entrepreneurial_background ?? "").trim(),
    sigint_familiarity: String(payload.sigint_familiarity ?? "").trim(),
    trading_experience: String(payload.trading_experience ?? "").trim(),
    retirement_portfolio: String(payload.retirement_portfolio ?? "").trim(),
    tech_background: String(payload.tech_background ?? "").trim(),
    macro_interest: String(payload.macro_interest ?? "").trim(),
  };

  // Basic “must answer something” guard
  const answeredCount = Object.values(answers).filter((v) => String(v || "").trim().length > 0).length;
  if (answeredCount < 2) {
    return json({ ok: false, error: "Please answer at least a couple questions." }, 400);
  }

  const subscribeDaily = !!payload.subscribeDaily;
  const submissionId = crypto.randomUUID();

  // Persist submission
  await env.DB.prepare(
    `
    INSERT INTO cohort_submissions(
      submission_id, source_page_url, user_agent,
      name, email, occupation, education, linkedin,
      schema_version, answers_json, subscribe_daily
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      submissionId,
      pageUrl || null,
      userAgent || null,
      name || null,
      email,
      occupation || null,
      education || null,
      linkedin || null,
      COHORT_SCHEMA_VERSION,
      JSON.stringify(answers),
      subscribeDaily ? 1 : 0,
    )
    .run();

  // Optional: subscribe the email to daily_digest list (email-only)
  if (subscribeDaily) {
    await env.DB.prepare(
      `
      INSERT INTO email_list_subscribers(email, list_id, active, name, source, created_at, updated_at)
      VALUES (?, 'daily_digest', 1, ?, 'cohort_survey',
              (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
              (strftime('%Y-%m-%dT%H:%M:%fZ','now')))
      ON CONFLICT(email, list_id)
      DO UPDATE SET
        active=1,
        name=COALESCE(excluded.name, email_list_subscribers.name),
        updated_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      `
    ).bind(email, name || null).run();
  }

  // Emails
  const fromEmail = env.FROM_EMAIL;
  const fromName = (env.COHORT_FROM_NAME ?? env.FROM_NAME ?? "Haiphen").trim();
  const ownerEmail = env.OWNER_EMAIL;

  const ownerSubjectPrefix = (env.COHORT_OWNER_SUBJECT_PREFIX ?? "Haiphen Cohort").trim();
  const ownerSubject = `${ownerSubjectPrefix} — ${submissionId}${name ? ` — ${name}` : ""}`;

  const lines = [
    "New cohort survey submission",
    "",
    `Submission: ${submissionId}`,
    `Schema: ${COHORT_SCHEMA_VERSION}`,
    `Email: ${email}`,
    `Name: ${name || "(none)"}`,
    `Occupation: ${occupation || "(none)"}`,
    `Education: ${education || "(none)"}`,
    `LinkedIn: ${linkedin || "(none)"}`,
    `Subscribe daily: ${subscribeDaily ? "yes" : "no"}`,
    `Page: ${pageUrl || "(unknown)"}`,
    "",
    "Answers:",
    `1) Financial background: ${answers.financial_affiliation || "(empty)"}`,
    `2) Broker: ${answers.broker || "(empty)"}`,
    `3) Entrepreneurial background: ${answers.entrepreneurial_background || "(empty)"}`,
    `4) Signals intelligence familiarity: ${answers.sigint_familiarity || "(empty)"}`,
    `5) Trading experience: ${answers.trading_experience || "(empty)"}`,
    `6) Retirement/portfolio: ${answers.retirement_portfolio || "(empty)"}`,
    `7) Tech background: ${answers.tech_background || "(empty)"}`,
    `8) Macro/banking interest: ${answers.macro_interest || "(empty)"}`,
  ];

  const ownerText = lines.join("\n");
  const ownerHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;">
    <h2 style="margin:0 0 12px 0;">New cohort survey submission</h2>
    <p style="margin:0 0 12px 0;">
      <strong>Submission:</strong> ${escapeHtml(submissionId)}<br/>
      <strong>Schema:</strong> ${escapeHtml(COHORT_SCHEMA_VERSION)}<br/>
      <strong>Email:</strong> ${escapeHtml(email)}<br/>
      <strong>Name:</strong> ${escapeHtml(name || "(none)")}<br/>
      <strong>Occupation:</strong> ${escapeHtml(occupation || "(none)")}<br/>
      <strong>Education:</strong> ${escapeHtml(education || "(none)")}<br/>
      <strong>LinkedIn:</strong> ${escapeHtml(linkedin || "(none)")}<br/>
      <strong>Subscribe daily:</strong> ${subscribeDaily ? "yes" : "no"}<br/>
      <strong>Page:</strong> ${escapeHtml(pageUrl || "(unknown)")}
    </p>
    <div style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;white-space:pre-wrap;">
${escapeHtml(lines.slice(lines.indexOf("Answers:") + 1).join("\n"))}
    </div>
  </div>`;

  const ownerSend = await sendSendGrid(env.SENDGRID_API_KEY, {
    from: { email: fromEmail, name: fromName },
    personalizations: [{ to: [{ email: ownerEmail }], subject: ownerSubject }],
    content: [
      { type: "text/plain", value: ownerText },
      { type: "text/html", value: ownerHtml },
    ],
    reply_to: { email, name: name || undefined },
  });

  if (!ownerSend.ok) {
    console.error("[cohort] owner email failed", {
      status: ownerSend.status,
      details: ownerSend.details,
    });
    return json({ ok: false, error: "Owner email failed", details: ownerSend.details }, 502);
  }

  const confirmSubject = (env.COHORT_CONFIRM_SUBJECT ?? "Haiphen — cohort survey received").trim();

  // User confirmation (best-effort) — send EITHER the dynamic template OR the plain fallback.
  const cohortTemplateId = String(env.COHORT_TEMPLATE_ID_CONFIRM ?? "").trim();

  if (cohortTemplateId) {
    const dynamic = {
      name: name || "there",
      email,
      submission_id: submissionId,
      received_at: new Date().toISOString(),
      subscribed_daily: subscribeDaily,
      next_steps: {
        calendar_url: env.WELCOME_CALENDAR_URL ?? "https://calendar.app.google/jQzWz98eCC5jMLrQA",
        // IMPORTANT: make this a real URL you actually want the button to hit
        program_url: "https://haiphen.io/#cohort",
        docs_url: "https://haiphen.io/#docs",
        reply_email: env.WELCOME_SUPPORT_EMAIL ?? "pi@haiphenai.com",
      },
      responses: [
        { q: "Financial background/affiliation/literacy", a: answers.financial_affiliation || "" },
        { q: "What broker do you use?", a: answers.broker || "" },
        { q: "Entrepreneurial background", a: answers.entrepreneurial_background || "" },
        { q: "Familiarity with signals intelligence companies", a: answers.sigint_familiarity || "" },
        { q: "Trading experience", a: answers.trading_experience || "" },
        { q: "Retirement plans / portfolio diversity", a: answers.retirement_portfolio || "" },
        { q: "Tech background", a: answers.tech_background || "" },
        { q: "Interest in US economy / banking / macro", a: answers.macro_interest || "" },
      ],
    };

    const confirm = await sendSendGrid(env.SENDGRID_API_KEY, {
      from: { email: fromEmail, name: fromName },
      template_id: cohortTemplateId,
      personalizations: [
        {
          to: [{ email, name: name || undefined }],
          subject: confirmSubject,
          dynamic_template_data: dynamic,
        },
      ],
      reply_to: { email: env.OWNER_EMAIL, name: fromName },
    });

    if (!confirm.ok) {
      console.log("[cohort] user confirm (template) failed", JSON.stringify(confirm.details ?? {}, null, 2));
      // NOTE: I’m intentionally NOT falling back to the plain email here to avoid doubles.
      // If you want fallback-on-error, do it explicitly with a guard and a log line.
    }
  } else {
    // Plain fallback only when no template is configured
    const userText = [
      `Thanks${name ? `, ${name}` : ""} — we received your cohort survey.`,
      "",
      `Submission: ${submissionId}`,
      `Subscribe daily: ${subscribeDaily ? "yes" : "no"}`,
      "",
      "If you want to update anything, just reply to this email.",
    ].join("\n");

    const userHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.55;">
      <h2 style="margin:0 0 10px 0;">We received your cohort survey</h2>
      <p style="margin:0 0 10px 0;">Thanks${name ? `, <strong>${escapeHtml(name)}</strong>` : ""}.</p>
      <p style="margin:0 0 10px 0;">
        <strong>Submission:</strong> ${escapeHtml(submissionId)}<br/>
        <strong>Subscribe daily:</strong> ${subscribeDaily ? "yes" : "no"}
      </p>
      <p style="margin:0;">If you want to update anything, reply to this email.</p>
    </div>`;

    const fallback = await sendSendGrid(env.SENDGRID_API_KEY, {
      from: { email: fromEmail, name: fromName },
      personalizations: [{ to: [{ email }], subject: confirmSubject }],
      content: [
        { type: "text/plain", value: userText },
        { type: "text/html", value: userHtml },
      ],
      reply_to: { email: env.OWNER_EMAIL, name: fromName },
    });

    if (!fallback.ok) {
      console.log("[cohort] user confirm (fallback) failed", JSON.stringify(fallback.details ?? {}, null, 2));
    }
  }

  return json(
    {
      ok: true,
      submissionId,
      subscribed: subscribeDaily,
      receivedAt: new Date().toISOString(),
    },
    200,
  );
}

async function handleWelcome(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();

  // 1) Verify caller signature (checkout -> contact)
  const sigOk = await verifyHmacRequest(request, env.WELCOME_HMAC_SECRET, raw);
  if (!sigOk) return json({ ok: false, error: "unauthorized" }, 401);

  let body: WelcomePayload | null = null;
  try {
    body = raw ? (JSON.parse(raw) as WelcomePayload) : null;
  } catch {
    body = null;
  }
  if (!body) return json({ ok: false, error: "Invalid JSON" }, 400);

  const userLogin = String(body.user_login ?? "").trim();
  if (!userLogin) return json({ ok: false, error: "Missing user_login" }, 400);

  const requestId = String(body.request_id ?? "").trim() || crypto.randomUUID();
  const source = String(body.source ?? "").trim() || "unknown";
  const entitlementUpdatedAt =
    Number.isFinite(body.entitlement_updated_at) ? Number(body.entitlement_updated_at) : null;

  // 2) Load user + email
  const user = await env.DB.prepare(
    `SELECT user_login, email, name FROM users WHERE user_login = ? LIMIT 1`
  )
    .bind(userLogin)
    .first<{ user_login: string; email: string | null; name: string | null }>();

  if (!user) return json({ ok: false, error: "Unknown user" }, 404);

  const email = (user.email ?? "").trim();
  if (!email) return json({ ok: false, error: "User has no email" }, 412);

  // 3) Optional gate: require entitlements.active=1
  if (envBool(env.WELCOME_REQUIRED_ENTITLEMENT, true)) {
    const ent = await env.DB.prepare(
      `SELECT active, updated_at FROM entitlements WHERE user_login = ? LIMIT 1`
    )
      .bind(userLogin)
      .first<{ active: number; updated_at: number }>();

    if (!ent || Number(ent.active) !== 1) {
      return json({ ok: false, error: "Entitlement not active" }, 412);
    }
  }

  // 4) Idempotency: already sent?
  const already = await env.DB.prepare(
    `SELECT sent_at, message_id FROM welcome_emails WHERE user_login = ? LIMIT 1`
  )
    .bind(userLogin)
    .first<{ sent_at: string; message_id: string | null }>();

  if (already) {
    console.log("onboarding.confirm.already_sent", {
      user_login: userLogin,
      request_id: requestId,
      sent_at: already.sent_at,
      message_id: already.message_id ?? null,
    });
    return json(
      {
        ok: true,
        alreadySent: true,
        sentAt: already.sent_at,
        messageId: already.message_id ?? undefined,
      },
      200
    );
  }

  // 5) Send welcome email
  const templateId = String(env.WELCOME_TEMPLATE_ID ?? "").trim();
  if (!templateId) return json({ ok: false, error: "WELCOME_TEMPLATE_ID not set" }, 500);

  const fromName = (env.WELCOME_FROM_NAME ?? env.FROM_NAME ?? "Haiphen").trim();
  const fromEmail = env.FROM_EMAIL;
  const portalUrl = (env.WELCOME_PORTAL_URL ?? "https://app.haiphen.io/#docs").trim();
  const calendarUrl = (env.WELCOME_CALENDAR_URL ?? "").trim();
  const surveyUrl = (env.WELCOME_SURVEY_URL ?? "").trim();
  const supportEmail = (env.WELCOME_SUPPORT_EMAIL ?? "pi@haiphenai.com").trim();

  const tosVersion = (env.WELCOME_TOS_VERSION ?? "sla_v0.2_2026-01-22").trim();
  const tosEffective = (env.WELCOME_TOS_EFFECTIVE ?? "2026-01-22").trim();
  const legalTermsUrl = (env.WELCOME_LEGAL_TERMS_URL ?? "https://haiphen.io/terms.html").trim();
  const pdfUrl = (env.WELCOME_TOS_PDF_URL ?? "").trim();

  let tosAttachment: { content: string; filename: string; type: string; disposition: "attachment" } | null = null;

  if (pdfUrl) {
    try {
      const pdf = await fetchPdfAsBase64(pdfUrl);
      tosAttachment = {
        content: pdf.base64,
        filename: `Haiphen_Service_Agreement_${tosVersion}.pdf`,
        type: "application/pdf",
        disposition: "attachment",
      };
      console.log("[welcome] attached tos pdf", { bytes: pdf.bytes, tosVersion });
    } catch (e) {
      console.warn("[welcome] tos pdf attach failed; continuing without attachment", e);
    }
  }

  const sgResp = await sendSendGrid(env.SENDGRID_API_KEY, {
    from: { email: fromEmail, name: fromName },
    template_id: templateId,
    attachments: tosAttachment ? [tosAttachment] : undefined,
    personalizations: [
      {
        to: [{ email, name: user.name ?? undefined }],
        subject: "Welcome to Haiphen",
        dynamic_template_data: {
          name: user.name ?? userLogin,
          user_login: userLogin,

          app_url: "https://app.haiphen.io/",
          docs_url: "https://haiphen.io/#docs",
          portal_url: portalUrl,
          calendar_url: calendarUrl,
          survey_url: surveyUrl,
          support_email: supportEmail,

          // NEW: legal/terms fields for your SendGrid dynamic template
          legal_terms_url: legalTermsUrl,
          tos_version: tosVersion,
          tos_effective: tosEffective,
          tos_pdf_url: pdfUrl || undefined,
        },
      },
    ],
  });

  if (!sgResp.ok) {
    console.error("onboarding.confirm.sendgrid_failed", {
      user_login: userLogin,
      request_id: requestId,
      template_id: templateId,
      details: sgResp.details ?? null,
    });
    return json({ ok: false, error: "SendGrid send failed", details: sgResp.details }, 502);
  }

  // 6) Persist idempotency record
  await env.DB.prepare(
    `INSERT INTO welcome_emails(user_login, entitlement_updated_at, sent_at, message_id, source, request_id, details_json)
     VALUES (?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ','now')), ?, ?, ?, ?)`
  )
    .bind(
      userLogin,
      entitlementUpdatedAt,
      sgResp.messageId ?? null,
      source,
      requestId,
      JSON.stringify({ email, templateId })
    )
    .run();

  console.log("onboarding.confirm.sent", {
    user_login: userLogin,
    plan,
    request_id: requestId,
    template_id: templateId,
    message_id: sgResp.messageId ?? null,
    email,
  });

  return json({ ok: true, alreadySent: false, messageId: sgResp.messageId ?? undefined }, 200);
}

function onboardingLinks(env: Env) {
  return {
    app_url: (env.ONBOARDING_APP_URL ?? "https://app.haiphen.io/").trim(),
    docs_url: (env.ONBOARDING_DOCS_URL ?? "https://haiphen.io/#docs").trim(),
    profile_url: (env.ONBOARDING_PROFILE_URL ?? "https://haiphen.io/#profile").trim(),
    cohort_url: (env.ONBOARDING_COHORT_URL ?? "https://haiphen.io/#cohort").trim(),
    onboarding_url: (env.ONBOARDING_URL ?? "https://haiphen.io/#onboarding").trim(),
    calendar_url: (env.ONBOARDING_CALENDAR_URL ?? env.WELCOME_CALENDAR_URL ?? "https://calendar.app.google/jQzWz98eCC5jMLrQA").trim(),
    support_email: (env.ONBOARDING_SUPPORT_EMAIL ?? env.WELCOME_SUPPORT_EMAIL ?? "pi@haiphenai.com").trim(),
    api_base_url: (env.ONBOARDING_API_BASE_URL ?? "https://api.haiphen.io").trim(),
    cli_docs_url: (env.ONBOARDING_CLI_DOCS_URL ?? "https://haiphen.io/#docs").trim(),
    websocket_url: (env.ONBOARDING_WEBSOCKET_URL ?? "wss://api.haiphen.io/v1/telemetry/stream").trim(),
  };
}

async function handleOnboardingConfirm(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();

  // Protected with same HMAC channel as /api/welcome (checkout -> contact).
  const sigOk = await verifyHmacRequest(request, env.WELCOME_HMAC_SECRET, raw);
  if (!sigOk) return json({ ok: false, error: "unauthorized" }, 401);

  let body: OnboardingConfirmPayload | null = null;
  try {
    body = raw ? (JSON.parse(raw) as OnboardingConfirmPayload) : null;
  } catch {
    body = null;
  }
  if (!body) return json({ ok: false, error: "Invalid JSON" }, 400);

  const userLogin = String(body.user_login ?? "").trim();
  if (!userLogin) return json({ ok: false, error: "Missing user_login" }, 400);

  const plan = String(body.plan ?? "pro").trim().toLowerCase() === "enterprise" ? "enterprise" : "pro";
  const source = String(body.source ?? "").trim() || "unknown";
  const requestId = String(body.request_id ?? "").trim() || crypto.randomUUID();

  const user = await env.DB.prepare(
    `SELECT user_login, email, name FROM users WHERE user_login = ? LIMIT 1`
  )
    .bind(userLogin)
    .first<{ user_login: string; email: string | null; name: string | null }>();

  if (!user) return json({ ok: false, error: "Unknown user" }, 404);
  const email = (user.email ?? "").trim();
  if (!email) return json({ ok: false, error: "User has no email" }, 412);

  if (envBool(env.WELCOME_REQUIRED_ENTITLEMENT, true)) {
    const ent = await env.DB.prepare(
      `SELECT active FROM entitlements WHERE user_login = ? LIMIT 1`
    )
      .bind(userLogin)
      .first<{ active: number }>();

    if (!ent || Number(ent.active) !== 1) {
      return json({ ok: false, error: "Entitlement not active" }, 412);
    }
  }

  const already = await env.DB.prepare(
    `SELECT sent_at, message_id FROM onboarding_confirmations WHERE user_login = ? LIMIT 1`
  )
    .bind(userLogin)
    .first<{ sent_at: string; message_id: string | null }>();

  if (already) {
    return json(
      {
        ok: true,
        alreadySent: true,
        sentAt: already.sent_at,
        messageId: already.message_id ?? undefined,
      },
      200
    );
  }

  const templateId = String(env.ONBOARDING_TEMPLATE_ID ?? env.WELCOME_TEMPLATE_ID ?? "").trim();
  if (!templateId) return json({ ok: false, error: "ONBOARDING_TEMPLATE_ID not set" }, 500);

  const fromName = (env.WELCOME_FROM_NAME ?? env.FROM_NAME ?? "Haiphen").trim();
  const fromEmail = env.FROM_EMAIL;
  const links = onboardingLinks(env);

  const sgResp = await sendSendGrid(env.SENDGRID_API_KEY, {
    from: { email: fromEmail, name: fromName },
    template_id: templateId,
    personalizations: [
      {
        to: [{ email, name: user.name ?? undefined }],
        subject: "Haiphen onboarding access is ready",
        dynamic_template_data: {
          name: user.name ?? userLogin,
          user_login: userLogin,
          plan,
          app_url: links.app_url,
          docs_url: links.docs_url,
          profile_url: links.profile_url,
          cohort_url: links.cohort_url,
          onboarding_url: links.onboarding_url,
          calendar_url: links.calendar_url,
          support_email: links.support_email,
          api_base_url: links.api_base_url,
          cli_docs_url: links.cli_docs_url,
          websocket_url: links.websocket_url,
        },
      },
    ],
  });

  if (!sgResp.ok) {
    return json({ ok: false, error: "SendGrid send failed", details: sgResp.details }, 502);
  }

  await env.DB.prepare(
    `INSERT INTO onboarding_confirmations(user_login, plan, sent_at, message_id, source, request_id, details_json)
     VALUES (?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ','now')), ?, ?, ?, ?)`
  )
    .bind(
      userLogin,
      plan,
      sgResp.messageId ?? null,
      source,
      requestId,
      JSON.stringify({ email, templateId })
    )
    .run();

  return json({ ok: true, alreadySent: false, messageId: sgResp.messageId ?? undefined }, 200);
}

/**
 * HMAC verification (checkout -> contact)
 * Headers required:
 *  - x-haiphen-ts: unix ms timestamp
 *  - x-haiphen-sig: hex(HMAC_SHA256(secret, `${ts}.${rawBody}`))
 */
async function verifyHmacRequest(req: Request, secret: string, rawBody: string): Promise<boolean> {
  const ts = req.headers.get("x-haiphen-ts") ?? "";
  const sig = req.headers.get("x-haiphen-sig") ?? "";
  if (!ts || !sig) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;

  // 5 minute skew window
  const now = Date.now();
  if (Math.abs(now - tsNum) > 5 * 60 * 1000) return false;

  const msg = `${ts}.${rawBody}`;
  const expected = await hmacSha256Hex(secret, msg);
  return timingSafeEqualHex(sig, expected);
}

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

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

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
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (rateLimit(clientIp, RATE_MAX_CONTACT)) {
    return json({ ok: false, error: 'Too many requests' }, 429);
  }

  const payload = await safeJson<ContactPayload>(request);
  if (!payload) return json({ ok: false, error: "Invalid JSON" }, 400);

  // Normalize inputs early
  const name = (payload.name ?? "").trim();
  const userEmail = (payload.email ?? "").trim();
  const message = (payload.message ?? "").trim();
  const pageUrl = (payload.pageUrl ?? "").trim();

  // Honeypot: pretend success (don’t teach bots)
  const honeypot = String((payload as any)?.website ?? "").trim();
  if (honeypot) {
    console.log("[contact] honeypot tripped", { pageUrl });
    return json({ ok: true }, 200);
  }  

  if (!message) return json({ ok: false, error: "Message is required" }, 400);

  // ---- Turnstile or test bypass ----
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
    // Turnstile disabled. Honeypot still applies.
    console.log("[contact] Turnstile not required (TURNSTILE_REQUIRED=false)");
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

// ----------------------
// Purchase confirmation (HMAC-protected)
// ----------------------

type PurchaseConfirmPayload = {
  user_login: string;
  service_name: string;
  plan: string;
  price: string;
  trial_days?: number;
  receipt_url?: string;
  request_id?: string;
};

async function handlePurchaseConfirm(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();

  const sigOk = await verifyHmacRequest(request, env.WELCOME_HMAC_SECRET, raw);
  if (!sigOk) return json({ ok: false, error: "unauthorized" }, 401);

  let body: PurchaseConfirmPayload | null = null;
  try {
    body = raw ? (JSON.parse(raw) as PurchaseConfirmPayload) : null;
  } catch {
    body = null;
  }
  if (!body) return json({ ok: false, error: "Invalid JSON" }, 400);

  const userLogin = String(body.user_login ?? "").trim();
  const serviceName = String(body.service_name ?? "").trim();
  const plan = String(body.plan ?? "").trim();
  const price = String(body.price ?? "").trim();

  if (!userLogin || !serviceName || !plan || !price) {
    return json({ ok: false, error: "Missing required fields: user_login, service_name, plan, price" }, 400);
  }

  const trialDays = Number.isFinite(body.trial_days) ? Number(body.trial_days) : undefined;
  const receiptUrl = String(body.receipt_url ?? "").trim() || undefined;
  const requestId = String(body.request_id ?? "").trim() || crypto.randomUUID();

  const templateId = String(env.PURCHASE_TEMPLATE_ID ?? "").trim();
  if (!templateId) {
    console.error("[purchase] PURCHASE_TEMPLATE_ID not configured", { requestId });
    return json({ ok: false, error: "PURCHASE_TEMPLATE_ID not set" }, 500);
  }

  const user = await env.DB.prepare(
    `SELECT user_login, email, name FROM users WHERE user_login = ? LIMIT 1`
  )
    .bind(userLogin)
    .first<{ user_login: string; email: string | null; name: string | null }>();

  if (!user) {
    console.error("[purchase] unknown user", { userLogin, requestId });
    return json({ ok: false, error: "Unknown user" }, 404);
  }

  const email = (user.email ?? "").trim();
  if (!email) {
    console.error("[purchase] user has no email", { userLogin, requestId });
    return json({ ok: false, error: "User has no email" }, 412);
  }

  const fromName = (env.PURCHASE_FROM_NAME ?? env.FROM_NAME ?? "Haiphen").trim();
  const fromEmail = env.FROM_EMAIL;
  const supportEmail = (env.WELCOME_SUPPORT_EMAIL ?? "pi@haiphenai.com").trim();

  const sgResp = await sendSendGrid(env.SENDGRID_API_KEY, {
    from: { email: fromEmail, name: fromName },
    template_id: templateId,
    personalizations: [
      {
        to: [{ email, name: user.name ?? undefined }],
        subject: `Haiphen — purchase confirmation for ${serviceName}`,
        dynamic_template_data: {
          name: user.name ?? userLogin,
          user_login: userLogin,
          service_name: serviceName,
          plan,
          price,
          trial_days: trialDays,
          trial_info: trialDays != null && trialDays > 0,
          receipt_url: receiptUrl,
          support_email: supportEmail,
          docs_url: "https://haiphen.io/#docs",
          login_url: "https://haiphen.io/#profile",
        },
      },
    ],
  });

  if (!sgResp.ok) {
    console.error("[purchase] SendGrid send failed", {
      userLogin,
      requestId,
      templateId,
      details: sgResp.details ?? null,
    });
    return json({ ok: false, error: "SendGrid send failed", details: sgResp.details }, 502);
  }

  console.log("[purchase] sent", { userLogin, requestId, messageId: sgResp.messageId ?? null });
  return json({ ok: true, messageId: sgResp.messageId ?? undefined }, 200);
}

// ----------------------
// Trial expiry notification (HMAC-protected)
// ----------------------

type TrialExpiringPayload = {
  user_login: string;
  service_name: string;
  days_remaining: number;
  trial_end_date: string;
  current_plan?: string;
  request_id?: string;
};

async function handleTrialExpiring(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();

  const sigOk = await verifyHmacRequest(request, env.WELCOME_HMAC_SECRET, raw);
  if (!sigOk) return json({ ok: false, error: "unauthorized" }, 401);

  let body: TrialExpiringPayload | null = null;
  try {
    body = raw ? (JSON.parse(raw) as TrialExpiringPayload) : null;
  } catch {
    body = null;
  }
  if (!body) return json({ ok: false, error: "Invalid JSON" }, 400);

  const userLogin = String(body.user_login ?? "").trim();
  const serviceName = String(body.service_name ?? "").trim();
  const daysRemaining = Number(body.days_remaining);
  const trialEndDate = String(body.trial_end_date ?? "").trim();

  if (!userLogin || !serviceName || !Number.isFinite(daysRemaining) || !trialEndDate) {
    return json({ ok: false, error: "Missing required fields: user_login, service_name, days_remaining, trial_end_date" }, 400);
  }

  const currentPlan = String(body.current_plan ?? "").trim() || undefined;
  const requestId = String(body.request_id ?? "").trim() || crypto.randomUUID();

  const templateId = String(env.TRIAL_EXPIRING_TEMPLATE_ID ?? "").trim();
  if (!templateId) {
    console.error("[trial] TRIAL_EXPIRING_TEMPLATE_ID not configured", { requestId });
    return json({ ok: false, error: "TRIAL_EXPIRING_TEMPLATE_ID not set" }, 500);
  }

  const user = await env.DB.prepare(
    `SELECT user_login, email, name FROM users WHERE user_login = ? LIMIT 1`
  )
    .bind(userLogin)
    .first<{ user_login: string; email: string | null; name: string | null }>();

  if (!user) {
    console.error("[trial] unknown user", { userLogin, requestId });
    return json({ ok: false, error: "Unknown user" }, 404);
  }

  const email = (user.email ?? "").trim();
  if (!email) {
    console.error("[trial] user has no email", { userLogin, requestId });
    return json({ ok: false, error: "User has no email" }, 412);
  }

  const fromName = (env.TRIAL_FROM_NAME ?? env.FROM_NAME ?? "Haiphen").trim();
  const fromEmail = env.FROM_EMAIL;
  const supportEmail = (env.WELCOME_SUPPORT_EMAIL ?? "pi@haiphenai.com").trim();

  const sgResp = await sendSendGrid(env.SENDGRID_API_KEY, {
    from: { email: fromEmail, name: fromName },
    template_id: templateId,
    personalizations: [
      {
        to: [{ email, name: user.name ?? undefined }],
        subject: `Haiphen — your ${serviceName} trial expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`,
        dynamic_template_data: {
          name: user.name ?? userLogin,
          service_name: serviceName,
          days_remaining: daysRemaining,
          trial_end_date: trialEndDate,
          current_plan: currentPlan,
          upgrade_url: "https://haiphen.io/#services",
          support_email: supportEmail,
        },
      },
    ],
  });

  if (!sgResp.ok) {
    console.error("[trial] SendGrid send failed", {
      userLogin,
      requestId,
      templateId,
      details: sgResp.details ?? null,
    });
    return json({ ok: false, error: "SendGrid send failed", details: sgResp.details }, 502);
  }

  console.log("[trial] sent", { userLogin, requestId, messageId: sgResp.messageId ?? null });
  return json({ ok: true, messageId: sgResp.messageId ?? undefined }, 200);
}

// ----------------------
// Usage alert notification (HMAC-protected)
// ----------------------

type UsageAlertPayload = {
  user_login: string;
  service_name: string;
  usage_pct: number;
  used_count: number;
  limit_count: number;
  reset_date: string;
  current_plan?: string;
  request_id?: string;
};

async function handleUsageAlert(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();

  const sigOk = await verifyHmacRequest(request, env.WELCOME_HMAC_SECRET, raw);
  if (!sigOk) return json({ ok: false, error: "unauthorized" }, 401);

  let body: UsageAlertPayload | null = null;
  try {
    body = raw ? (JSON.parse(raw) as UsageAlertPayload) : null;
  } catch {
    body = null;
  }
  if (!body) return json({ ok: false, error: "Invalid JSON" }, 400);

  const userLogin = String(body.user_login ?? "").trim();
  const serviceName = String(body.service_name ?? "").trim();
  const usagePct = Number(body.usage_pct);
  const usedCount = Number(body.used_count);
  const limitCount = Number(body.limit_count);
  const resetDate = String(body.reset_date ?? "").trim();

  if (
    !userLogin || !serviceName ||
    !Number.isFinite(usagePct) || !Number.isFinite(usedCount) || !Number.isFinite(limitCount) ||
    !resetDate
  ) {
    return json({ ok: false, error: "Missing required fields: user_login, service_name, usage_pct, used_count, limit_count, reset_date" }, 400);
  }

  const currentPlan = String(body.current_plan ?? "").trim() || undefined;
  const requestId = String(body.request_id ?? "").trim() || crypto.randomUUID();

  const templateId = String(env.USAGE_ALERT_TEMPLATE_ID ?? "").trim();
  if (!templateId) {
    console.error("[usage] USAGE_ALERT_TEMPLATE_ID not configured", { requestId });
    return json({ ok: false, error: "USAGE_ALERT_TEMPLATE_ID not set" }, 500);
  }

  const user = await env.DB.prepare(
    `SELECT user_login, email, name FROM users WHERE user_login = ? LIMIT 1`
  )
    .bind(userLogin)
    .first<{ user_login: string; email: string | null; name: string | null }>();

  if (!user) {
    console.error("[usage] unknown user", { userLogin, requestId });
    return json({ ok: false, error: "Unknown user" }, 404);
  }

  const email = (user.email ?? "").trim();
  if (!email) {
    console.error("[usage] user has no email", { userLogin, requestId });
    return json({ ok: false, error: "User has no email" }, 412);
  }

  const fromName = (env.USAGE_FROM_NAME ?? env.FROM_NAME ?? "Haiphen").trim();
  const fromEmail = env.FROM_EMAIL;
  const supportEmail = (env.WELCOME_SUPPORT_EMAIL ?? "pi@haiphenai.com").trim();

  const sgResp = await sendSendGrid(env.SENDGRID_API_KEY, {
    from: { email: fromEmail, name: fromName },
    template_id: templateId,
    personalizations: [
      {
        to: [{ email, name: user.name ?? undefined }],
        subject: `Haiphen — ${serviceName} usage at ${usagePct}%`,
        dynamic_template_data: {
          name: user.name ?? userLogin,
          service_name: serviceName,
          usage_pct: usagePct,
          used_count: usedCount,
          limit_count: limitCount,
          reset_date: resetDate,
          current_plan: currentPlan,
          upgrade_url: "https://haiphen.io/#services",
          support_email: supportEmail,
        },
      },
    ],
  });

  if (!sgResp.ok) {
    console.error("[usage] SendGrid send failed", {
      userLogin,
      requestId,
      templateId,
      details: sgResp.details ?? null,
    });
    return json({ ok: false, error: "SendGrid send failed", details: sgResp.details }, 502);
  }

  console.log("[usage] sent", { userLogin, requestId, messageId: sgResp.messageId ?? null });
  return json({ ok: true, messageId: sgResp.messageId ?? undefined }, 200);
}

// ---- Prospect outreach email send ----

interface ProspectOutreachPayload {
  outreach_id: string;
  recipient_email: string;
  recipient_name?: string;
  subject: string;
  body_text: string;
  from_name?: string;
  reply_to?: string;
}

async function handleProspectOutreachSend(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();

  // HMAC verify — uses PROSPECT_HMAC_SECRET (falls back to WELCOME_HMAC_SECRET)
  const secret = env.PROSPECT_HMAC_SECRET ?? env.WELCOME_HMAC_SECRET;
  const sigOk = await verifyHmacRequest(request, secret, raw);
  if (!sigOk) return json({ ok: false, error: "unauthorized" }, 401);

  let body: ProspectOutreachPayload | null = null;
  try {
    body = raw ? (JSON.parse(raw) as ProspectOutreachPayload) : null;
  } catch {
    body = null;
  }
  if (!body) return json({ ok: false, error: "Invalid JSON" }, 400);

  const outreachId = String(body.outreach_id ?? "").trim();
  const recipientEmail = String(body.recipient_email ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const bodyText = String(body.body_text ?? "").trim();

  if (!outreachId || !recipientEmail || !subject || !bodyText) {
    return json({ ok: false, error: "Missing required fields: outreach_id, recipient_email, subject, body_text" }, 400);
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return json({ ok: false, error: "Invalid recipient_email format" }, 400);
  }

  const fromName = String(body.from_name ?? env.FROM_NAME ?? "Haiphen Security Intelligence").trim();
  const fromEmail = env.FROM_EMAIL;
  const replyTo = body.reply_to || (env.WELCOME_SUPPORT_EMAIL ?? "pi@haiphenai.com");
  const recipientName = String(body.recipient_name ?? "").trim() || undefined;

  const sgResp = await sendSendGrid(env.SENDGRID_API_KEY, {
    from: { email: fromEmail, name: fromName },
    reply_to: { email: replyTo },
    personalizations: [
      {
        to: [{ email: recipientEmail, name: recipientName }],
        subject,
      },
    ],
    content: [
      { type: "text/plain", value: bodyText },
    ],
  });

  if (!sgResp.ok) {
    console.error("[prospect-outreach] SendGrid send failed", {
      outreachId,
      recipientEmail,
      details: sgResp.details ?? null,
    });
    return json({ ok: false, error: "SendGrid send failed", details: sgResp.details }, 502);
  }

  console.log("[prospect-outreach] sent", { outreachId, recipientEmail, messageId: sgResp.messageId ?? null });
  return json({ ok: true, messageId: sgResp.messageId ?? undefined }, 200);
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
    "Access-Control-Allow-Headers": "Content-Type, X-Contact-Test-Bypass, X-Haiphen-Ts, X-Haiphen-Sig, Authorization",
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    Vary: "Origin",
  };
}

function withCorsAndBuild(res: Response, req: Request, env: Env, path?: string): Response {
  const h = new Headers(res.headers);

  const cors = corsHeaders(req, env);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);

  const build = getBuildId(env);
  h.set("x-haiphen-build", build);
  if (path) h.set("x-haiphen-route", path);

  // If you want caching disabled only for debug endpoints, keep no-store.
  // Otherwise consider:
  // h.set("cache-control", path?.startsWith("/api/") ? "no-store" : "public, max-age=60")
  h.set("cache-control", "no-store");

  return new Response(res.body, { status: res.status, headers: h });
}

function jsonWithBuild(obj: unknown, status = 200, env?: Env): Response {
  const build = env ? getBuildId(env) : BUILD_ID;
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-haiphen-build": build,
      "cache-control": "no-store",
    },
  });
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

async function sendSendGrid(
  apiKey: string,
  body: SendGridRequest,
): Promise<{ ok: boolean; status: number; messageId?: string | null; details?: unknown }> {
  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const messageId = resp.headers.get("x-message-id");
  const status = resp.status;

  if (resp.ok) return { ok: true, status, messageId };

  let details: unknown = { status };
  try {
    details = await resp.json();
  } catch {
    details = { status, body: await resp.text().catch(() => "") };
  }
  return { ok: false, status, messageId, details };
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

function parseCookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(";");
  for (const p of parts) {
    const [k, ...rest] = p.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function hmacSha256Verify(secret: string, data: string, sigB64Url: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sig = base64UrlToBytes(sigB64Url);
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(data));
}

async function requireUserFromAuthCookie(req: Request, env: Env): Promise<AuthedUser> {
  const token = parseCookieValue(req.headers.get("Cookie"), "auth");
  if (!token) throw Object.assign(new Error("Missing auth cookie"), { status: 401 });

  const parts = token.split(".");
  if (parts.length !== 3) throw Object.assign(new Error("Malformed JWT"), { status: 401 });

  const [hB64, pB64, sB64] = parts;
  const signed = `${hB64}.${pB64}`;

  const ok = await hmacSha256Verify(env.JWT_SECRET, signed, sB64);
  if (!ok) throw Object.assign(new Error("Invalid JWT signature"), { status: 401 });

  const payloadJson = new TextDecoder().decode(base64UrlToBytes(pB64));
  const claims = JSON.parse(payloadJson) as AuthClaims;

  if (claims.aud && claims.aud !== "haiphen-auth") {
    throw Object.assign(new Error("Invalid JWT audience"), { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) {
    throw Object.assign(new Error("Expired session"), { status: 401 });
  }

  if (!claims.sub) throw Object.assign(new Error("JWT missing sub"), { status: 401 });

  if (claims.jti) {
    const revoked = await env.REVOKE_KV.get(`revoke:${claims.jti}`);
    if (revoked) throw Object.assign(new Error("Token revoked"), { status: 401 });
  }

  return {
    user_login: claims.sub,
    name: claims.name ?? null,
    avatar: claims.avatar ?? null,
    email: claims.email ?? null,
  };
}

async function ensureUserRecord(env: Env, user: AuthedUser): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO users(user_login, name, email, last_seen_at)
    VALUES (?, ?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ','now')))
    ON CONFLICT(user_login) DO UPDATE SET
      name=COALESCE(excluded.name, users.name),
      email=COALESCE(excluded.email, users.email),
      last_seen_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    `
  ).bind(user.user_login, user.name ?? null, user.email ?? null).run();
}

function normalizePreferencesInput(body: SubscriptionPreferencesRequest): Partial<SubscriptionPreferences> {
  const raw = (body && typeof body === "object" && "preferences" in body)
    ? (body as any).preferences
    : body;

  const out: Partial<SubscriptionPreferences> = {};
  if (!raw || typeof raw !== "object") return out;

  for (const key of SUBSCRIPTION_LISTS) {
    if (key in raw) out[key] = Boolean((raw as any)[key]);
  }

  return out;
}

async function getSubscriptionPreferences(env: Env, userLogin: string): Promise<SubscriptionPreferences> {
  const defaults: SubscriptionPreferences = {
    daily_digest: true,
    weekly_summary: true,
    product_updates: true,
    cohort_comms: true,
  };

  const rows = await env.DB.prepare(
    `
    SELECT list_id, active
    FROM user_email_subscriptions
    WHERE user_login = ?
    `
  ).bind(userLogin).all<{ list_id: string; active: number }>();

  const items = rows.results ?? [];
  for (const r of items) {
    if ((SUBSCRIPTION_LISTS as readonly string[]).includes(r.list_id)) {
      (defaults as any)[r.list_id] = r.active === 1;
    }
  }

  return defaults;
}

async function updateSubscriptionPreferences(
  env: Env,
  userLogin: string,
  prefs: Partial<SubscriptionPreferences>,
): Promise<void> {
  const now = new Date().toISOString();
  for (const listId of SUBSCRIPTION_LISTS) {
    if (!(listId in prefs)) continue;
    const active = prefs[listId] ? 1 : 0;
    await env.DB.prepare(
      `
      INSERT INTO user_email_subscriptions(user_login, list_id, active, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_login, list_id)
      DO UPDATE SET active=excluded.active, updated_at=excluded.updated_at
      `
    ).bind(userLogin, listId, active, now).run();
  }
}

async function handleSubscriptionPreferences(request: Request, env: Env): Promise<Response> {
  try {
    const user = await requireUserFromAuthCookie(request, env);
    await ensureUserRecord(env, user);

    if (request.method === "GET") {
      const preferences = await getSubscriptionPreferences(env, user.user_login);
      return json({ ok: true, preferences }, 200);
    }

    const body = await safeJson<SubscriptionPreferencesRequest>(request);
    if (!body) return json({ ok: false, error: "Invalid JSON" }, 400);

    const prefs = normalizePreferencesInput(body);
    if (!Object.keys(prefs).length) {
      return json({ ok: false, error: "No preferences provided" }, 400);
    }

    await updateSubscriptionPreferences(env, user.user_login, prefs);
    const preferences = await getSubscriptionPreferences(env, user.user_login);
    return json({ ok: true, preferences }, 200);
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "Unauthorized");
    const status = err?.status || 401;
    return json({ ok: false, error: msg }, status);
  }
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

// ----------------------
// Daily Digest (trades.json -> SendGrid dynamic template)
// ----------------------

type TradesJson = {
  date: string; // YYYY-MM-DD
  updated_at?: string;
  headline?: string;
  summary?: string;
  source?: string;
  rows?: Array<{ kpi: string; value: string }>;
  overlay?: {
    portfolioAssets?: Array<{
      trade_id: number;
      symbol: string;
      contract_name: string;
    }>;
    [key: string]: unknown;
  };
};

type AuthedDigestPayload = {
  send_date?: string; // optional override, YYYY-MM-DD
};

type DigestSubscriber = {
  user_login: string;
  email: string | null;
  name: string | null;
  prefs_json: string | null;
};

function yyyyMmDdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekdayUtc(d: Date): boolean {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

function formatDateLabel(d: Date): string {
  const ymd = yyyyMmDdUtc(d);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${ymd} (${day})`;
}

/** KPIs to feature in the digest — ordered by importance. */
const DIGEST_KPI_PRIORITY = [
  "Daily PnL",
  "Win rate",
  "Sharpe ratio",
  "Max drawdown",
  "Avg hold time",
  "Entries opened",
  "Exits closed",
];

function pickDigestKpis(rows: TradesJson["rows"]): Array<{ kpi: string; value: string }> {
  const arr = Array.isArray(rows) ? rows : [];
  const byName = new Map(arr.map(r => [String(r.kpi ?? "").trim(), String(r.value ?? "").trim()]));
  const out: Array<{ kpi: string; value: string }> = [];
  for (const k of DIGEST_KPI_PRIORITY) {
    const v = byName.get(k);
    if (v) out.push({ kpi: k, value: v });
  }
  return out;
}

function buildEntities(trades: TradesJson): Array<{
  symbol: string;
  contract_name: string;
  trade_id: number;
  contract_qs: string;
}> {
  const assets = trades.overlay?.portfolioAssets;
  if (!Array.isArray(assets) || !assets.length) return [];
  const all = assets.map(a => ({
    symbol: String(a.symbol ?? ""),
    contract_name: String(a.contract_name ?? ""),
    trade_id: Number(a.trade_id ?? 0),
    contract_qs: encodeURIComponent(String(a.contract_name ?? "")),
  })).filter(a => a.symbol && a.contract_name);

  // Deduplicate by symbol — keep first contract per symbol, cap at 8
  const seen = new Set<string>();
  const deduped: typeof all = [];
  for (const a of all) {
    if (!seen.has(a.symbol)) {
      seen.add(a.symbol);
      deduped.push(a);
    }
    if (deduped.length >= 8) break;
  }
  return deduped;
}

const ENTITIES_FALLBACK = [
  { symbol: "SPY", contract_name: "SPY260320C00600000", trade_id: 0, contract_qs: "SPY260320C00600000" },
  { symbol: "QQQ", contract_name: "QQQ260320P00500000", trade_id: 0, contract_qs: "QQQ260320P00500000" },
  { symbol: "AAPL", contract_name: "AAPL260618C00250000", trade_id: 0, contract_qs: "AAPL260618C00250000" },
];

function buildScreenshotUrl(trades: TradesJson): string {
  const date = trades.date || "";
  // Current day screenshot lives at the root; archive days get dated PNGs
  return `https://haiphen.io/assets/trades/alpaca_screenshot.png`;
}

/** Rotating CTA — one feature spotlight per weekday. */
const DIGEST_CTAS: Array<{
  feature: string;
  scenario: string;
  description: string;
  demo_url: string;
  cta_text: string;
  cta_url: string;
}> = [
  { // Monday
    feature: "Prospect Investigation",
    scenario: "A critical settlement gateway vulnerability just hit the NVD.",
    description: "Haiphen's 6-engine investigation pipeline scored 3 fintech leads at 85+ severity overnight — and auto-drafted outreach before the market opened.",
    demo_url: "https://haiphen.io/assets/demos/cli-prospect-investigate.gif",
    cta_text: "See how investigations work",
    cta_url: "https://haiphen.io/#getting-started:prospect-investigate",
  },
  { // Tuesday
    feature: "Risk Simulation",
    scenario: "Your OT gateway went offline during peak trading hours.",
    description: "Run a Monte Carlo simulation to estimate PnL impact across 10,000 scenarios — Haiphen quantified a $340K tail risk in under 2 seconds.",
    demo_url: "https://haiphen.io/assets/demos/cli-risk.gif",
    cta_text: "Try risk simulation",
    cta_url: "https://haiphen.io/#getting-started:svc-risk",
  },
  { // Wednesday
    feature: "Supply Chain Intelligence",
    scenario: "A critical vendor just disclosed CVE-2026-1847 in their edge firmware.",
    description: "Haiphen's supply chain scorer flagged 4 downstream counterparties with exposure, weighted by contract value and data dependency depth.",
    demo_url: "https://haiphen.io/assets/demos/cli-supply.gif",
    cta_text: "Explore supply chain analysis",
    cta_url: "https://haiphen.io/#getting-started:svc-supply",
  },
  { // Thursday
    feature: "Causal Inference",
    scenario: "Three seemingly unrelated trade failures hit your book this morning.",
    description: "Haiphen's DAG builder traced all three to a single misconfigured load balancer — root cause identified in 800ms across 12 upstream services.",
    demo_url: "https://haiphen.io/assets/demos/cli-causal.gif",
    cta_text: "See causal analysis in action",
    cta_url: "https://haiphen.io/#getting-started:svc-causal",
  },
  { // Friday
    feature: "Network Protocol Analysis",
    scenario: "Unusual latency spikes are appearing on your Modbus/TCP edge nodes.",
    description: "Haiphen decoded 14,000 protocol frames and isolated a rogue polling interval — fix deployed before it cascaded to the order router.",
    demo_url: "https://haiphen.io/assets/demos/cli-network.gif",
    cta_text: "Try network analysis",
    cta_url: "https://haiphen.io/#getting-started:svc-network",
  },
];

function pickCta(when: Date) {
  // Mon=0 .. Fri=4 (getUTCDay: Mon=1..Fri=5)
  const dayIdx = Math.max(0, when.getUTCDay() - 1);
  return DIGEST_CTAS[dayIdx % DIGEST_CTAS.length];
}

function safeParseJson<T>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

async function fetchTradesJson(env: Env): Promise<TradesJson> {
  // Primary: live API endpoint
  try {
    const apiResp = await fetch("https://api.haiphen.io/v1/trades/latest", { cf: { cacheTtl: 60, cacheEverything: true } as any });
    if (apiResp.ok) {
      return (await apiResp.json()) as TradesJson;
    }
  } catch (_) { /* fall through to static */ }

  // Fallback: static file
  const url = (env.TRADES_JSON_URL || "https://haiphen.io/assets/trades/trades.json").trim();
  const resp = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } as any });
  if (!resp.ok) throw new Error(`[digest] trades.json fetch failed: HTTP ${resp.status}`);
  const data = (await resp.json()) as TradesJson;
  return data;
}

/**
 * Manual send endpoint: POST /api/digest/send
 * Protected by HMAC like /api/welcome.
 */
async function handleDigestSend(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();

  const secret = (env.DIGEST_HMAC_SECRET || "").trim();
  if (!secret) return json({ ok: false, error: "DIGEST_HMAC_SECRET not set" }, 500);

  const sigOk = await verifyHmacRequest(request, secret, raw);
  if (!sigOk) return json({ ok: false, error: "unauthorized" }, 401);

  const body = raw ? safeParseJson<AuthedDigestPayload>(raw) : null;
  const now = new Date();

  let when = now;
  if (body?.send_date) {
    const cand = new Date(`${body.send_date}T00:00:00Z`);
    if (Number.isFinite(cand.getTime())) when = cand;
  }

  const out = await runDailyDigest(env, when);
  return json({ ok: true, ...out }, 200);
}

type EmailOnlySubscriber = {
  email: string;
  name: string | null;
};

async function runDailyDigest(env: Env, when: Date): Promise<{
  sendDate: string;
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const sendDate = yyyyMmDdUtc(when);

  // Optional: skip weekends even if cron misfires
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

  // Load the content once
  const trades = await fetchTradesJson(env);

  // Query active subscribers (default to active unless explicitly unsubscribed)
  const subs = await env.DB.prepare(
    `
    SELECT
      u.user_login AS user_login,
      u.email AS email,
      u.name AS name,
      s.prefs_json AS prefs_json
    FROM users u
    LEFT JOIN user_email_subscriptions s
      ON s.user_login = u.user_login AND s.list_id = 'daily_digest'
    WHERE u.email IS NOT NULL AND u.email <> ''
      AND (s.active IS NULL OR s.active = 1)
    ORDER BY u.user_login ASC
    `
  ).all<DigestSubscriber>();

  const rows = subs.results ?? [];
  console.log("[digest] subscribers", rows.length);

  let attempted = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // Build shared template data from trades.json
  const entities = buildEntities(trades);
  const kpis = pickDigestKpis(trades.rows);
  const screenshotUrl = buildScreenshotUrl(trades);
  const cta = pickCta(when);

  const emailOnly = await env.DB.prepare(
    `
    SELECT email, name
    FROM email_list_subscribers
    WHERE list_id = 'daily_digest' AND active = 1
    ORDER BY email ASC
    `
  ).all<EmailOnlySubscriber>();

  const emailOnlyRows = emailOnly.results ?? [];
  console.log("[digest] email-only subscribers", emailOnlyRows.length);

  for (const r of rows) {
    attempted++;

    const userLogin = String(r.user_login ?? "").trim();
    const email = (r.email ?? "").trim();
    if (!userLogin || !email) {
      skipped++;
      continue;
    }

    // Idempotency: insert delivery row; if conflict, skip
    const deliveryId = crypto.randomUUID();
    try {
      const ins = await env.DB.prepare(
        `
        INSERT INTO email_deliveries(delivery_id, user_login, list_id, send_date, status, created_at, updated_at)
        VALUES (?, ?, 'daily_digest', ?, 'queued', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now')))
        `
      ).bind(deliveryId, userLogin, sendDate).run();

      // If SQLite didn’t insert, treat as skip (extra safety)
      if (!ins.success) {
        skipped++;
        continue;
      }
    } catch (e: any) {
      // Unique constraint triggers -> already sent today
      const msg = String(e?.message || e || "");
      if (/UNIQUE|constraint/i.test(msg)) {
        skipped++;
        continue;
      }
      // Unknown insert error
      failed++;
      console.error("[digest] delivery insert failed", { userLogin, msg });
      continue;
    }

    // Fetch all 4 subscription preferences for this user
    const allPrefs = await getSubscriptionPreferences(env, userLogin);
    const subscriptions = SUBSCRIPTION_LISTS.map(id => ({
      list_id: id,
      label: SUBSCRIPTION_LABELS[id],
      active: allPrefs[id],
    }));

    const subject = `${subjPrefix} — ${sendDate}`;
    const dynamicData = {
      name: r.name ?? userLogin,
      user_login: userLogin,
      headline: trades.headline ?? `Daily snapshot — ${sendDate}`,
      date_label: formatDateLabel(when),
      summary: trades.summary ?? "",
      screenshot_url: screenshotUrl,
      kpis,
      entities: entities.length ? entities : undefined,
      entities_fallback: entities.length ? undefined : ENTITIES_FALLBACK,
      list_id: "daily_digest",
      cta,
      subscriptions,
      manage_url: manageUrl,
      updated_at: trades.updated_at ?? "",
    };

    const sg = await sendSendGrid(env.SENDGRID_API_KEY, {
      from: { email: fromEmail, name: fromName },
      template_id: templateId,
      personalizations: [
        {
          to: [{ email }],
          subject,
          dynamic_template_data: dynamicData,
        },
      ],
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
