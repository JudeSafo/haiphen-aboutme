// ---------------------------------------------------------------------------
// haiphen-watchdog — CF usage monitor + GCP failover orchestrator
// ---------------------------------------------------------------------------

import { fetchAllUsage } from "./cf-usage";
import { sendDigestEmail } from "./email";
import { executeFailover, executeRevert, revertAll, type FailoverRecord } from "./failover";
import { buildUsageMap, evaluateUsage, FAILOVER_PRIORITY, WORKER_ROUTES, type AlertLevel, type UsageMap } from "./thresholds";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Env {
  // KV
  WATCHDOG_KV: KVNamespace;
  // Vars
  CF_ACCOUNT_ID:          string;
  CF_ZONE_ID:             string;
  CF_D1_DATABASE_ID:      string;
  FAILOVER_THRESHOLD_PCT: string;
  WARNING_THRESHOLD_PCT:  string;
  // Email vars
  DIGEST_TO_EMAIL:               string;
  DIGEST_FROM_EMAIL:             string;
  DIGEST_FROM_NAME:              string;
  WATCHDOG_DIGEST_TEMPLATE_ID:   string;
  // Secrets
  CF_API_TOKEN:    string;
  ADMIN_TOKEN:     string;
  SENDGRID_API_KEY: string;
  GITHUB_PAT:      string;  // GitHub PAT for triggering gcp-standup workflow
}

export interface WatchdogState {
  lastCheck:  string;           // ISO timestamp
  monthStart: string;           // e.g. "2026-02-01"
  usage:      UsageMap;
  level:      AlertLevel;
  failedOver: string[];         // worker names currently on GCP
  routing:    Record<string, FailoverRecord>;
}

const STATE_KEY = "watchdog:state";

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

