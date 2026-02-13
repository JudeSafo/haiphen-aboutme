// ---------------------------------------------------------------------------
// D1 REST API writer with Firestore fallback
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";

const CF_API = "https://api.cloudflare.com/client/v4";
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? "";
const CF_D1_DATABASE_ID = process.env.CF_D1_DATABASE_ID ?? "";
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProspectSource {
  source_id: string;
  name: string;
  api_base_url: string;
  rate_limit_rpm: number;
  last_crawled_at: string | null;
  last_cursor: string | null;
  enabled: number;
  config_json: string | null;
}

export interface ProspectTarget {
  target_id: string;
  name: string;
  ticker: string | null;
  cik: string | null;
  domains: string | null;   // JSON array
  industry: string | null;
  sector: string | null;
  keywords: string | null;  // JSON array
  products: string | null;  // JSON array
  status: string;
}

export interface ProspectLead {
  lead_id: string;
  source_id: string;
  entity_type: "company" | "device" | "system" | "network" | "software";
  entity_name: string;
  entity_domain?: string | null;
  industry?: string | null;
  country?: string | null;
  vulnerability_id?: string | null;
  severity?: "critical" | "high" | "medium" | "low" | "info" | null;
  cvss_score?: number | null;
  summary: string;
  raw_data_json?: string | null;
  services_json?: string | null;
  status?: string;
  signal_type?: string;
  impact_score?: number | null;
  target_id?: string | null;
}

export interface ProspectAnalysis {
  analysis_id: string;
  lead_id: string;
  service: string;
  status: string;
  result_json?: string | null;
  score?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
}

// ---------------------------------------------------------------------------
// D1 REST API helpers
// ---------------------------------------------------------------------------

interface D1QueryResult {
  success: boolean;
  result: Array<{
    results: Record<string, unknown>[];
    success: boolean;
  }>;
}

let useFirestoreFallback = false;
let firestoreDb: Firestore | null = null;

function getFirestore(): Firestore {
  if (!firestoreDb) {
    firestoreDb = new Firestore();
  }
  return firestoreDb;
}

async function queryD1(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const url = `${CF_API}/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (res.status === 429) {
    console.warn("[d1-writer] D1 rate limited (429), switching to Firestore fallback");
    useFirestoreFallback = true;
    throw new Error("D1_RATE_LIMITED");
  }

  if (!res.ok) {
    const text = await res.text();
    if (text.includes("quota") || text.includes("limit")) {
      console.warn("[d1-writer] D1 quota exceeded, switching to Firestore fallback");
      useFirestoreFallback = true;
      throw new Error("D1_QUOTA_EXCEEDED");
    }
    throw new Error(`D1 query failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as D1QueryResult;
  if (!json.success || !json.result?.[0]) {
    throw new Error(`D1 query unsuccessful: ${JSON.stringify(json)}`);
  }
  return json.result[0].results ?? [];
}

async function execD1(sql: string, params: unknown[] = []): Promise<void> {
  await queryD1(sql, params);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function readSources(): Promise<ProspectSource[]> {
  const rows = await queryD1("SELECT * FROM prospect_sources WHERE enabled = 1");
  return rows as unknown as ProspectSource[];
}

export async function readLeads(filter: {
  status?: string;
  source_id?: string;
  severity?: string;
  limit?: number;
}): Promise<ProspectLead[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.source_id) {
    clauses.push("source_id = ?");
    params.push(filter.source_id);
  }
  if (filter.severity) {
    clauses.push("severity = ?");
    params.push(filter.severity);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = filter.limit ?? 50;

  const rows = await queryD1(
    `SELECT * FROM prospect_leads ${where} ORDER BY created_at DESC LIMIT ?`,
    [...params, limit],
  );
  return rows as unknown as ProspectLead[];
}

export async function writeLead(lead: ProspectLead): Promise<boolean> {
  if (useFirestoreFallback) {
    return writeLeadFirestore(lead);
  }

  try {
    await execD1(
      `INSERT INTO prospect_leads (
        lead_id, source_id, entity_type, entity_name, entity_domain,
        industry, country, vulnerability_id, severity, cvss_score,
        summary, raw_data_json, services_json, status, signal_type, impact_score, target_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
      ON CONFLICT (source_id, vulnerability_id, entity_name) DO NOTHING`,
      [
        lead.lead_id,
        lead.source_id,
        lead.entity_type,
        lead.entity_name,
        lead.entity_domain ?? null,
        lead.industry ?? null,
        lead.country ?? null,
        lead.vulnerability_id ?? null,
        lead.severity ?? null,
        lead.cvss_score ?? null,
        lead.summary,
        lead.raw_data_json ?? null,
        lead.services_json ?? null,
        lead.signal_type ?? "vulnerability",
        lead.impact_score ?? null,
        lead.target_id ?? null,
      ],
    );
    return true;
  } catch (err: any) {
    if (useFirestoreFallback) {
      return writeLeadFirestore(lead);
    }
    throw err;
  }
}

async function writeLeadFirestore(lead: ProspectLead): Promise<boolean> {
  const db = getFirestore();
  const docId = lead.lead_id;
  await db.collection("prospect_leads").doc(docId).set({
    ...lead,
    _synced_at: new Date().toISOString(),
  }, { merge: true });
  return true;
}

export async function writeAnalysis(analysis: ProspectAnalysis): Promise<void> {
  if (useFirestoreFallback) {
    const db = getFirestore();
    await db.collection("prospect_analyses").doc(analysis.analysis_id).set({
      ...analysis,
      _synced_at: new Date().toISOString(),
    }, { merge: true });
    return;
  }

  await execD1(
    `INSERT INTO prospect_analyses (
      analysis_id, lead_id, service, status, result_json, score, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (lead_id, service) DO UPDATE SET
      status = excluded.status,
      result_json = excluded.result_json,
      score = excluded.score,
      completed_at = excluded.completed_at`,
    [
      analysis.analysis_id,
      analysis.lead_id,
      analysis.service,
      analysis.status,
      analysis.result_json ?? null,
      analysis.score ?? null,
      analysis.started_at ?? null,
      analysis.completed_at ?? null,
    ],
  );
}

export async function updateSourceCursor(
  sourceId: string,
  cursor: string | null,
): Promise<void> {
  await execD1(
    `UPDATE prospect_sources
     SET last_crawled_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         last_cursor = ?
     WHERE source_id = ?`,
    [cursor, sourceId],
  );
}

export async function readTarget(targetId: string): Promise<ProspectTarget | null> {
  const rows = await queryD1(
    `SELECT * FROM prospect_targets WHERE target_id = ? AND status = 'active'`,
    [targetId],
  );
  return (rows[0] as unknown as ProspectTarget) ?? null;
}

export async function readTargets(filter?: { status?: string; sector?: string; limit?: number }): Promise<ProspectTarget[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter?.status) { clauses.push("status = ?"); params.push(filter.status); }
  else { clauses.push("status = 'active'"); }
  if (filter?.sector) { clauses.push("sector = ?"); params.push(filter.sector); }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = filter?.limit ?? 100;

  const rows = await queryD1(
    `SELECT * FROM prospect_targets ${where} ORDER BY name LIMIT ?`,
    [...params, limit],
  );
  return rows as unknown as ProspectTarget[];
}
