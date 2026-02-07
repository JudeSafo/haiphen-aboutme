import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index";

describe("haiphen-risk endpoints", () => {
  describe("GET /v1/health", () => {
    it("should return health status", async () => {
      const req = new Request("http://localhost/v1/health");
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.service).toBe("haiphen-risk");
    });
  });

  describe("POST /v1/risk/assess", () => {
    it("should reject unauthenticated requests", async () => {
      const req = new Request("http://localhost/v1/risk/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "portfolio", portfolio: [] }),
      });
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(res.status).toBe(401);
    });
  });

  describe("404 handling", () => {
    it("should return 404 for unknown routes", async () => {
      const req = new Request("http://localhost/v1/unknown");
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(res.status).toBe(404);
    });
  });

  describe("OPTIONS (CORS)", () => {
    it("should handle CORS preflight", async () => {
      const req = new Request("http://localhost/v1/risk/assess", {
        method: "OPTIONS",
        headers: { Origin: "https://haiphen.io" },
      });
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://haiphen.io");
    });
  });
});
