import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index";

describe("haiphen-graph endpoints", () => {
  describe("GET /v1/health", () => {
    it("should return health status", async () => {
      const req = new Request("http://localhost/v1/health");
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.service).toBe("haiphen-graph");
    });
  });

  describe("GET /v1/graph/schema", () => {
    it("should return graph schema", async () => {
      const req = new Request("http://localhost/v1/graph/schema");
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.entity_types).toBeDefined();
      expect(body.relationship_types).toBeDefined();
      expect(Array.isArray(body.entity_types)).toBe(true);
      expect(Array.isArray(body.relationship_types)).toBe(true);
    });
  });

  describe("POST /v1/graph/entities", () => {
    it("should reject unauthenticated requests", async () => {
      const req = new Request("http://localhost/v1/graph/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entities: [{ entity_type: "device", label: "PLC-1" }] }),
      });
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(res.status).toBe(401);
    });
  });

  describe("POST /v1/graph/edges", () => {
    it("should reject unauthenticated requests", async () => {
      const req = new Request("http://localhost/v1/graph/edges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edges: [{ source_id: "a", target_id: "b", relationship: "connects_to" }] }),
      });
      const ctx = createExecutionContext();
      const res = await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(res.status).toBe(401);
    });
  });

  describe("POST /v1/graph/query", () => {
    it("should reject unauthenticated requests", async () => {
      const req = new Request("http://localhost/v1/graph/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root_id: "abc" }),
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
      const req = new Request("http://localhost/v1/graph/entities", {
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
