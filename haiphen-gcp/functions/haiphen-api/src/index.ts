// ---------------------------------------------------------------------------
// haiphen-api — GCP Cloud Function entry point
//
// Wraps the CF Worker's fetch() handler with Firestore-backed adapters for
// D1, KV, and Durable Objects (RateLimiterDO, QuotaDO).
//
// The API worker source (haiphen-api/src/) is copied into src/worker/ by the
// build script and compiled alongside this file as CommonJS.
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";
import * as ff from "@google-cloud/functions-framework";
import { FirestoreD1Adapter } from "./shared/firestore-d1";
import { FirestoreKVAdapter } from "./shared/firestore-kv";

// ---------------------------------------------------------------------------
// Firestore-backed DurableObject namespace replacements
//
// The API worker calls env.RATE_LIMITER.idFromName(name).get(id) to get a
// stub, then stub.fetch(url, init). We replicate this interface but back
// the state with Firestore documents instead of DO storage.
// ---------------------------------------------------------------------------

/**
 * Minimal DurableObjectId replacement — just carries a name.
 */
class FirestoreDOId {
  constructor(public readonly name: string) {}
  toString(): string { return this.name; }
}

/**
 * RateLimiterDO stub backed by Firestore.
 *
 * Implements the same sliding-window token bucket as the real DO:
 * POST /consume { plan: { limitPerMinute, burst }, cost?, nowMs? }
 * Returns { allowed, remaining, limit, resetMs }
 */
class FirestoreRateLimiterStub {
  private docRef: FirebaseFirestore.DocumentReference;

  constructor(db: Firestore, name: string) {
    this.docRef = db.collection("rate_limiter_state").doc(name);
  }

