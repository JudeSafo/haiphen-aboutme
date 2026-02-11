// haiphen-api/src/quota_do.ts — Centralized Daily Quota enforcement
//
// Single Durable Object instance that tracks:
//   - Global daily request count (across all users)
//   - Per-user daily request counts
//   - Unique session hashes for traffic analytics
//
// Resets automatically at UTC midnight.

type Plan = "free" | "pro" | "enterprise";

const DAILY_LIMITS: Record<Plan, number> = {
  free: 1_000,
  pro: 10_000,
  enterprise: 50_000,
};

// 10M req/month ÷ 30 days ≈ 333K/day total capacity (CF $5 tier)
const GLOBAL_THRESHOLDS: Record<Plan, number> = {
  free: 200_000,       // 60% — watchdog WARNING
  pro: 267_000,        // 80% — watchdog FAILOVER
  enterprise: 300_000, // 90% — watchdog CRITICAL
};

const HARD_CEILING = 333_000;

type ConsumeRequest = {
  user_id: string;
  plan: Plan;
  cost?: number;
  session_hash?: string;
};

type ConsumeResponse = {
  allowed: boolean;
  reason?: string;
  remaining_user: number;
  remaining_global: number;
  reset_at: string;
};

type QuotaState = {
  date: string;
  globalCount: number;
  userCounts: Record<string, number>;
  sessionHashes: string[];
};

function utcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function utcMidnightIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export class QuotaDO {
  private state: DurableObjectState;
  private data: QuotaState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async load(): Promise<QuotaState> {
    if (this.data && this.data.date === utcDateStr()) return this.data;

    const stored = await this.state.storage.get<QuotaState>("quota");
    const today = utcDateStr();

    if (stored && stored.date === today) {
      this.data = stored;
    } else {
      // New day — reset
      this.data = { date: today, globalCount: 0, userCounts: {}, sessionHashes: [] };
    }
    return this.data;
  }

  private async persist(): Promise<void> {
    if (this.data) {
      await this.state.storage.put("quota", this.data);
    }
  }

  async fetch(req: Request): Promise<Response> {
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
    const body = await req.json().catch(() => null) as ConsumeRequest | null;
    if (!body?.user_id || !body?.plan) {
      return jsonRes({ allowed: false, reason: "bad_request" }, 400);
    }

    const plan = body.plan as Plan;
    if (!DAILY_LIMITS[plan]) {
      return jsonRes({ allowed: false, reason: "invalid_plan" }, 400);
    }

    const cost = Math.max(1, Math.floor(body.cost ?? 1));
    const data = await this.load();
    const resetAt = utcMidnightIso();

    // Track session hash
    if (body.session_hash && !data.sessionHashes.includes(body.session_hash)) {
      // Cap stored hashes to prevent memory bloat (keep last 10k)
      if (data.sessionHashes.length < 10_000) {
        data.sessionHashes.push(body.session_hash);
      }
    }

    const userCount = data.userCounts[body.user_id] ?? 0;
    const userLimit = DAILY_LIMITS[plan];
    const globalThreshold = GLOBAL_THRESHOLDS[plan];

    // Check global hard ceiling
    if (data.globalCount + cost > HARD_CEILING) {
      await this.persist();
      const res: ConsumeResponse = {
        allowed: false,
        reason: "global_ceiling",
        remaining_user: Math.max(0, userLimit - userCount),
        remaining_global: Math.max(0, HARD_CEILING - data.globalCount),
        reset_at: resetAt,
      };
      return jsonRes(res, 200);
    }

    // Check global threshold for plan tier
    if (data.globalCount + cost > globalThreshold) {
      await this.persist();
      const res: ConsumeResponse = {
        allowed: false,
        reason: "global_throttle",
        remaining_user: Math.max(0, userLimit - userCount),
        remaining_global: Math.max(0, globalThreshold - data.globalCount),
        reset_at: resetAt,
      };
      return jsonRes(res, 200);
    }

    // Check per-user limit
    if (userCount + cost > userLimit) {
      await this.persist();
      const res: ConsumeResponse = {
        allowed: false,
        reason: "user_quota_exceeded",
        remaining_user: Math.max(0, userLimit - userCount),
        remaining_global: Math.max(0, globalThreshold - data.globalCount),
        reset_at: resetAt,
      };
      return jsonRes(res, 200);
    }

    // Consume
    data.globalCount += cost;
    data.userCounts[body.user_id] = userCount + cost;
    await this.persist();

    const res: ConsumeResponse = {
      allowed: true,
      remaining_user: Math.max(0, userLimit - (userCount + cost)),
      remaining_global: Math.max(0, globalThreshold - data.globalCount),
      reset_at: resetAt,
    };
    return jsonRes(res, 200);
  }

  private async handleStatus(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    const plan = (url.searchParams.get("plan") || "free") as Plan;

    const data = await this.load();
    const userCount = userId ? (data.userCounts[userId] ?? 0) : 0;
    const userLimit = DAILY_LIMITS[plan] ?? DAILY_LIMITS.free;
    const globalPct = Math.round((data.globalCount / HARD_CEILING) * 100);

    return jsonRes({
      date: data.date,
      user_used: userCount,
      user_limit: userLimit,
      user_remaining: Math.max(0, userLimit - userCount),
      global_used: data.globalCount,
      global_ceiling: HARD_CEILING,
      global_percent: globalPct,
      reset_at: utcMidnightIso(),
    }, 200);
  }

  private async handleSummary(): Promise<Response> {
    const data = await this.load();

    // Top 10 users by usage
    const sorted = Object.entries(data.userCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([user_id, count]) => ({ user_id, count }));

    return jsonRes({
      date: data.date,
      global_count: data.globalCount,
      global_ceiling: HARD_CEILING,
      unique_sessions: data.sessionHashes.length,
      top_users: sorted,
      reset_at: utcMidnightIso(),
    }, 200);
  }
}

function jsonRes(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
