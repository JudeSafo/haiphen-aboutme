import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../worker";

// Helper: invoke the worker's fetch handler and wait for all async work.
async function call(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

// Convenience for building requests.
const BASE = "https://contact.haiphen.io";

function req(
  path: string,
  init?: RequestInit & { origin?: string; ip?: string },
) {
  const headers = new Headers(init?.headers);
  if (init?.origin) {
    headers.set("Origin", init.origin);
  }
  if (init?.ip) {
    headers.set("CF-Connecting-IP", init.ip);
  }
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  return new Request(`${BASE}${path}`, {
    ...init,
    headers,
  });
}

// ---------------------------------------------------------------------------
// OPTIONS preflight
// ---------------------------------------------------------------------------
describe("OPTIONS preflight", () => {
  it("returns 204 with CORS headers for allowed origin", async () => {
    const res = await call(
      req("/api/contact", {
        method: "OPTIONS",
        origin: "https://haiphen.io",
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://haiphen.io",
    );
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("returns 204 for any path (OPTIONS is handled globally)", async () => {
    const res = await call(
      req("/some/random/path", {
        method: "OPTIONS",
        origin: "https://haiphen.io",
      }),
    );
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// CORS origin validation
// ---------------------------------------------------------------------------
describe("CORS origin validation", () => {
  it("reflects allowed origin in Access-Control-Allow-Origin", async () => {
    const res = await call(
      req("/__id", { method: "GET", origin: "https://haiphen.io" }),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://haiphen.io",
    );
  });

  it("does not reflect disallowed origin", async () => {
    const res = await call(
      req("/__id", { method: "GET", origin: "https://evil.example.com" }),
    );
    const acao = res.headers.get("Access-Control-Allow-Origin");
    // Should fall back to the first allowed origin, not the attacker's origin.
    expect(acao).not.toBe("https://evil.example.com");
  });
});

// ---------------------------------------------------------------------------
// Unknown routes return 404
// ---------------------------------------------------------------------------
describe("Unknown routes", () => {
  it("GET to an unknown path returns 404", async () => {
    const res = await call(req("/does-not-exist", { method: "GET" }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Not found");
  });

  it("POST to an unknown path returns 404", async () => {
    const res = await call(req("/v1/nope", { method: "POST" }));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /__id and /api/health (sanity)
// ---------------------------------------------------------------------------
describe("Health and build endpoints", () => {
  it("GET /__id returns 200 with build info", async () => {
    const res = await call(req("/__id", { method: "GET" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; build: string };
    expect(body.ok).toBe(true);
    expect(body.build).toBeDefined();
  });

  it("GET /api/health returns 200 with ok:true", async () => {
    const res = await call(req("/api/health", { method: "GET" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/contact — validation
// ---------------------------------------------------------------------------
describe("POST /api/contact validation", () => {
  it("returns 400 when body is not valid JSON", async () => {
    const res = await call(
      req("/api/contact", {
        method: "POST",
        body: "not json",
        ip: "10.0.0.1",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 400 when JSON is empty (no message field)", async () => {
    const res = await call(
      req("/api/contact", {
        method: "POST",
        body: JSON.stringify({}),
        ip: "10.0.0.2",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Message is required");
  });

  it("returns 400 when message is blank string", async () => {
    const res = await call(
      req("/api/contact", {
        method: "POST",
        body: JSON.stringify({ message: "   " }),
        ip: "10.0.0.3",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Message is required");
  });
});

// ---------------------------------------------------------------------------
// HMAC-protected endpoints return 401 without signature
// ---------------------------------------------------------------------------
describe("HMAC-protected endpoints reject unsigned requests", () => {
  it("POST /api/purchase/confirm without HMAC returns 401", async () => {
    const res = await call(
      req("/api/purchase/confirm", {
        method: "POST",
        body: JSON.stringify({ user_login: "testuser" }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("POST /api/trial/expiring without HMAC returns 401", async () => {
    const res = await call(
      req("/api/trial/expiring", {
        method: "POST",
        body: JSON.stringify({ user_login: "testuser" }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("POST /api/usage/alert without HMAC returns 401", async () => {
    const res = await call(
      req("/api/usage/alert", {
        method: "POST",
        body: JSON.stringify({ user_login: "testuser" }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("POST /api/welcome without HMAC returns 401", async () => {
    const res = await call(
      req("/api/welcome", {
        method: "POST",
        body: JSON.stringify({ user_login: "testuser" }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("POST /api/onboarding/confirm without HMAC returns 401", async () => {
    const res = await call(
      req("/api/onboarding/confirm", {
        method: "POST",
        body: JSON.stringify({ user_login: "testuser" }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("POST /api/digest/send without HMAC returns 401", async () => {
    const res = await call(
      req("/api/digest/send", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });
});

// ---------------------------------------------------------------------------
// HMAC-protected endpoints reject requests with invalid signature
// ---------------------------------------------------------------------------
describe("HMAC-protected endpoints reject bad signatures", () => {
  it("POST /api/purchase/confirm with wrong HMAC returns 401", async () => {
    const headers = new Headers({
      "Content-Type": "application/json",
      "x-haiphen-ts": String(Date.now()),
      "x-haiphen-sig": "deadbeef".repeat(8), // 64 hex chars (SHA-256 length)
    });
    const res = await call(
      new Request(`${BASE}/api/purchase/confirm`, {
        method: "POST",
        headers,
        body: JSON.stringify({ user_login: "testuser" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting on POST /api/contact
// ---------------------------------------------------------------------------
describe("Rate limiting", () => {
  it("returns 429 after 5 rapid requests from the same IP", async () => {
    // Use a unique IP so we don't collide with other tests' rate-limiter state.
    const ip = "192.168.99.99";
    const statuses: number[] = [];

    for (let i = 0; i < 6; i++) {
      const res = await call(
        req("/api/contact", {
          method: "POST",
          // Send empty JSON — it'll hit 400 (no message) for the first 5,
          // but the 6th should be caught by the rate limiter before validation.
          body: JSON.stringify({}),
          ip,
        }),
      );
      statuses.push(res.status);
    }

    // First 5 should NOT be 429 (they proceed to validation and return 400).
    for (let i = 0; i < 5; i++) {
      expect(statuses[i]).not.toBe(429);
    }

    // The 6th request should be rate-limited.
    expect(statuses[5]).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// POST /api/sg/events (SendGrid event webhook)
// ---------------------------------------------------------------------------
describe("POST /api/sg/events", () => {
  it("returns 200 for any POST body", async () => {
    const res = await call(
      req("/api/sg/events", {
        method: "POST",
        body: JSON.stringify([{ event: "delivered", email: "test@test.com" }]),
      }),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Build header present on responses
// ---------------------------------------------------------------------------
describe("Response headers", () => {
  it("includes x-haiphen-build header", async () => {
    const res = await call(req("/__id", { method: "GET" }));
    expect(res.headers.get("x-haiphen-build")).toBeTruthy();
  });

  it("includes cache-control: no-store", async () => {
    const res = await call(req("/__id", { method: "GET" }));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("includes Vary: Origin", async () => {
    const res = await call(
      req("/__id", { method: "GET", origin: "https://haiphen.io" }),
    );
    expect(res.headers.get("Vary")).toBe("Origin");
  });
});

// ---------------------------------------------------------------------------
// Subscription preferences require auth cookie
// ---------------------------------------------------------------------------
describe("GET /preferences/subscriptions", () => {
  it("returns 403 without Origin header (CSRF protection)", async () => {
    const res = await call(
      req("/preferences/subscriptions", { method: "GET" }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Forbidden origin");
  });

  it("returns 401 with valid origin but no auth cookie", async () => {
    const res = await call(
      req("/preferences/subscriptions", {
        method: "GET",
        origin: "https://haiphen.io",
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("auth");
  });
});
