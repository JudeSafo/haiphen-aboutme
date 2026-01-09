export type RateLimitPlan = {
  limitPerMinute: number;   // e.g. 60 or 600
  burst: number;            // e.g. 10 or 60
};

type State = {
  tokens: number;
  lastRefillMs: number;
};

export class RateLimiterDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/consume") return new Response("Not found", { status: 404 });

    const body = await req.json().catch(() => null) as null | {
      plan: RateLimitPlan;
      cost?: number;
      nowMs?: number;
    };

    if (!body?.plan) return new Response("Bad request", { status: 400 });

    const cost = Math.max(1, Math.floor(body.cost ?? 1));
    const nowMs = body.nowMs ?? Date.now();

    const key = "rl_state";
    const stored = (await this.state.storage.get<State>(key)) ?? null;

    const limit = body.plan.limitPerMinute;
    const burst = body.plan.burst;

    // refill rate: tokens per ms
    const refillPerMs = limit / 60_000;

    let tokens = stored?.tokens ?? burst;
    let lastRefillMs = stored?.lastRefillMs ?? nowMs;

    // refill
    const elapsed = Math.max(0, nowMs - lastRefillMs);
    tokens = Math.min(burst, tokens + elapsed * refillPerMs);
    lastRefillMs = nowMs;

    const allowed = tokens >= cost;
    if (allowed) tokens -= cost;

    // compute reset: when tokens reach at least 1
    const msUntil1 = tokens >= 1 ? 0 : Math.ceil((1 - tokens) / refillPerMs);
    const resetMs = nowMs + msUntil1;

    await this.state.storage.put<State>(key, { tokens, lastRefillMs });

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
}