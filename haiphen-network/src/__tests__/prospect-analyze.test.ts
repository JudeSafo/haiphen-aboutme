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

describe("POST /v1/network/prospect-analyze", () => {
  const BASE = "http://localhost/v1/network/prospect-analyze";

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
        entity_name: "Acme",
        summary: "FIX protocol exposure in trading gateway",
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { score: number; findings: string[]; recommendation: string };
    expect(body.score).toBeGreaterThanOrEqual(45); // baseline 20 + 25 for FIX protocol
    expect(body.findings.length).toBeGreaterThan(0);
    expect(typeof body.recommendation).toBe("string");
  });

  it("boosts score when upstream secure score > 50", async () => {
    const withoutContext = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-2",
        entity_name: "Acme",
        summary: "basic vulnerability",
      }),
    });
    const baseBody = await withoutContext.json() as { score: number };

    const withContext = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-3",
        entity_name: "Acme",
        summary: "basic vulnerability",
        upstream_context: {
          prior_scores: { secure: 65 },
          prior_findings: ["CVE correlation found"],
          investigation_id: "inv-test",
        },
      }),
    });
    const ctxBody = await withContext.json() as { score: number; findings: string[] };

    // Score with context should be higher due to +10 boost
    expect(ctxBody.score).toBe(baseBody.score + 10);
    expect(ctxBody.findings).toContain("Confirmed vulnerability in network path (upstream secure score > 50)");
  });

  it("does not boost when upstream secure score <= 50", async () => {
    const res = await callWorker(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": "dev-internal-token",
      },
      body: JSON.stringify({
        lead_id: "test-4",
        entity_name: "Acme",
        summary: "basic vulnerability",
        upstream_context: {
          prior_scores: { secure: 30 },
          prior_findings: [],
          investigation_id: "inv-test",
        },
      }),
    });
    const body = await res.json() as { score: number; findings: string[] };
    expect(body.findings).not.toContain("Confirmed vulnerability in network path (upstream secure score > 50)");
  });
});