async function loadState(kv: KVNamespace): Promise<WatchdogState> {
  const raw = await kv.get(STATE_KEY);
  if (raw) return JSON.parse(raw);
  const now = new Date();
  return {
    lastCheck:  "",
    monthStart: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`,
    usage:      {} as UsageMap,
    level:      "normal",
    failedOver: [],
    routing:    {},
  };
}

async function saveState(kv: KVNamespace, state: WatchdogState): Promise<void> {
  await kv.put(STATE_KEY, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: { code: "unauthorized", message: "Invalid or missing ADMIN_TOKEN" } }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function verifyAdmin(req: Request, env: Env): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  return auth === `Bearer ${env.ADMIN_TOKEN}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// GCP standup — trigger GitHub Actions workflow to spin up GCP failover infra
// ---------------------------------------------------------------------------

const GH_REPO = "judesafo/haiphen-aboutme";
const GH_WORKFLOW = "gcp-standup.yml";
const STANDUP_TRIGGERED_KEY = "watchdog:gcp-standup-triggered";

/**
 * Dispatch the gcp-standup.yml GitHub Actions workflow.
 * Deduplicates per billing month — only fires once until the month resets.
 */
async function triggerGcpStandup(env: Env): Promise<boolean> {
  if (!env.GITHUB_PAT) {
    console.log("[watchdog] No GITHUB_PAT — skipping GCP standup trigger");
    return false;
  }

  // Dedup: check if already triggered this month
  const already = await env.WATCHDOG_KV.get(STANDUP_TRIGGERED_KEY);
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (already === currentMonth) {
    console.log("[watchdog] GCP standup already triggered this month — skipping");
    return false;
  }

  // Dispatch workflow
  const res = await fetch(
    `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "haiphen-watchdog",
      },
      body: JSON.stringify({ ref: "master" }),
    },
  );

  if (res.status === 204) {
    // Mark as triggered for this month (TTL: 35 days)
    await env.WATCHDOG_KV.put(STANDUP_TRIGGERED_KEY, currentMonth, {
      expirationTtl: 35 * 24 * 60 * 60,
    });
    console.log("[watchdog] GCP standup workflow dispatched successfully");
    return true;
  }

  const body = await res.text();
  console.error(`[watchdog] GitHub dispatch failed (${res.status}): ${body}`);
  return false;
}

// ---------------------------------------------------------------------------
// Cron handler — the core monitoring loop
// ---------------------------------------------------------------------------

async function handleCron(env: Env): Promise<void> {
  const state = await loadState(env.WATCHDOG_KV);
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

  // ── New billing month? Auto-revert all failovers ──
  if (state.monthStart !== currentMonth && state.failedOver.length > 0) {
    await revertAll(state, env);
    state.failedOver = [];
    state.routing = {};
    state.monthStart = currentMonth;
    state.level = "normal";
    state.lastCheck = now.toISOString();
    await saveState(env.WATCHDOG_KV, state);
    return; // fresh month — skip usage check this cycle
  }
  state.monthStart = currentMonth;

  // ── Poll CF usage ──
  const { snapshot, errors } = await fetchAllUsage(env);
  const usageMap = buildUsageMap(snapshot);
  state.usage = usageMap;
  state.lastCheck = now.toISOString();
  if (errors.length > 0) {
    (state as any).lastErrors = errors;
  } else {
    delete (state as any).lastErrors;
  }

  // ── Evaluate thresholds ──
  const warnPct = parseInt(env.WARNING_THRESHOLD_PCT, 10) || 60;
  const failPct = parseInt(env.FAILOVER_THRESHOLD_PCT, 10) || 80;
  const evaluation = evaluateUsage(usageMap, state.failedOver, warnPct, failPct);
  state.level = evaluation.level;

  // ── At warning level: pre-emptively spin up GCP infra ──
  if (evaluation.level !== "normal" && state.failedOver.length === 0) {
    try {
      const dispatched = await triggerGcpStandup(env);
      if (dispatched) {
        (state as any).gcpStandupDispatched = new Date().toISOString();
      }
    } catch (err) {
      console.error("[watchdog] GCP standup dispatch error:", err);
    }
  }

  // ── Execute failovers if needed ──
  for (const worker of evaluation.failoverTargets) {
    try {
      const record = await executeFailover(worker, env);
      state.failedOver.push(worker);
      state.routing[worker] = record;
    } catch (err) {
      // Log but don't crash the cron — try remaining workers
      console.error(`Failover failed for ${worker}:`, err);
    }
  }

  // ── Auto-revert if usage drops below 50% on all resources ──
  if (state.failedOver.length > 0) {
    const allBelow50 = Object.values(usageMap).every(r => r.pct < 50);
    if (allBelow50) {
      await revertAll(state, env);
      state.failedOver = [];
      state.routing = {};
      state.level = "normal";
    }
  }

  await saveState(env.WATCHDOG_KV, state);
}

// ---------------------------------------------------------------------------
// Daily digest handler — sends usage snapshot email
// ---------------------------------------------------------------------------

async function handleDailyDigest(env: Env): Promise<void> {
  if (!env.SENDGRID_API_KEY) {
    console.log("[watchdog] No SENDGRID_API_KEY — skipping daily digest");
    return;
  }

  // Ensure we have fresh usage data
  const state = await loadState(env.WATCHDOG_KV);
  // If last check is stale (>2h ago), do a fresh poll first
  const lastCheck = state.lastCheck ? new Date(state.lastCheck).getTime() : 0;
  if (Date.now() - lastCheck > 2 * 60 * 60 * 1000) {
    await handleCron(env);
  }

  const freshState = await loadState(env.WATCHDOG_KV);
  try {
    const result = await sendDigestEmail(env, freshState);
    console.log("[watchdog] Daily digest sent:", result);
  } catch (err) {
    console.error("[watchdog] Daily digest failed:", err);
  }
}

// ---------------------------------------------------------------------------
// HTTP handler — admin endpoints
// ---------------------------------------------------------------------------

async function handleRequest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // All endpoints require admin auth
  if (!verifyAdmin(req, env)) return unauthorized();

  // ── GET /v1/watchdog/status ──
  if (req.method === "GET" && path === "/v1/watchdog/status") {
    const state = await loadState(env.WATCHDOG_KV);
    return jsonResponse({
      ok: true,
      ...state,
      workerPriority: FAILOVER_PRIORITY,
      knownRoutes: Object.keys(WORKER_ROUTES),
    });
  }

  // ── POST /v1/watchdog/check ── (manually trigger a usage check)
  if (req.method === "POST" && path === "/v1/watchdog/check") {
    try {
      await handleCron(env);
    } catch (err: any) {
      return jsonResponse({ ok: false, error: { code: "check_failed", message: err?.message ?? String(err) } }, 502);
    }
    const state = await loadState(env.WATCHDOG_KV);
    return jsonResponse({ ok: true, ...state });
  }

  // ── POST /v1/watchdog/failover ── (manually fail over a specific worker)
  if (req.method === "POST" && path === "/v1/watchdog/failover") {
    const body: any = await req.json().catch(() => ({}));
    const worker = body?.worker;
    if (!worker || !WORKER_ROUTES[worker]) {
      return jsonResponse(
        { error: { code: "bad_request", message: `Unknown worker: ${worker}. Known: ${Object.keys(WORKER_ROUTES).join(", ")}` } },
        400,
      );
    }
    const state = await loadState(env.WATCHDOG_KV);
    if (state.failedOver.includes(worker)) {
      return jsonResponse(
        { error: { code: "conflict", message: `${worker} is already failed over` } },
        409,
      );
    }
    const record = await executeFailover(worker, env);
    state.failedOver.push(worker);
    state.routing[worker] = record;
    await saveState(env.WATCHDOG_KV, state);
    return jsonResponse({ ok: true, failover: record });
  }

  // ── POST /v1/watchdog/revert ── (revert ALL failovers)
  if (req.method === "POST" && path === "/v1/watchdog/revert") {
    const state = await loadState(env.WATCHDOG_KV);
    const reverted = await revertAll(state, env);
    state.failedOver = [];
    state.routing = {};
    state.level = "normal";
    await saveState(env.WATCHDOG_KV, state);
    return jsonResponse({ ok: true, reverted });
  }

  // ── POST /v1/watchdog/revert/:worker ── (revert a single worker)
  const revertMatch = path.match(/^\/v1\/watchdog\/revert\/(.+)$/);
  if (req.method === "POST" && revertMatch) {
    const worker = revertMatch[1];
    const state = await loadState(env.WATCHDOG_KV);
    const record = state.routing[worker];
    if (!record) {
      return jsonResponse(
        { error: { code: "not_found", message: `${worker} is not currently failed over` } },
        404,
      );
    }
    await executeRevert(record, env);
    state.failedOver = state.failedOver.filter(w => w !== worker);
    delete state.routing[worker];
    // Re-evaluate level
    if (state.failedOver.length === 0) state.level = "normal";
    await saveState(env.WATCHDOG_KV, state);
    return jsonResponse({ ok: true, reverted: worker });
  }

  // ── POST /v1/watchdog/gcp-url ── (register a GCP endpoint for a worker)
  if (req.method === "POST" && path === "/v1/watchdog/gcp-url") {
    const body: any = await req.json().catch(() => ({}));
    const { worker, url: gcpUrl } = body ?? {};
    if (!worker || !gcpUrl) {
      return jsonResponse(
        { error: { code: "bad_request", message: "Required: worker, url" } },
        400,
      );
    }
    await env.WATCHDOG_KV.put(`gcp:${worker}`, gcpUrl);
    return jsonResponse({ ok: true, worker, gcpUrl });
  }

  // ── POST /v1/watchdog/digest ── (manually send a digest email)
  if (req.method === "POST" && path === "/v1/watchdog/digest") {
    if (!env.SENDGRID_API_KEY) {
      return jsonResponse(
        { error: { code: "not_configured", message: "SENDGRID_API_KEY not set" } },
        400,
      );
    }
    const state = await loadState(env.WATCHDOG_KV);
    const result = await sendDigestEmail(env, state);
    return jsonResponse({ ok: result.ok, status: result.status, messageId: result.messageId });
  }

  return jsonResponse(
    { error: { code: "not_found", message: "Unknown endpoint" } },
    404,
  );
}

// ---------------------------------------------------------------------------
// Worker export
// ---------------------------------------------------------------------------

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return handleRequest(req, env);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Dispatch: "0 8 * * 1-5" → daily digest, everything else → usage check
    const hour = new Date(event.scheduledTime).getUTCHours();
    const cron = event.cron;

    if (cron === "0 8 * * 1-5" || (hour === 8 && cron.includes("8"))) {
      // Daily digest (8am UTC weekdays) — also runs a usage check first
      ctx.waitUntil(handleDailyDigest(env));
    } else {
      // Hourly usage check
      ctx.waitUntil(handleCron(env));
    }
  },
};
