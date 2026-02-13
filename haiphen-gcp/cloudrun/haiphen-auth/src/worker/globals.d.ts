// ---------------------------------------------------------------------------
// CF Worker global type shims for GCP compilation.
//
// These declarations provide the Cloudflare-specific types (D1, KV, DOs,
// WebSocketPair, etc.) that worker source code depends on, allowing it to
// compile under standard TypeScript without @cloudflare/workers-types.
// ---------------------------------------------------------------------------

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number; duration: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  raw<T = unknown[]>(): Promise<T[]>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
  exec(sql: string): Promise<D1Result>;
}

interface KVNamespace {
  get(key: string, options?: { type?: string }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string; expiration?: number; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  id: DurableObjectId;
  waitUntil(promise: Promise<unknown>): void;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  deleteAll(): Promise<void>;
  list(options?: { prefix?: string; limit?: number; reverse?: boolean }): Promise<Map<string, unknown>>;
}

// Fix Uint8Array BufferSource compatibility under strict TS
type BufferSource = ArrayBufferView | ArrayBuffer;

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// CF-specific WebSocket types
declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
  constructor();
}

// Extend Response to support CF's webSocket property
interface ResponseInit {
  webSocket?: WebSocket;
}

// Extend WebSocket for CF server-side accept()
interface WebSocket {
  accept(): void;
}
