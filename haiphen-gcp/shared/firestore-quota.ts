// ---------------------------------------------------------------------------
// Firestore-backed quota tracker — replaces QuotaDO for GCP failover.
//
// Uses Firestore atomic increments keyed by date + user. Limits match
// haiphen-api/src/quota_do.ts: free=1k, pro=10k, enterprise=50k, ceiling=333k.
// ---------------------------------------------------------------------------

import { Firestore, FieldValue } from "@google-cloud/firestore";

const PLAN_DAILY_LIMITS: Record<string, number> = {
  free: 1_000,
  pro: 10_000,
  enterprise: 50_000,
};
const GLOBAL_CEILING = 333_000;
const DEFAULT_LIMIT = 1_000;

export class FirestoreQuotaStub {
  private db: Firestore;
  private id: string; // e.g. "quota-global" or user-specific

  constructor(db: Firestore, id: string) {
    this.db = db;
    this.id = id;
  }

  /**
   * Mimics the DurableObject fetch interface:
   *   POST /consume  body: { sub, plan, count? }
   *   GET  /usage    ?sub=...
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/consume" && request.method === "POST") {
      const body = await request.json() as { sub?: string; plan?: string; count?: number };
      const sub = body.sub ?? "anonymous";
      const plan = body.plan ?? "free";
      const count = body.count ?? 1;
      const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const limit = PLAN_DAILY_LIMITS[plan] ?? DEFAULT_LIMIT;

      const docRef = this.db.collection("quota").doc(`${date}:${sub}`);

      // Transactional: read current, check limit, increment
      const result = await this.db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const current = snap.exists ? (snap.data()?.used ?? 0) as number : 0;

        if (current + count > limit) {
          return { allowed: false, used: current, limit, remaining: Math.max(0, limit - current) };
        }

        // Also check global ceiling
        const globalRef = this.db.collection("quota").doc(`${date}:__global__`);
        const globalSnap = await tx.get(globalRef);
        const globalUsed = globalSnap.exists ? (globalSnap.data()?.used ?? 0) as number : 0;

        if (globalUsed + count > GLOBAL_CEILING) {
          return { allowed: false, used: current, limit, remaining: 0, reason: "global_ceiling" };
        }

        tx.set(docRef, { used: FieldValue.increment(count), plan, updated_at: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(globalRef, { used: FieldValue.increment(count), updated_at: FieldValue.serverTimestamp() }, { merge: true });

        return { allowed: true, used: current + count, limit, remaining: limit - current - count };
      });

      return Response.json(result);
    }

    if (url.pathname === "/usage" && request.method === "GET") {
      const sub = url.searchParams.get("sub") ?? "anonymous";
      const date = new Date().toISOString().slice(0, 10);
      const docRef = this.db.collection("quota").doc(`${date}:${sub}`);
      const snap = await docRef.get();
      const used = snap.exists ? (snap.data()?.used ?? 0) as number : 0;
      const plan = snap.exists ? (snap.data()?.plan ?? "free") as string : "free";
      const limit = PLAN_DAILY_LIMITS[plan] ?? DEFAULT_LIMIT;

      return Response.json({ used, limit, remaining: Math.max(0, limit - used), plan, date });
    }

    return new Response("Not found", { status: 404 });
  }
}

/**
 * Mimics DurableObjectNamespace — env.QUOTA_DO.get(id) returns a stub.
 */
export class FirestoreQuotaNamespace {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  idFromName(name: string): { toString(): string } {
    return { toString: () => name };
  }

  get(id: { toString(): string }): FirestoreQuotaStub {
    return new FirestoreQuotaStub(this.db, id.toString());
  }
}
