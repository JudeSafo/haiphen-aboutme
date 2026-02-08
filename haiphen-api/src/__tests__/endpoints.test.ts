import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
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

// ===========================================================================
// Health endpoint
// ===========================================================================
describe("GET /v1/health", () => {
  it("returns 200 with ok: true", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(body.version).toBe("v1.0.0");
  });

  it("includes X-Request-Id header", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/health");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });
});

// ===========================================================================
// OPTIONS preflight
// ===========================================================================
describe("OPTIONS preflight", () => {
  it("returns 204 with CORS headers", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/health", {
      method: "OPTIONS",
      headers: { Origin: "https://haiphen.io" },
    });
    expect(res.status).toBe(204);

    // Core CORS headers must be present
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain(
      "OPTIONS",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Vary")).toContain("Origin");
  });

  it("works for non-v1 paths too", async () => {
    const res = await callWorker("https://api.haiphen.io/anything", {
      method: "OPTIONS",
      headers: { Origin: "https://haiphen.io" },
    });
    // OPTIONS is handled before the /v1/ check so it should still be 204
    expect(res.status).toBe(204);
  });
});

// ===========================================================================
// Unknown / not-found routes
// ===========================================================================
describe("Unknown routes", () => {
  it("returns 404 for root path", async () => {
    const res = await callWorker("https://api.haiphen.io/");
    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 for non-v1 path", async () => {
    const res = await callWorker("https://api.haiphen.io/foo/bar");
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown v1 path", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/nonexistent-route",
    );
    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });
});

// ===========================================================================
// Auth-gated endpoints (API-key auth) — should 401 without credentials
// ===========================================================================
describe("Auth-gated API-key endpoints return 401 without auth", () => {
  it("GET /v1/metrics/daily returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/metrics/daily");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("GET /v1/metrics/kpis returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/metrics/kpis");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("GET /v1/metrics/series returns 401", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/metrics/series?kpi=test",
    );
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("GET /v1/metrics/extremes returns 401", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/metrics/extremes?kpi=test",
    );
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("GET /v1/metrics/portfolio-assets returns 401", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/metrics/portfolio-assets",
    );
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("GET /v1/metrics/dates returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/metrics/dates");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("GET /v1/rss/daily returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/rss/daily");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("POST /v1/webhooks returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/hook", events: ["metrics.published"] }),
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });
});

// ===========================================================================
// Auth-gated endpoints (cookie auth) — should 401 without credentials
// ===========================================================================
describe("Auth-gated cookie endpoints return 401 without auth", () => {
  it("GET /v1/whoami returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/whoami");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("GET /v1/me returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/me");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("GET /v1/keys/list returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/keys/list");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("POST /v1/keys/issue returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/keys/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("POST /v1/keys/revoke returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/keys/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_id: "test" }),
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("GET /v1/onboarding/resources returns 401", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/onboarding/resources",
    );
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("GET /v1/quota/status returns 401", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/quota/status");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });
});

// ===========================================================================
// Admin endpoints — should 403 without admin token
// ===========================================================================
describe("Admin endpoints return 403 without admin token", () => {
  it("POST /v1/admin/metrics/upsert returns 403", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/admin/metrics/upsert",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("POST /v1/admin/plan returns 403", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/admin/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_login: "test", plan: "pro" }),
    });
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("GET /v1/traffic/summary returns 403", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/traffic/summary",
    );
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });
});

// ===========================================================================
// Internal endpoints — should 403 without internal token
// ===========================================================================
describe("Internal endpoints return 403 without internal token", () => {
  it("POST /v1/internal/quota/consume returns 403", async () => {
    const res = await callWorker(
      "https://api.haiphen.io/v1/internal/quota/consume",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "test", plan: "free" }),
      },
    );
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });
});

// ===========================================================================
// CORS origin validation
// ===========================================================================
describe("CORS origin handling", () => {
  it("reflects allowed origin in Access-Control-Allow-Origin", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/health", {
      headers: { Origin: "https://haiphen.io" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://haiphen.io",
    );
  });

  it("includes Vary: Origin on all responses", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/health", {
      headers: { Origin: "https://haiphen.io" },
    });
    expect(res.headers.get("Vary")).toContain("Origin");
  });

  it("includes credentials header", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/health", {
      headers: { Origin: "https://haiphen.io" },
    });
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("attaches CORS headers even on 404 responses", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/nope", {
      headers: { Origin: "https://haiphen.io" },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Vary")).toContain("Origin");
  });

  it("attaches CORS headers on 401 responses", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/metrics/daily", {
      headers: { Origin: "https://haiphen.io" },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Vary")).toContain("Origin");
  });
});

// ===========================================================================
// Response format consistency
// ===========================================================================
describe("Response format", () => {
  it("health returns Content-Type application/json", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/health");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("error responses include request_id", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/nonexistent");
    const body = (await res.json()) as {
      error: { code: string; message: string; request_id: string };
    };
    expect(body.error.request_id).toBeTruthy();
    expect(typeof body.error.request_id).toBe("string");
  });

  it("error responses include code and message fields", async () => {
    const res = await callWorker("https://api.haiphen.io/v1/nonexistent");
    const body = (await res.json()) as {
      error: { code: string; message: string; request_id: string };
    };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("Not found");
  });
});
