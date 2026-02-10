// ---------------------------------------------------------------------------
// StatusDO stub — disabled during GCP failover.
//
// Checkout's StatusDO provides WebSocket-based real-time payment status.
// During failover, WebSocket connections are not supported. The checkout
// worker falls back to polling /v1/account/status. This stub returns
// a "service unavailable" response for any WebSocket upgrade attempts.
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";

export class FirestoreStatusStub {
  async fetch(_request: Request): Promise<Response> {
    return Response.json(
      { error: { code: "service_unavailable", message: "Real-time status unavailable during failover. Use polling." } },
      { status: 503 },
    );
  }
}

/**
 * Mimics DurableObjectNamespace — env.STATUS_DO.get(id) returns a stub.
 */
export class FirestoreStatusNamespace {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  idFromName(name: string): { toString(): string } {
    return { toString: () => name };
  }

  get(id: { toString(): string }): FirestoreStatusStub {
    return new FirestoreStatusStub();
  }
}
