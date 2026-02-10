// ---------------------------------------------------------------------------
// Firestore-backed rate limiter — replaces RateLimiterDO for GCP failover.
//
// Uses an in-memory sliding-window counter with Firestore write-behind.
// This is NOT distributed (each Cloud Run instance has its own counter),
// which is fine during failover — limits are approximate, not exact.
// ---------------------------------------------------------------------------

import { Firestore, FieldValue } from "@google-cloud/firestore";

/** Plan tier limits (requests per minute) — must match haiphen-api/src/rate_limit_do.ts */
const PLAN_LIMITS: Record<string, number> = {
  free: 60,
  pro: 600,
  enterprise: 6000,
};
const DEFAULT_LIMIT = 60;
const WINDOW_MS = 60_000;

interface RateBucket {
  timestamps: number[];
  lastFlushed: number;
}

/**
 * In-memory rate limit state. One bucket per key (typically user sub).
 * Flushed to Firestore every 5 seconds for observability, but the
 * primary enforcement is in-memory.
 */
const buckets = new Map<string, RateBucket>();

function getBucket(key: string): RateBucket {
  let b = buckets.get(key);
  if (!b) {
    b = { timestamps: [], lastFlushed: Date.now() };
    buckets.set(key, b);
  }
  return b;
}

function pruneOld(b: RateBucket, now: number): void {
  const cutoff = now - WINDOW_MS;
  b.timestamps = b.timestamps.filter(t => t > cutoff);
}

export class FirestoreRateLimiterStub {
  private db: Firestore;
  private id: string;

  constructor(db: Firestore, id: string) {
    this.db = db;
    this.id = id;
  }

  /**
   * Mimics the DurableObject fetch interface:
   *   POST /check  body: { plan }
   *   Returns: { allowed: boolean, remaining: number, limit: number, reset: number }
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/check" && request.method === "POST") {
      const body = await request.json() as { plan?: string };
      const plan = body.plan ?? "free";
      const limit = PLAN_LIMITS[plan] ?? DEFAULT_LIMIT;
      const now = Date.now();
      const bucket = getBucket(this.id);

      pruneOld(bucket, now);

      if (bucket.timestamps.length >= limit) {
        return Response.json({
          allowed: false,
          remaining: 0,
          limit,
          reset: Math.ceil((bucket.timestamps[0]! + WINDOW_MS - now) / 1000),
        });
      }

      bucket.timestamps.push(now);

      // Write-behind to Firestore (non-blocking, every 5s)
      if (now - bucket.lastFlushed > 5_000) {
        bucket.lastFlushed = now;
        this.db
          .collection("rate_limits")
          .doc(this.id)
          .set(
            {
              count: bucket.timestamps.length,
              plan,
              updated_at: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
          .catch((err) => console.warn("Rate-limit flush error:", err));
      }

      return Response.json({
        allowed: true,
        remaining: limit - bucket.timestamps.length,
        limit,
        reset: 60,
      });
    }

    return new Response("Not found", { status: 404 });
  }
}

/**
 * Mimics DurableObjectNamespace — env.RATE_LIMITER.get(id) returns a stub.
 */
export class FirestoreRateLimiterNamespace {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  idFromName(name: string): { toString(): string } {
    return { toString: () => name };
  }

  get(id: { toString(): string }): FirestoreRateLimiterStub {
    return new FirestoreRateLimiterStub(this.db, id.toString());
  }
}
