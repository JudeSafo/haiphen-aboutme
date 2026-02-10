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

describe("POST /v1/graph/prospect-analyze", () => {
  const BASE = "http://localhost/v1/graph/prospect-analyze";

  it("rejects without internal token", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: "test-1", entity_name: "Acme", summary: "test" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns score/findings/recommendation", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-1",
        entity_name: "TestCorp",
        summary: "interconnected relationship graph dependency",
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { score: number; findings: string[]; recommendation: string };
    expect(typeof body.score).toBe("number");
    expect(body.score).toBeGreaterThanOrEqual(15); // at least baseline
  });

  it("widens traversal depth with 3+ upstream findings", async () => {
    const withoutCtx = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-2",
        entity_name: "TestCorp",
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
        entity_name: "TestCorp",
        summary: "basic issue",
        upstream_context: {
          prior_scores: { secure: 70 },
          prior_findings: ["f1", "f2", "f3"],
          investigation_id: "inv-test",
        },
      }),
    });
    const ctxBody = await withCtx.json() as { score: number; findings: string[] };

    // +10 for findings >= 3, +10 for max score >= 60
    expect(ctxBody.score).toBe(baseBody.score + 20);
    expect(ctxBody.findings).toContain("3 upstream findings — widening graph traversal depth");
    expect(ctxBody.findings.some(f => f.includes("High upstream score"))).toBe(true);
  });
});
