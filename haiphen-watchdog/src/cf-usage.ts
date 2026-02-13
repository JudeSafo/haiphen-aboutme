// ---------------------------------------------------------------------------
// Cloudflare usage polling — GraphQL Analytics API
// ---------------------------------------------------------------------------

import type { Env } from "./index";
import type { ResourceKey } from "./thresholds";

const CF_GQL_URL = "https://api.cloudflare.com/client/v4/graphql";

// ---------------------------------------------------------------------------
// Helper: authenticated fetch against CF API
// ---------------------------------------------------------------------------

async function cfFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Execute a CF GraphQL query with detailed error handling.
 * Returns the parsed JSON body. Throws with descriptive message on failure.
 */
async function cfGraphQL(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  label: string,
): Promise<any> {
  const res = await cfFetch(CF_GQL_URL, token, {
    method: "POST",
    body: JSON.stringify({ query, variables }),
  });

  const body = await res.text();

  if (!res.ok) {
    throw new Error(`${label}: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`${label}: invalid JSON — ${body.slice(0, 200)}`);
  }

  // GraphQL can return 200 with errors in the response body
  if (json.errors && json.errors.length > 0) {
    const msgs = json.errors.map((e: any) => e.message).join("; ");
    throw new Error(`${label}: GraphQL errors — ${msgs}`);
  }

  return json;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toDateOnly(iso: string): string {
  return iso.split("T")[0];
}

// ---------------------------------------------------------------------------
// 1. Worker requests via GraphQL Analytics
// ---------------------------------------------------------------------------

async function fetchWorkerRequests(
  accountId: string,
  token: string,
  monthStart: string,
  now: string,
): Promise<number> {
  const query = `
    query WorkerAnalytics($accountId: String!, $start: Time!, $end: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountId }) {
          workersInvocationsAdaptive(
            filter: { datetime_geq: $start, datetime_leq: $end }
            limit: 10000
          ) {
            sum { requests }
          }
        }
      }
    }
  `;
  const json = await cfGraphQL(token, query, {
    accountId,
    start: monthStart,
    end: now,
  }, "Workers");

  const rows = json?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  return rows?.[0]?.sum?.requests ?? 0;
}

// ---------------------------------------------------------------------------
// 2. D1 usage via GraphQL Analytics (rows read / rows written)
// ---------------------------------------------------------------------------

interface D1Usage {
  d1RowsRead: number;
  d1RowsWritten: number;
}

async function fetchD1Usage(
  accountId: string,
  databaseId: string,
  token: string,
  monthStart: string,
  now: string,
): Promise<D1Usage> {
  const query = `
    query D1Analytics($accountId: String!, $dbId: String!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountId }) {
          d1AnalyticsAdaptiveGroups(
            filter: { databaseId: $dbId, date_geq: $start, date_leq: $end }
            limit: 10000
          ) {
            sum {
              rowsRead
              rowsWritten
            }
          }
        }
      }
    }
  `;
  const json = await cfGraphQL(token, query, {
    accountId,
    dbId: databaseId,
    start: toDateOnly(monthStart),
    end: toDateOnly(now),
  }, "D1");

  const rows = json?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
  const sum = rows?.[0]?.sum ?? {};
  return {
    d1RowsRead:    sum.rowsRead    ?? 0,
    d1RowsWritten: sum.rowsWritten ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 3. KV usage via account-level analytics
// ---------------------------------------------------------------------------

interface KVUsage {
  kvReads: number;
  kvWrites: number;
}

async function fetchKVUsage(
  accountId: string,
  token: string,
  monthStart: string,
  now: string,
): Promise<KVUsage> {
  const query = `
    query KVAnalytics($accountId: String!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountId }) {
          workersKvStorageAdaptive(
            filter: { date_geq: $start, date_leq: $end }
            limit: 10000
          ) {
            sum { readOperations writeOperations }
          }
        }
      }
    }
  `;
  const json = await cfGraphQL(token, query, {
    accountId,
    start: toDateOnly(monthStart),
    end: toDateOnly(now),
  }, "KV");

  const rows = json?.data?.viewer?.accounts?.[0]?.workersKvStorageAdaptive;
  const sum = rows?.[0]?.sum ?? {};
  return {
    kvReads:  sum.readOperations  ?? 0,
    kvWrites: sum.writeOperations ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 4. Durable Object requests via GraphQL
// ---------------------------------------------------------------------------

async function fetchDORequests(
  accountId: string,
  token: string,
  monthStart: string,
  now: string,
): Promise<number> {
  const query = `
    query DOAnalytics($accountId: String!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountId }) {
          durableObjectsInvocationsAdaptiveGroups(
            filter: { date_geq: $start, date_leq: $end }
            limit: 10000
          ) {
            sum { requests }
          }
        }
      }
    }
  `;
  const json = await cfGraphQL(token, query, {
    accountId,
    start: toDateOnly(monthStart),
    end: toDateOnly(now),
  }, "DO");

  const rows = json?.data?.viewer?.accounts?.[0]?.durableObjectsInvocationsAdaptiveGroups;
  return rows?.[0]?.sum?.requests ?? 0;
}

// ---------------------------------------------------------------------------
// Public: fetch all usage into a single snapshot
// ---------------------------------------------------------------------------

export type UsageSnapshot = Record<ResourceKey, number>;

export async function fetchAllUsage(env: Env): Promise<{ snapshot: UsageSnapshot; errors: string[] }> {
  const accountId  = env.CF_ACCOUNT_ID;
  const token      = env.CF_API_TOKEN;
  const databaseId = env.CF_D1_DATABASE_ID;
  const errors: string[] = [];

  // Pre-flight: verify required env vars
  if (!token) {
    errors.push("CF_API_TOKEN is not set — all usage queries will fail");
    return {
      snapshot: {
        workerRequests: 0,
        d1RowsRead: 0,
        d1RowsWritten: 0,
        kvReads: 0,
        kvWrites: 0,
        doRequests: 0,
      },
      errors,
    };
  }
  if (!accountId) errors.push("CF_ACCOUNT_ID is not set");

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nowISO   = now.toISOString();
  const startISO = monthStart.toISOString();

  // Fire all queries in parallel — each returns its value or a fallback of 0
  const [workerRequests, d1, kv, doReqs] = await Promise.all([
    fetchWorkerRequests(accountId, token, startISO, nowISO)
      .catch((e: Error) => { errors.push(`workers: ${e.message}`); return 0; }),
    fetchD1Usage(accountId, databaseId, token, startISO, nowISO)
      .catch((e: Error) => { errors.push(`d1: ${e.message}`); return { d1RowsRead: 0, d1RowsWritten: 0 }; }),
    fetchKVUsage(accountId, token, startISO, nowISO)
      .catch((e: Error) => { errors.push(`kv: ${e.message}`); return { kvReads: 0, kvWrites: 0 }; }),
    fetchDORequests(accountId, token, startISO, nowISO)
      .catch((e: Error) => { errors.push(`do: ${e.message}`); return 0; }),
  ]);

  if (errors.length > 0) {
    console.error("[watchdog] Usage fetch errors:", errors.join("; "));
  }

  return {
    snapshot: {
      workerRequests,
      d1RowsRead:    d1.d1RowsRead,
      d1RowsWritten: d1.d1RowsWritten,
      kvReads:       kv.kvReads,
      kvWrites:      kv.kvWrites,
      doRequests:    doReqs,
    },
    errors,
  };
}
