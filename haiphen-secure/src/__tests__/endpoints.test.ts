import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index";

describe("haiphen-secure endpoints", () => {
  describe("GET /v1/health", () => {
    it("should return health status", async () => {
      const req = new Request("http://localhost/v1/health");
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.service).toBe("haiphen-secure");
    });
  });

  describe("POST /v1/secure/scan", () => {
    it("should reject unauthenticated requests", async () => {
      const req = new Request("http://localhost/v1/secure/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "plc.local" }),
      });
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(res.status).toBe(401);
    });

    it("should reject non-JSON content type", async () => {
      const req = new Request("http://localhost/v1/secure/scan", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      // Either 401 (no auth) or 415 (wrong content type) — depends on order of checks
      expect([401, 415]).toContain(res.status);
    });
  });

  describe("GET /v1/secure/scans", () => {
    it("should reject unauthenticated requests", async () => {
      const req = new Request("http://localhost/v1/secure/scans");
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
      const req = new Request("http://localhost/v1/secure/scan", {
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
