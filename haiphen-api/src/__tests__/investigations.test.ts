import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";

// ---------------------------------------------------------------------------
// Helper: invoke the worker just like a real Cloudflare request
// ---------------------------------------------------------------------------
async function callWorker(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const req = new Request(input, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// ---------------------------------------------------------------------------
// Helper: mint a test JWT that the API can verify
// ---------------------------------------------------------------------------
async function mintJWT(sub = "testuser"): Promise<string> {
  const secret = (env as any).JWT_SECRET;
  const encoder = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);

  function b64url(data: Uint8Array): string {
    let str = "";
    for (let i = 0; i < data.length; i++) str += String.fromCharCode(data[i]);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  const header = b64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(encoder.encode(JSON.stringify({
    sub,
    name: "Test User",
    email: "test@example.com",
    jti: crypto.randomUUID(),
    aud: "haiphen-auth",
    iat: now,
    exp: now + 3600,
  })));

  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`)),
  );

  return `${header}.${payload}.${b64url(sig)}`;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Cookie: `auth=${token}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Bootstrap: create required D1 tables for investigation tests
// ---------------------------------------------------------------------------
beforeAll(async () => {
  const db = (env as any).DB as D1Database;

  await db.exec(
    "CREATE TABLE IF NOT EXISTS prospect_sources (source_id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, api_base_url TEXT NOT NULL, rate_limit_rpm INTEGER DEFAULT 10, last_crawled_at TEXT, last_cursor TEXT, enabled INTEGER NOT NULL DEFAULT 1, config_json TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));"
  );
  await db.exec(
    "INSERT OR IGNORE INTO prospect_sources (source_id, name, api_base_url, rate_limit_rpm, config_json) VALUES ('nvd', 'NVD CVE Database', 'https://services.nvd.nist.gov/rest/json/cves/2.0', 10, '{\"min_cvss\":7.0,\"keywords\":[\"SCADA\",\"PLC\"]}');"
  );
  await db.exec(
    "CREATE TABLE IF NOT EXISTS prospect_leads (lead_id TEXT NOT NULL PRIMARY KEY, source_id TEXT NOT NULL REFERENCES prospect_sources(source_id), entity_type TEXT NOT NULL CHECK(entity_type IN ('company','device','system','network','software')), entity_name TEXT NOT NULL, entity_domain TEXT, industry TEXT, country TEXT, vulnerability_id TEXT, severity TEXT CHECK(severity IN ('critical','high','medium','low','info')), cvss_score REAL, summary TEXT NOT NULL, raw_data_json TEXT, services_json TEXT, status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','analyzing','analyzed','outreach_drafted','contacted','converted','archived')), investigation_status TEXT DEFAULT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));"
  );
  await db.exec(
    "CREATE TABLE IF NOT EXISTS prospect_regressions (regression_id TEXT NOT NULL PRIMARY KEY, dimension TEXT NOT NULL CHECK(dimension IN ('entity','vuln_class')), key TEXT NOT NULL, occurrence_count INTEGER NOT NULL DEFAULT 1, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, lead_ids_json TEXT NOT NULL, severity_trend TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));"
  );
  await db.exec(
    "CREATE TABLE IF NOT EXISTS investigations (investigation_id TEXT NOT NULL PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES prospect_leads(lead_id), user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','re_investigating')), pipeline_order TEXT NOT NULL DEFAULT '[\"secure\",\"network\",\"causal\",\"risk\",\"graph\",\"supply\"]', aggregate_score REAL, risk_score_before REAL, risk_score_after REAL, claude_used INTEGER NOT NULL DEFAULT 0, claude_summary TEXT, budget_level TEXT, requirements_json TEXT, solutions_json TEXT, started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));"
  );
  await db.exec(
    "CREATE TABLE IF NOT EXISTS investigation_steps (step_id TEXT NOT NULL PRIMARY KEY, investigation_id TEXT NOT NULL REFERENCES investigations(investigation_id), service TEXT NOT NULL, step_order INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','skipped')), input_context_json TEXT, score REAL, findings_json TEXT, recommendation TEXT, duration_ms INTEGER, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));"
  );
  await db.exec(
    "CREATE TABLE IF NOT EXISTS investigation_requirements (requirement_id TEXT NOT NULL PRIMARY KEY, investigation_id TEXT NOT NULL REFERENCES investigations(investigation_id), category TEXT NOT NULL CHECK(category IN ('data_gap','capability_gap','monitor_needed','integration_needed')), description TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, resolution_action TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));"
  );
});

// ===========================================================================
// Investigation endpoints — auth gating (401 without credentials)
// ===========================================================================
describe("Investigation endpoints return 401 without auth", () => {
  it("POST /v1/prospect/leads/:id/investigate returns 401", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/leads/00000000-0000-0000-0000-000000000000/investigate",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("POST /v1/prospect/investigations/:id/solve returns 401", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations/00000000-0000-0000-0000-000000000000/solve",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("POST /v1/prospect/leads/:id/re-investigate returns 401", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/leads/00000000-0000-0000-0000-000000000000/re-investigate",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("GET /v1/prospect/investigations returns 401", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations",
    );
    expect(res.status).toBe(401);
  });

  it("GET /v1/prospect/investigations/:id returns 401", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(401);
  });

  it("GET /v1/prospect/investigations/:id/requirements returns 401", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations/00000000-0000-0000-0000-000000000000/requirements",
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Investigation endpoints — 404 for missing resources with auth
// ===========================================================================
describe("Investigation endpoints return 404 for missing resources", () => {
  let token: string;
  beforeAll(async () => { token = await mintJWT(); });

  it("POST /v1/prospect/leads/:id/investigate returns 404 for missing lead", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/leads/nonexistent-lead/investigate",
      { method: "POST", headers: authHeaders(token) },
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("POST /v1/prospect/leads/:id/re-investigate returns 404 for missing lead", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/leads/nonexistent-lead/re-investigate",
      { method: "POST", headers: authHeaders(token) },
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("POST /v1/prospect/investigations/:id/solve returns 404 for missing investigation", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations/nonexistent-inv/solve",
      { method: "POST", headers: authHeaders(token) },
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("GET /v1/prospect/investigations/:id returns 404 for missing investigation", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations/nonexistent-inv",
      { headers: authHeaders(token) },
    );
    expect(res.status).toBe(404);
  });

  it("GET /v1/prospect/investigations/:id/requirements returns 404 for missing investigation", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations/nonexistent-inv/requirements",
      { headers: authHeaders(token) },
    );
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Investigation list — returns empty when no investigations exist
// ===========================================================================
describe("GET /v1/prospect/investigations with auth", () => {
  let token: string;
  beforeAll(async () => { token = await mintJWT(); });

  it("returns items array (possibly empty)", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations",
      { headers: authHeaders(token) },
    );
    expect(res.status).toBe(200);

    const body = await res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("respects lead_id filter parameter", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations?lead_id=fake-lead",
      { headers: authHeaders(token) },
    );
    expect(res.status).toBe(200);

    const body = await res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(0); // no investigations for fake lead
  });

  it("respects status filter parameter", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations?status=completed",
      { headers: authHeaders(token) },
    );
    expect(res.status).toBe(200);

    const body = await res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });
});

// ===========================================================================
// CORS on investigation endpoints
// ===========================================================================
describe("CORS on investigation endpoints", () => {
  it("OPTIONS on /v1/prospect/investigations returns 204", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations",
      { method: "OPTIONS", headers: { Origin: "https://haiphen.io" } },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("attaches CORS headers on 401 for investigation endpoints", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/prospect/investigations",
      { headers: { Origin: "https://haiphen.io" } },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Vary")).toContain("Origin");
  });
});

// ===========================================================================
// Full investigation integration test (with a real lead in D1)
// ===========================================================================
describe("Investigation pipeline integration", () => {
  let token: string;
  let leadId: string;
  let investigationId: string;

  beforeAll(async () => {
    token = await mintJWT("testuser");
    leadId = crypto.randomUUID();
    investigationId = crypto.randomUUID();

    const db = (env as any).DB as D1Database;

    // Seed a prospect lead
    await db.prepare(
      `INSERT INTO prospect_leads (lead_id, entity_name, entity_type, vulnerability_id, severity, summary, cvss_score, source_id, status, investigation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      leadId, "TestFintech Inc", "company", "CVE-2025-9999", "high",
      "Critical trading execution order matching engine authentication bypass",
      9.1, "nvd", "new", "investigated",
    ).run();

    // Seed an investigation with steps and requirements (simulating completed pipeline)
    await db.prepare(
      `INSERT INTO investigations (investigation_id, lead_id, user_id, status, aggregate_score, risk_score_before, budget_level, claude_used)
       VALUES (?, ?, 'testuser', 'completed', 42.5, 42.5, 'normal', 0)`
    ).bind(investigationId, leadId).run();

    const services = ["secure", "network", "causal", "risk", "graph", "supply"];
    for (let i = 0; i < services.length; i++) {
      await db.prepare(
        `INSERT INTO investigation_steps (step_id, investigation_id, service, step_order, status, score, findings_json, recommendation, duration_ms)
         VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), investigationId, services[i], i,
        20 + i * 5,
        JSON.stringify([`Finding from ${services[i]}`]),
        `Recommendation from ${services[i]}`,
        100 + i * 10,
      ).run();
    }

    // Seed requirements
    await db.prepare(
      `INSERT INTO investigation_requirements (requirement_id, investigation_id, category, description, resolved)
       VALUES (?, ?, 'data_gap', 'Entity scored high on security scan — ensure crawler tracks this entity', 0)`
    ).bind(crypto.randomUUID(), investigationId).run();
    await db.prepare(
      `INSERT INTO investigation_requirements (requirement_id, investigation_id, category, description, resolved)
       VALUES (?, ?, 'monitor_needed', 'High risk score — add continuous monitoring', 0)`
    ).bind(crypto.randomUUID(), investigationId).run();
  });

  // Pipeline tests require live scaffold services (secure, network, causal, risk, graph, supply).
  // Skip in unit test — run with all services via `npm run dev` across workers.
  it.skip("POST /v1/prospect/leads/:id/investigate runs full pipeline (needs live services)", () => {});
  it.skip("POST /v1/prospect/leads/:id/re-investigate compares risk scores (needs live services)", () => {});

  it("GET /v1/prospect/investigations lists the investigation", async () => {
    const res = await callWorker(
      `https://api.haiphen.io/v1/prospect/investigations?lead_id=${leadId}`,
      { headers: authHeaders(token) },
    );
    expect(res.status).toBe(200);

    const body = await res.json() as { items: Array<{ investigation_id: string; lead_id: string; status: string }> };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0].lead_id).toBe(leadId);
    expect(body.items[0].status).toBe("completed");
  });

  it("GET /v1/prospect/investigations/:id returns full detail with steps", async () => {
    const res = await callWorker(
      `https://api.haiphen.io/v1/prospect/investigations/${investigationId}`,
      { headers: authHeaders(token) },
    );
    expect(res.status).toBe(200);

    const body = await res.json() as {
      investigation_id: string;
      aggregate_score: number;
      steps: Array<{ service: string; step_order: number; findings: string[] }>;
      requirements: Array<{ requirement_id: string; category: string }>;
    };

    expect(body.investigation_id).toBe(investigationId);
    expect(body.aggregate_score).toBe(42.5);
    expect(body.steps).toHaveLength(6);
    expect(body.steps[0].service).toBe("secure");
    expect(body.steps[5].service).toBe("supply");

    // Steps should have parsed findings (not raw JSON)
    for (const step of body.steps) {
      expect(Array.isArray(step.findings)).toBe(true);
      expect(step.findings.length).toBeGreaterThan(0);
    }

    expect(body.requirements).toHaveLength(2);
  });

  it("GET /v1/prospect/investigations/:id/requirements returns requirements", async () => {
    const res = await callWorker(
      `https://api.haiphen.io/v1/prospect/investigations/${investigationId}/requirements`,
      { headers: authHeaders(token) },
    );
    expect(res.status).toBe(200);

    const body = await res.json() as { items: Array<{ requirement_id: string; category: string; description: string }> };
    expect(body.items).toHaveLength(2);
    expect(body.items.map(r => r.category).sort()).toEqual(["data_gap", "monitor_needed"]);
  });

  it("POST /v1/prospect/investigations/:id/solve resolves requirements", async () => {
    const res = await callWorker(
      `https://api.haiphen.io/v1/prospect/investigations/${investigationId}/solve`,
      { method: "POST", headers: authHeaders(token) },
    );
    expect(res.status).toBe(200);

    const body = await res.json() as {
      ok: boolean;
      resolved_count: number;
      unresolved_count: number;
      actions_taken: string[];
    };
    expect(body.ok).toBe(true);
    expect(typeof body.resolved_count).toBe("number");
    expect(typeof body.unresolved_count).toBe("number");
    expect(Array.isArray(body.actions_taken)).toBe(true);
    // At least the monitor_needed should be auto-resolved
    expect(body.resolved_count + body.unresolved_count).toBe(2);
  });
});