  async fetch(input: string | Request, init?: RequestInit): Promise<Response> {
    const req = typeof input === "string" ? new Request(input, init) : input;
    const url = new URL(req.url);

    if (url.pathname !== "/consume") {
      return new Response("Not found", { status: 404 });
    }

    const body = await req.json().catch(() => null) as null | {
      plan: { limitPerMinute: number; burst: number };
      cost?: number;
      nowMs?: number;
    };

    if (!body?.plan) {
      return new Response("Bad request", { status: 400 });
    }

    const cost = Math.max(1, Math.floor(body.cost ?? 1));
    const nowMs = body.nowMs ?? Date.now();
    const limit = body.plan.limitPerMinute;
    const burst = body.plan.burst;
    const refillPerMs = limit / 60_000;

    // Read current state from Firestore
    const snap = await this.docRef.get();
    const stored = snap.exists ? snap.data() as { tokens: number; lastRefillMs: number } : null;

    let tokens = stored?.tokens ?? burst;
    let lastRefillMs = stored?.lastRefillMs ?? nowMs;

    // Refill
    const elapsed = Math.max(0, nowMs - lastRefillMs);
    tokens = Math.min(burst, tokens + elapsed * refillPerMs);
    lastRefillMs = nowMs;

    const allowed = tokens >= cost;
    if (allowed) tokens -= cost;

    // Compute reset
    const msUntil1 = tokens >= 1 ? 0 : Math.ceil((1 - tokens) / refillPerMs);
    const resetMs = nowMs + msUntil1;

    // Persist
    await this.docRef.set({ tokens, lastRefillMs });

    const result = {
      allowed,
      remaining: Math.max(0, Math.floor(tokens)),
      limit,
      resetMs,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * QuotaDO stub backed by Firestore.
 *
 * Implements the same daily quota logic as the real DO:
 * - POST /consume { user_id, plan, cost?, session_hash? }
 * - GET /status?user_id=X&plan=Y
 * - GET /summary
 */
class FirestoreQuotaStub {
  private docRef: FirebaseFirestore.DocumentReference;

  // Daily limits matching the real QuotaDO
  private static DAILY_LIMITS: Record<string, number> = {
    free: 200,
    pro: 10_000,
    enterprise: 50_000,
  };

  private static GLOBAL_THRESHOLDS: Record<string, number> = {
    free: 60_000,
    pro: 85_000,
    enterprise: 95_000,
  };

  private static HARD_CEILING = 95_000;

  constructor(db: Firestore, name: string) {
    this.docRef = db.collection("quota_state").doc(name);
  }

  private utcDateStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private utcMidnightIso(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }

  private async loadState(): Promise<{
    date: string;
    globalCount: number;
    userCounts: Record<string, number>;
    sessionHashes: string[];
  }> {
    const today = this.utcDateStr();
    const snap = await this.docRef.get();
    if (snap.exists) {
      const data = snap.data() as any;
      if (data.date === today) return data;
    }
    // New day or no state — reset
    return { date: today, globalCount: 0, userCounts: {}, sessionHashes: [] };
  }

  private async persistState(state: {
    date: string;
    globalCount: number;
    userCounts: Record<string, number>;
    sessionHashes: string[];
  }): Promise<void> {
    await this.docRef.set(state);
  }

  async fetch(input: string | Request, init?: RequestInit): Promise<Response> {
    const req = typeof input === "string" ? new Request(input, init) : input;
    const url = new URL(req.url);

    if (url.pathname === "/consume" && req.method === "POST") {
      return this.handleConsume(req);
    }
    if (url.pathname === "/status" && req.method === "GET") {
      return this.handleStatus(req);
    }
    if (url.pathname === "/summary" && req.method === "GET") {
      return this.handleSummary();
    }

    return new Response("Not found", { status: 404 });
  }

  private async handleConsume(req: Request): Promise<Response> {
    const body = await req.json().catch(() => null) as null | {
      user_id: string;
      plan: string;
      cost?: number;
      session_hash?: string;
    };

    if (!body?.user_id || !body?.plan) {
      return jsonRes({ allowed: false, reason: "bad_request" }, 400);
    }

    const plan = body.plan;
    const userLimit = FirestoreQuotaStub.DAILY_LIMITS[plan];
    if (!userLimit) {
      return jsonRes({ allowed: false, reason: "invalid_plan" }, 400);
    }

    const cost = Math.max(1, Math.floor(body.cost ?? 1));
    const data = await this.loadState();
    const resetAt = this.utcMidnightIso();
    const globalThreshold = FirestoreQuotaStub.GLOBAL_THRESHOLDS[plan] ?? FirestoreQuotaStub.GLOBAL_THRESHOLDS.free;

    // Track session hash
    if (body.session_hash && !data.sessionHashes.includes(body.session_hash)) {
      if (data.sessionHashes.length < 10_000) {
        data.sessionHashes.push(body.session_hash);
      }
    }

    const userCount = data.userCounts[body.user_id] ?? 0;

    // Check global hard ceiling
    if (data.globalCount + cost > FirestoreQuotaStub.HARD_CEILING) {
      await this.persistState(data);
      return jsonRes({
        allowed: false, reason: "global_ceiling",
        remaining_user: Math.max(0, userLimit - userCount),
        remaining_global: Math.max(0, FirestoreQuotaStub.HARD_CEILING - data.globalCount),
        reset_at: resetAt,
      }, 200);
    }

    // Check global threshold for plan tier
    if (data.globalCount + cost > globalThreshold) {
      await this.persistState(data);
      return jsonRes({
        allowed: false, reason: "global_throttle",
        remaining_user: Math.max(0, userLimit - userCount),
        remaining_global: Math.max(0, globalThreshold - data.globalCount),
        reset_at: resetAt,
      }, 200);
    }

    // Check per-user limit
    if (userCount + cost > userLimit) {
      await this.persistState(data);
      return jsonRes({
        allowed: false, reason: "user_quota_exceeded",
        remaining_user: Math.max(0, userLimit - userCount),
        remaining_global: Math.max(0, globalThreshold - data.globalCount),
        reset_at: resetAt,
      }, 200);
    }

    // Consume
    data.globalCount += cost;
    data.userCounts[body.user_id] = userCount + cost;
    await this.persistState(data);

    return jsonRes({
      allowed: true,
      remaining_user: Math.max(0, userLimit - (userCount + cost)),
      remaining_global: Math.max(0, globalThreshold - data.globalCount),
      reset_at: resetAt,
    }, 200);
  }

  private async handleStatus(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    const plan = url.searchParams.get("plan") || "free";

    const data = await this.loadState();
    const userCount = userId ? (data.userCounts[userId] ?? 0) : 0;
    const userLimit = FirestoreQuotaStub.DAILY_LIMITS[plan] ?? FirestoreQuotaStub.DAILY_LIMITS.free;
    const globalPct = Math.round((data.globalCount / FirestoreQuotaStub.HARD_CEILING) * 100);

    return jsonRes({
      date: data.date,
      user_used: userCount,
      user_limit: userLimit,
      user_remaining: Math.max(0, userLimit - userCount),
      global_used: data.globalCount,
      global_ceiling: FirestoreQuotaStub.HARD_CEILING,
      global_percent: globalPct,
      reset_at: this.utcMidnightIso(),
    }, 200);
  }

  private async handleSummary(): Promise<Response> {
    const data = await this.loadState();

    const sorted = Object.entries(data.userCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([user_id, count]) => ({ user_id, count }));

    return jsonRes({
      date: data.date,
      global_count: data.globalCount,
      global_ceiling: FirestoreQuotaStub.HARD_CEILING,
      unique_sessions: data.sessionHashes.length,
      top_users: sorted,
      reset_at: this.utcMidnightIso(),
    }, 200);
  }
}

/**
 * DurableObjectNamespace replacement backed by Firestore.
 * Provides idFromName() → get() → stub pattern.
 */
class FirestoreRateLimiterNamespace {
  constructor(private db: Firestore) {}

  idFromName(name: string): FirestoreDOId {
    return new FirestoreDOId(name);
  }

  get(id: FirestoreDOId): FirestoreRateLimiterStub {
    return new FirestoreRateLimiterStub(this.db, id.name);
  }
}

class FirestoreQuotaNamespace {
  constructor(private db: Firestore) {}

  idFromName(name: string): FirestoreDOId {
    return new FirestoreDOId(name);
  }

  get(id: FirestoreDOId): FirestoreQuotaStub {
    return new FirestoreQuotaStub(this.db, id.name);
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function jsonRes(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Worker module loader
//
// The API worker is TypeScript, compiled alongside this file to CJS.
// require() returns module.exports directly. The worker's default export
// is at module.exports.default = { fetch(...) {...} }.
// ---------------------------------------------------------------------------

function getWorkerModule(): any {
  return require("./worker/index");
}

// ---------------------------------------------------------------------------
// Lazy Firestore init
// ---------------------------------------------------------------------------

let _db: Firestore | null = null;
function getDb(): Firestore {
  if (!_db) _db = new Firestore();
  return _db;
}

// ---------------------------------------------------------------------------
// Build env object matching the API worker's Env type
// ---------------------------------------------------------------------------

function buildEnv() {
  const db = getDb();

  return {
    // D1 → Firestore
    DB: new FirestoreD1Adapter(db),

    // KV namespaces → Firestore collections
    REVOKE_KV: new FirestoreKVAdapter(db, "revoke_kv"),
    ENTITLE_KV: new FirestoreKVAdapter(db, "entitle_kv"),
    CACHE_KV: new FirestoreKVAdapter(db, "cache_kv"),

    // Durable Objects → Firestore-backed namespace stubs
    RATE_LIMITER: new FirestoreRateLimiterNamespace(db),
    QUOTA_DO: new FirestoreQuotaNamespace(db),

    // Secrets from environment variables
    JWT_SECRET: process.env.JWT_SECRET ?? "",
    API_KEY_PEPPER: process.env.API_KEY_PEPPER ?? "",
    ADMIN_TOKEN: process.env.ADMIN_TOKEN ?? "",
    INTERNAL_TOKEN: process.env.INTERNAL_TOKEN ?? "",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io,https://auth.haiphen.io",

    // Optional onboarding links
    ONBOARDING_APP_URL: process.env.ONBOARDING_APP_URL,
    ONBOARDING_DOCS_URL: process.env.ONBOARDING_DOCS_URL,
    ONBOARDING_PROFILE_URL: process.env.ONBOARDING_PROFILE_URL,
    ONBOARDING_COHORT_URL: process.env.ONBOARDING_COHORT_URL,
    ONBOARDING_CALENDAR_URL: process.env.ONBOARDING_CALENDAR_URL,
    ONBOARDING_SUPPORT_EMAIL: process.env.ONBOARDING_SUPPORT_EMAIL,
    ONBOARDING_CLI_DOCS_URL: process.env.ONBOARDING_CLI_DOCS_URL,
    ONBOARDING_API_BASE_URL: process.env.ONBOARDING_API_BASE_URL,
    ONBOARDING_WEBSOCKET_URL: process.env.ONBOARDING_WEBSOCKET_URL,
  };
}

// ---------------------------------------------------------------------------
// Cloud Function entry point
// ---------------------------------------------------------------------------

ff.http("handler", async (req, res) => {
  try {
    const env = buildEnv();
    const workerModule = getWorkerModule();

    // Build Web Request from Express request
    const protocol = req.protocol || "https";
    const host = "api.haiphen.io";
    const url = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (typeof val === "string") headers.set(key, val);
      else if (Array.isArray(val)) headers.set(key, val.join(", "));
    }

    // Serialize body for non-GET/HEAD requests
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    let body: string | undefined;
    if (hasBody && req.body) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const webReq = new Request(url, {
      method: req.method,
      headers,
      body,
    });

    // Minimal ExecutionContext (waitUntil is best-effort in CF, noop here)
    const ctx = {
      waitUntil: (_p: Promise<unknown>) => {},
      passThroughOnException: () => {},
    };

    // Call the worker's default fetch handler
    const webRes: Response = await workerModule.default.fetch(webReq, env, ctx);

    // Convert Web Response back to Express response
    res.status(webRes.status);
    webRes.headers.forEach((value, key) => res.setHeader(key, value));
    res.send(await webRes.text());
  } catch (e) {
    // The API worker throws Response objects for handled errors
    if (e instanceof Response) {
      res.status(e.status);
      e.headers.forEach((value, key) => res.setHeader(key, value));
      res.send(await e.text());
    } else {
      console.error("[haiphen-api-gcp] Unhandled error:", e);
      res.status(500).json({
        error: {
          code: "internal",
          message: "Internal error",
        },
      });
    }
  }
});
