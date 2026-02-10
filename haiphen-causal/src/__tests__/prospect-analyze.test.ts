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

describe("POST /v1/causal/prospect-analyze", () => {
  const BASE = "http://localhost/v1/causal/prospect-analyze";

  it("rejects without internal token", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: "test-1", entity_name: "Acme", summary: "test" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns score/findings/recommendation for cascade keywords", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-1",
        entity_name: "Acme",
        summary: "Failed settlement cascade propagation to downstream systems",
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { score: number; findings: string[]; recommendation: string };
    expect(body.score).toBeGreaterThanOrEqual(30); // baseline 15 + cascade keywords
    expect(body.findings.length).toBeGreaterThan(0);
  });

  it("boosts score based on upstream findings count", async () => {
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
          prior_scores: { secure: 30, network: 25 },
          prior_findings: ["Finding 1", "Finding 2", "Finding 3"],
          investigation_id: "inv-test",
        },
      }),
    });
    const ctxBody = await withCtx.json() as { score: number; findings: string[] };

    // 3 findings * 3 = 9 boost (capped at 15)
    expect(ctxBody.score).toBe(baseBody.score + 9);
    expect(ctxBody.findings).toContain("Cascade seeded by 3 upstream finding(s)");
  });

  it("boosts score when upstream network score > 40", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-4",
        entity_name: "Acme",
        summary: "basic issue",
        upstream_context: {
          prior_scores: { network: 55 },
          prior_findings: [],
          investigation_id: "inv-test",
        },
      }),
    });
    const body = await res.json() as { score: number; findings: string[] };
    expect(body.findings).toContain("Network protocol exposure feeds cascade analysis — deeper propagation search");
  });
});
