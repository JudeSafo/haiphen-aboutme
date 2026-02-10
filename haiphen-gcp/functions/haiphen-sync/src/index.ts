// ---------------------------------------------------------------------------
// haiphen-sync — D1 → Firestore sync Cloud Function
//
// Runs daily (2am UTC via Cloud Scheduler). Reads auth-critical D1 tables
// via the Cloudflare REST API and writes them to Firestore collections.
// This ensures GCP failover services have fresh data.
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";
import * as ff from "@google-cloud/functions-framework";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CF_API = "https://api.cloudflare.com/client/v4";
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? "";
const CF_D1_DATABASE_ID = process.env.CF_D1_DATABASE_ID ?? "9a26fb67-b6e5-4d5f-8e62-3ecfde5ee8c2";
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? "";

/** Auth-critical tables to sync. Skip analytics/non-critical tables. */
const SYNC_TABLES = [
  "users",
  "plans",
  "entitlements",
  "api_keys",
  "tos_documents",
  "tos_acceptances",
];

/** Max rows per table query (pagination). */
const PAGE_SIZE = 500;

/** Firestore batch write limit. */
const BATCH_LIMIT = 500;

// ---------------------------------------------------------------------------
// D1 REST API client
// ---------------------------------------------------------------------------

interface D1QueryResult {
  success: boolean;
  result: Array<{
    results: Record<string, unknown>[];
    success: boolean;
  }>;
}

async function queryD1(sql: string): Promise<Record<string, unknown>[]> {
  const url = `${CF_API}/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 query failed (${res.status}): ${text}`);
  }

  const json = await res.json() as D1QueryResult;
  if (!json.success || !json.result?.[0]?.results) {
    throw new Error(`D1 query unsuccessful: ${JSON.stringify(json)}`);
  }
  return json.result[0].results;
}

// ---------------------------------------------------------------------------
// Primary key detection — infer from column names
// ---------------------------------------------------------------------------

function inferPrimaryKey(table: string, columns: string[]): string {
  // Prefer explicit ID columns
  const candidates = [
    `${table.replace(/s$/, "")}_id`,  // e.g. users → user_id
    "id",
    "user_login",
    "key_hash",
  ];
  for (const c of candidates) {
    if (columns.includes(c)) return c;
  }
  // Fall back to first column
  return columns[0];
}

// ---------------------------------------------------------------------------
// Sync a single table from D1 → Firestore
// ---------------------------------------------------------------------------

async function syncTable(
  db: Firestore,
  table: string,
): Promise<{ table: string; synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;
  let offset = 0;
  let pkCol: string | null = null;

  const coll = db.collection(table);

  while (true) {
    const rows = await queryD1(
      `SELECT * FROM ${table} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    );

    if (rows.length === 0) break;

    // Detect PK from first batch
    if (!pkCol) {
      const cols = Object.keys(rows[0]);
      pkCol = inferPrimaryKey(table, cols);
    }

    // Write in batches of BATCH_LIMIT
    for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
      const chunk = rows.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();

      for (const row of chunk) {
        const docId = String(row[pkCol!] ?? `row_${offset + i}`);
        const docRef = coll.doc(docId);
        batch.set(docRef, {
          ...row,
          _synced_at: new Date().toISOString(),
        });
        synced++;
      }

      try {
        await batch.commit();
      } catch (err) {
        console.error(`Batch write error for ${table}:`, err);
        errors += chunk.length;
        synced -= chunk.length;
      }
    }

    // If fewer rows than page size, we've reached the end
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { table, synced, errors };
}

// ---------------------------------------------------------------------------
// Cloud Function entry point
// ---------------------------------------------------------------------------

ff.http("handler", async (req, res) => {
  const start = Date.now();
  console.log("[sync] Starting D1 → Firestore sync...");

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    res.status(500).json({
      ok: false,
      error: "Missing CF_ACCOUNT_ID or CF_API_TOKEN environment variables",
    });
    return;
  }

  const db = new Firestore();
  const results: Array<{ table: string; synced: number; errors: number }> = [];

  for (const table of SYNC_TABLES) {
    try {
      console.log(`[sync] Syncing ${table}...`);
      const result = await syncTable(db, table);
      results.push(result);
      console.log(`[sync] ${table}: ${result.synced} rows synced, ${result.errors} errors`);
    } catch (err) {
      console.error(`[sync] ${table} failed:`, err);
      results.push({ table, synced: 0, errors: -1 });
    }
  }

  const duration = Date.now() - start;
  const summary = {
    ok: true,
    duration_ms: duration,
    tables: results,
    total_synced: results.reduce((a, r) => a + r.synced, 0),
    total_errors: results.reduce((a, r) => a + Math.max(r.errors, 0), 0),
  };

  console.log("[sync] Complete:", JSON.stringify(summary));

  // Also write sync metadata to Firestore
  await db.collection("_sync_log").doc(new Date().toISOString().split("T")[0]).set({
    ...summary,
    ran_at: new Date().toISOString(),
  });

  res.status(200).json(summary);
});
