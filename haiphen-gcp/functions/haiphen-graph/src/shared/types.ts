// ---------------------------------------------------------------------------
// Shared type definitions for GCP failover adapters
// ---------------------------------------------------------------------------

/**
 * Minimal D1-compatible interfaces.
 * Workers call: env.DB.prepare(sql).bind(...args).run()/all()/first()
 */
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: {
    changes: number;
    last_row_id: number;
    duration: number;
  };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
  exec(sql: string): Promise<D1Result>;
}

/**
 * Minimal KV-compatible interface.
 * Workers call: env.KV.get(key), .put(key, value, opts), .delete(key), .list()
 */
export interface KVNamespace {
  get(key: string, options?: { type?: "text" | "json" | "arrayBuffer" | "stream" }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string; expiration?: number; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

/**
 * Tables synced from D1 to Firestore (auth-critical).
 */
export const SYNC_TABLES = [
  "users",
  "plans",
  "entitlements",
  "api_keys",
  "tos_documents",
  "tos_acceptances",
] as const;

export type SyncTable = typeof SYNC_TABLES[number];
