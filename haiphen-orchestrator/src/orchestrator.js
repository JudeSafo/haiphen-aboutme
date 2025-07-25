// src/orchestrator.js

const HMAC_HEADER = "x-signature";
const TS_HEADER = "x-timestamp";
const DRIFT_MS = 5 * 60 * 1000; // 5 min

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/health") {
        return json({
          ok: true,
          now: new Date().toISOString(),
          hasSecret: !!env.INGEST_HMAC_SECRET,
          secretLen: env.INGEST_HMAC_SECRET ? env.INGEST_HMAC_SECRET.length : 0
        });
      }

      const id = env.WORK_QUEUE.idFromName("global");
      const stub = env.WORK_QUEUE.get(id);

      if (url.pathname === "/tasks/submit" && req.method === "POST") {
        const { valid } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);
        return stub.fetch(req);
      }

      if (url.pathname === "/tasks/lease" && req.method === "POST") {
        const { valid } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);
        return stub.fetch(req);
      }

      if (url.pathname === "/tasks/heartbeat" && req.method === "POST") {
        const { valid } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);
        return stub.fetch(req);
      }

      if (url.pathname === "/tasks/result" && req.method === "POST") {
        const { valid } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);
        return stub.fetch(req);
      }

      if (url.pathname === "/tasks/stats" && req.method === "GET") {
        return stub.fetch(req);
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      console.error("orchestrator error", e);
      return json({ error: String(e?.message || e) }, 500);
    }
  }
};

export class WorkQueueDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.queue = [];
    this.leases = new Map(); // leaseId -> { taskId, deadline, runnerId }
    this.loaded = false;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    await this.ensureLoaded();

    if (url.pathname === "/tasks/submit" && method === "POST") {
      const body = await req.json();
      const tasks = Array.isArray(body) ? body : [body];
      const now = Date.now();
      for (const t of tasks) {
        t.id = t.id || crypto.randomUUID();
        t.state = "pending";
        t.createdAt = now;
        t.retries = 0;
        this.queue.push(t);
      }
      await this.persist();
      return json({ ok: true, accepted: tasks.length });
    }

    if (url.pathname === "/tasks/lease" && method === "POST") {
      const { runnerId, max = 1, leaseMs = 60_000 } = await req.json();
      const leased = [];
      const now = Date.now();
      const deadline = now + leaseMs;

      for (let i = 0; i < this.queue.length && leased.length < max; i++) {
        const task = this.queue[i];
        if (task.state === "pending") {
          task.state = "leased";
          task.leaseId = crypto.randomUUID();
          task.leaseDeadline = deadline;
          task.runnerId = runnerId;
          this.leases.set(task.leaseId, { taskId: task.id, deadline, runnerId });
          leased.push(task);
        }
      }
      await this.persist();
      return json({ ok: true, leased });
    }

    if (url.pathname === "/tasks/heartbeat" && method === "POST") {
      const { runnerId, leaseId, extendMs = 60_000 } = await req.json();
      const lease = this.leases.get(leaseId);
      if (!lease || lease.runnerId !== runnerId) {
        return json({ ok: false, error: "invalid-lease" }, 409);
      }
      const deadline = Date.now() + extendMs;
      lease.deadline = deadline;
      await this.persist();
      return json({ ok: true, deadline });
    }

    if (url.pathname === "/tasks/result" && method === "POST") {
      const { runnerId, leaseId, taskId, status, result, error } = await req.json();
      const lease = this.leases.get(leaseId);
      if (!lease || lease.runnerId !== runnerId || lease.taskId !== taskId) {
        return json({ ok: false, error: "invalid-lease" }, 409);
      }
      const task = this.queue.find(t => t.id === taskId);
      if (!task) return json({ ok: false, error: "task-not-found" }, 404);

      if (status === "succeeded") {
        task.state = "succeeded";
        task.finishedAt = Date.now();
        task.result = result;
      } else {
        task.retries += 1;
        if (task.retries > (task.maxRetries ?? 3)) {
          task.state = "dead-letter";
          task.error = error || "exceeded retries";
          task.finishedAt = Date.now();
        } else {
          task.state = "pending";
          delete task.leaseId;
          delete task.leaseDeadline;
          delete task.runnerId;
        }
      }
      this.leases.delete(leaseId);
      await this.persist();
      return json({ ok: true });
    }

    if (url.pathname === "/tasks/stats" && method === "GET") {
      const stats = this.queue.reduce((acc, t) => {
        acc[t.state] = (acc[t.state] || 0) + 1;
        return acc;
      }, {});
      return json({
        ok: true,
        stats,
        total: this.queue.length,
        leases: this.leases.size
      });
    }

    return json({ error: "not found" }, 404);
  }

  async ensureLoaded() {
    if (this.loaded) {
      this.expireLeases();
      return;
    }
    const persisted = await this.state.storage.get("queue");
    this.queue = persisted || [];
    const leaseMap = await this.state.storage.get("leases");
    this.leases = new Map(leaseMap || []);
    this.loaded = true;
    this.expireLeases();
  }

  expireLeases() {
    const now = Date.now();
    for (const [leaseId, l] of this.leases.entries()) {
      if (l.deadline < now) {
        const task = this.queue.find(t => t.id === l.taskId);
        if (task && task.state === "leased") {
          task.state = "pending";
          delete task.leaseId;
          delete task.leaseDeadline;
          delete task.runnerId;
        }
        this.leases.delete(leaseId);
      }
    }
  }

  async persist() {
    await this.state.storage.put("queue", this.queue);
    await this.state.storage.put("leases", Array.from(this.leases.entries()));
  }
}

// --------------- helpers ----------------

async function verifyAndRead(req, secret) {
  const ts = req.headers.get(TS_HEADER);
  const sig = req.headers.get(HMAC_HEADER);
  if (!ts || !sig) return { valid: false };

  const now = Date.now();
  const tsMs = Date.parse(ts);
  if (isNaN(tsMs) || Math.abs(now - tsMs) > DRIFT_MS) return { valid: false };

  const raw = await req.clone().text();
  const expected = await hmacHex(secret, `${ts}.${raw}`);
  const valid = timingSafeEqualHex(sig, expected);
  if (!valid) return { valid: false };
  try {
    return { valid: true, body: JSON.parse(raw) };
  } catch {
    return { valid: false };
  }
}

async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bufToHex(sig);
}
function bufToHex(buf) {
  const bytes = new Uint8Array(buf);
  const hex = [];
  for (let i = 0; i < bytes.length; i++) hex.push(bytes[i].toString(16).padStart(2, "0"));
  return hex.join("");
}
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
