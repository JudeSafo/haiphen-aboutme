import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index";

async function callWorker(input: string | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("POST /v1/risk/prospect-analyze", () => {
  const BASE = "http://localhost/v1/risk/prospect-analyze";

  it("rejects without internal token", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: "test-1", entity_name: "Acme", summary: "test" }),
    });
    expect(res.status).toBe(403);
  });

  it("boosts score for high CVSS", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-1",
        entity_name: "Acme",
        summary: "Critical vulnerability",
        cvss_score: 9.5,
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { score: number; findings: string[] };
    expect(body.score).toBeGreaterThanOrEqual(55); // baseline 20 + 35 for critical CVSS
    expect(body.findings.some(f => f.includes("Critical CVSS"))).toBe(true);
  });

  it("aggregates upstream average scores into business impact", async () => {
    const withoutCtx = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-2",
        entity_name: "Acme",
        summary: "basic issue",
      }),
    });
    const baseBody = await withoutCtx.json() as { score: number };

    const withCtx = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-3",
        entity_name: "Acme",
        summary: "basic issue",
        upstream_context: {
          prior_scores: { secure: 60, network: 40, causal: 50 },
          prior_findings: [],
          investigation_id: "inv-test",
        },
      }),
    });
    const ctxBody = await withCtx.json() as { score: number; findings: string[] };

    // Average upstream = 50, boost = min(50*0.15, 15) = 7 or 8
    expect(ctxBody.score).toBeGreaterThan(baseBody.score);
    expect(ctxBody.findings.some(f => f.includes("Upstream average score"))).toBe(true);
  });
});
