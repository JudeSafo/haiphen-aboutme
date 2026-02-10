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

describe("POST /v1/secure/prospect-analyze", () => {
  const BASE = "http://localhost/v1/secure/prospect-analyze";

  it("rejects without internal token", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: "test-1", entity_name: "Acme", summary: "test" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects with wrong internal token", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "wrong-token",
      },
      body: JSON.stringify({ lead_id: "test-1", entity_name: "Acme", summary: "test" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects missing lead_id", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({ entity_name: "Acme", summary: "test" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns score, findings, recommendation for basic lead", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-1",
        entity_name: "TestCorp",
        summary: "A basic vulnerability in network service",
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { score: number; findings: string[]; recommendation: string };
    expect(typeof body.score).toBe("number");
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(body.findings)).toBe(true);
    expect(typeof body.recommendation).toBe("string");
  });

  it("boosts score for trade-execution keywords", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-2",
        entity_name: "TradeCo",
        summary: "Critical trading execution order matching engine vulnerability",
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { score: number; findings: string[] };
    expect(body.score).toBeGreaterThanOrEqual(45); // baseline 30 + 15 for trading keywords
  });

  it("accepts upstream_context without breaking (backward-compatible)", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-3",
        entity_name: "TestCorp",
        summary: "A vulnerability",
        upstream_context: {
          prior_scores: {},
          prior_findings: [],
          investigation_id: "inv-test",
        },
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { score: number; findings: string[] };
    expect(typeof body.score).toBe("number");
  });
});
