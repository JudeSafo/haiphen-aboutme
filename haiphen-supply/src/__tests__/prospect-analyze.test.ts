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

describe("POST /v1/supply/prospect-analyze", () => {
  const BASE = "http://localhost/v1/supply/prospect-analyze";

  it("rejects without internal token", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: "test-1", entity_name: "Acme", summary: "test" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns score/findings/recommendation for vendor keywords", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-1",
        entity_name: "TestVendor",
        summary: "Third-party SaaS vendor supply chain dependency vulnerability",
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { score: number; findings: string[]; recommendation: string };
    expect(body.score).toBeGreaterThanOrEqual(25); // baseline + vendor + supply chain keywords
    expect(body.findings.length).toBeGreaterThan(0);
  });

  it("boosts score when upstream graph score > 30", async () => {
    const withoutCtx = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-2",
        entity_name: "TestVendor",
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
        entity_name: "TestVendor",
        summary: "basic issue",
        upstream_context: {
          prior_scores: { graph: 45, risk: 60 },
          prior_findings: [],
          investigation_id: "inv-test",
        },
      }),
    });
    const ctxBody = await withCtx.json() as { score: number; findings: string[] };

    // +10 for graph > 30, +10 for risk > 50
    expect(ctxBody.score).toBe(baseBody.score + 20);
    expect(ctxBody.findings).toContain("Graph relationship data available — enriching vendor dependency depth scoring");
    expect(ctxBody.findings).toContain("High cumulative risk score — elevated counterparty exposure");
  });
});
