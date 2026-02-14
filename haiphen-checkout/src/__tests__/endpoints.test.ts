import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index";

// Cast env to the correct type used by the worker
const workerEnv = env as unknown as Parameters<typeof worker.fetch>[1];

// Helper to invoke the worker and wait for all waitUntil promises
async function callWorker(request: Request) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, workerEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

// ── Health ────────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 with ok and service name", async () => {
    const req = new Request("https://checkout.haiphen.io/health");
    const res = await callWorker(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.service).toBe("haiphen-checkout");
  });
});

// ── CORS preflight ───────────────────────────────────────────────────────────

describe("OPTIONS preflight", () => {
  it("returns 204 with CORS headers", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/checkout/session", {
      method: "OPTIONS",
      headers: { origin: "https://haiphen.io" },
    });
    const res = await callWorker(req);

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://haiphen.io"
    );
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

// ── Unknown route ────────────────────────────────────────────────────────────

describe("Unknown routes", () => {
  it("returns 404 for an unrecognized path", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/does-not-exist");
    const res = await callWorker(req);

    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Not found");
  });
});

// ── GET /v1/checkout/stream ──────────────────────────────────────────────────

describe("GET /v1/checkout/stream", () => {
  it("returns 400 when checkout_id is missing", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/checkout/stream");
    const res = await callWorker(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error).toContain("checkout_id");
  });
});

// ── POST /v1/checkout/session (auth gating) ──────────────────────────────────

describe("POST /v1/checkout/session", () => {
  it("returns 401 without auth", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/checkout/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ price_id: "price_test" }),
    });
    const res = await callWorker(req);

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });
});

// ── POST /v1/stripe/webhook (signature gating) ──────────────────────────────

describe("POST /v1/stripe/webhook", () => {
  it("rejects without stripe-signature header", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "evt_test", type: "checkout.session.completed" }),
    });
    const res = await callWorker(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error).toContain("stripe-signature");
  });

  it("rejects with invalid stripe-signature", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=9999999999,v1=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad",
      },
      body: JSON.stringify({ id: "evt_test2", type: "checkout.session.completed" }),
    });
    const res = await callWorker(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  it("rejects with expired timestamp", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Timestamp from 2020 — well outside 5-minute tolerance
        "stripe-signature": "t=1577836800,v1=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
      body: JSON.stringify({ id: "evt_test3", type: "checkout.session.completed" }),
    });
    const res = await callWorker(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Timestamp");
  });
});

// ── POST /v1/checkout/service (auth gating) ─────────────────────────────────

describe("POST /v1/checkout/service", () => {
  it("returns 401 without auth", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/checkout/service", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service_id: "haiphen_cli", price_lookup_key: "test" }),
    });
    const res = await callWorker(req);

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });
});

// ── GET /v1/account/status (auth gating) ─────────────────────────────────────

describe("GET /v1/account/status", () => {
  it("returns 401 without auth", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/account/status");
    const res = await callWorker(req);

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });
});

// ── POST /v1/billing/portal (auth gating) ────────────────────────────────────

describe("POST /v1/billing/portal", () => {
  it("returns 401 without auth", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/billing/portal", {
      method: "POST",
    });
    const res = await callWorker(req);

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });
});

// ── POST /v1/account/suspend (auth gating) ───────────────────────────────────

describe("POST /v1/account/suspend", () => {
  it("returns 401 without auth", async () => {
    const req = new Request("https://checkout.haiphen.io/v1/account/suspend", {
      method: "POST",
    });
    const res = await callWorker(req);

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });
});

// ── CORS origin validation ──────────────────────────────────────────────────

describe("CORS origin validation", () => {
  it("allows https://haiphen.io origin", async () => {
    const req = new Request("https://checkout.haiphen.io/health", {
      headers: { origin: "https://haiphen.io" },
    });
    const res = await callWorker(req);

    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://haiphen.io"
    );
  });

  it("allows https://app.haiphen.io origin", async () => {
    const req = new Request("https://checkout.haiphen.io/health", {
      headers: { origin: "https://app.haiphen.io" },
    });
    const res = await callWorker(req);

    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://app.haiphen.io"
    );
  });

  it("allows localhost origins for dev", async () => {
    const req = new Request("https://checkout.haiphen.io/health", {
      headers: { origin: "http://localhost:3000" },
    });
    const res = await callWorker(req);

    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000"
    );
  });

  it("falls back to https://haiphen.io for disallowed origins", async () => {
    const req = new Request("https://checkout.haiphen.io/health", {
      headers: { origin: "https://evil.example.com" },
    });
    const res = await callWorker(req);

    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://haiphen.io"
    );
  });
});
