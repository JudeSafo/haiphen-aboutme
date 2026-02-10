// ---------------------------------------------------------------------------
// Firestore KV Adapter — drop-in replacement for env.KV (KVNamespace)
//
// Maps KV get/put/delete/list to a Firestore collection where each KV key
// is a document ID and the value is stored in a `value` field.
// ---------------------------------------------------------------------------

import { Firestore, FieldValue } from "@google-cloud/firestore";
import type { KVNamespace } from "./types";

/**
 * Create a KV-compatible adapter backed by a Firestore collection.
 *
 * @param db           Firestore instance.
 * @param namespace    Collection name prefix (e.g. "kv_revoke" for REVOKE_KV).
 */
export class FirestoreKVAdapter implements KVNamespace {
  private coll: FirebaseFirestore.CollectionReference;

  constructor(db: Firestore, namespace: string) {
    this.coll = db.collection(namespace);
  }

  async get(key: string): Promise<string | null> {
    const doc = await this.coll.doc(this.encodeKey(key)).get();
    if (!doc.exists) return null;

    const data = doc.data()!;

    // Check TTL expiration
    if (data.expiresAt) {
      const expiresAt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
      if (expiresAt <= new Date()) {
        // Expired — delete and return null (lazy expiry)
        await this.coll.doc(this.encodeKey(key)).delete();
        return null;
      }
    }

    return data.value ?? null;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void> {
    const doc: Record<string, unknown> = {
      value,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (options?.expirationTtl) {
      doc.expiresAt = new Date(Date.now() + options.expirationTtl * 1000);
    }
    if (options?.metadata !== undefined) {
      doc.metadata = options.metadata;
    }

    await this.coll.doc(this.encodeKey(key)).set(doc);
  }

  async delete(key: string): Promise<void> {
    await this.coll.doc(this.encodeKey(key)).delete();
  }

  async list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: { name: string; expiration?: number; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }> {
    const limit = options?.limit ?? 1000;
    let query: FirebaseFirestore.Query = this.coll;

    if (options?.prefix) {
      // Firestore doesn't have native prefix queries on doc IDs,
      // so we use a range query on an indexed `key` field.
      const endPrefix = options.prefix.slice(0, -1) + String.fromCharCode(options.prefix.charCodeAt(options.prefix.length - 1) + 1);
      query = query.where("__name__", ">=", options.prefix).where("__name__", "<", endPrefix);
    }

    if (options?.cursor) {
      const cursorDoc = await this.coll.doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    query = query.limit(limit + 1); // fetch one extra to detect pagination
    const snap = await query.get();
    const docs = snap.docs;
    const hasMore = docs.length > limit;
    const resultDocs = hasMore ? docs.slice(0, limit) : docs;

    const keys = resultDocs.map(d => {
      const data = d.data();
      return {
        name: this.decodeKey(d.id),
        expiration: data.expiresAt ? Math.floor(new Date(data.expiresAt).getTime() / 1000) : undefined,
        metadata: data.metadata,
      };
    });

    return {
      keys,
      list_complete: !hasMore,
      cursor: hasMore ? resultDocs[resultDocs.length - 1].id : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Key encoding — Firestore doc IDs can't contain / so we encode them
  // ---------------------------------------------------------------------------

  private encodeKey(key: string): string {
    return key.replace(/\//g, "__SLASH__");
  }

  private decodeKey(encoded: string): string {
    return encoded.replace(/__SLASH__/g, "/");
  }
}
