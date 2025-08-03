// src/orchestrator.js

const HMAC_HEADER = "x-signature";
const TS_HEADER = "x-timestamp";
const DRIFT_MS = 5 * 60 * 1000; // 5 min
const RUNNERS_KV_KEY = "runners:registry";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const method = req.method;

    try {
      // ---- Discovery: clients learn which control-plane URLs to try
      if (url.pathname === "/vpn/discover" && method === "GET") {
        const urls = (env.HEADSCALE_URLS || env.HEADSCALE_BASE_URL || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);
        return json({ ok: true, urls, ts: new Date().toISOString() });
      }

      if (url.pathname === "/health") {
        return json({
          ok: true,
          now: new Date().toISOString(),
          hasSecret: !!env.INGEST_HMAC_SECRET,
          secretLen: env.INGEST_HMAC_SECRET ? env.INGEST_HMAC_SECRET.length : 0
        });
      }

      // Route to DO
      const TS_API_BASE = env.TS_API_BASE;      
      const id = env.WORK_QUEUE.idFromName("global");
      const stub = env.WORK_QUEUE.get(id);

      if (url.pathname === "/subnet/join" && method === "POST") {
        // Require HMAC or public join code
        const { valid, body } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);

        const { subnetId } = body;
        if (!subnetId) return json({ error: "subnetId required" }, 400);
        const raw = await env.STATE_KV.get(`subnet:${subnetId}`);
        if (!raw) return json({ error: "subnet not found" }, 404);
        const record = JSON.parse(raw);
        return json({ ok: true, subnetId, authKey: record.authKey, expireAt: record.expireAt });
      }

      // -- Open-source control-plane: issue Headscale pre-auth key -------------
      if (url.pathname === "/vpn/preauth" && method === "POST") {
        const { valid, body } = await verifyAndRead(req, env.INGEST_HMAC_SECRET)
        if (!valid) return json({ error: "unauthorized" }, 401)

        const expiry = body?.expiry || "24h";
        const wanted = body?.user ?? body?.userId ?? body?.namespace ?? "mobile";
        const isNumeric = typeof wanted === "number" || /^\d+$/.test(String(wanted));

        // optional env mapping: "mobile:2,orchestrator:1"
        function resolveUserId(w, env) {
          if (typeof w === "number" || /^\d+$/.test(String(w))) return Number(w);
          const map = Object.fromEntries(
            (env.HEADSCALE_USER_MAP || "")
              .split(",")
              .map(s => s.trim())
              .filter(Boolean)
              .map(pair => {
                const [k, v] = pair.split(":").map(t => t.trim());
                return [k, Number(v)];
              })
          );
          return map[String(w)] ?? null;
        }
        const userId = resolveUserId(wanted, env);
        if (!userId) return json({ error: "unknown-user", wanted }, 400);

        for (const base of (env.HEADSCALE_URLS || "").split(",").filter(Boolean)) {
          // Build payload: if numeric -> {user:<id>}, else -> {namespace:"name"}
          const payload = {
            reusable: false,
            ephemeral: true,
            expiration: expiryToRFC3339(expiry),
            ...(isNumeric ? { user: Number(wanted) } : { namespace: String(wanted) }),
            user: userId,
          };

          const r = await fetch(`${base}/api/v1/preauthkey`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.HEADSCALE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            redirect: "manual",
          })
          if (r.ok) {
            const { preAuthKey } = await r.json()
            return json({ ok: true, authKey: preAuthKey.key, base })
          } else {
            let bodyTxt;
            try { bodyTxt = await r.text(); } catch (_) { bodyTxt = ""; }
            // Return immediately with the upstream error (helps a ton when debugging)
            return json({ error: "headscale-error", base, status: r.status, body: bodyTxt }, r.status);
          }
        }
        return json({ error: "headscale-unreachable" }, 503)
      }

      // ---- TASK ENDPOINTS (HMAC then forward to DO) ----
      if (url.pathname === "/tasks/submit" && method === "POST") {
        const { valid } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);
        return stub.fetch(req);
      }
      if (url.pathname === "/tasks/lease" && method === "POST") {
        const { valid, body } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);
        console.log("lease req from", body?.runnerId || "?", "labels=", body?.labels);
        const id = env.WORK_QUEUE.idFromName("global");
        const stub = env.WORK_QUEUE.get(id);
        return stub.fetch(req);
      }
      if (url.pathname === "/tasks/heartbeat" && method === "POST") {
        const { valid } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);
        return stub.fetch(req);
      }
      if (url.pathname === "/tasks/result" && method === "POST") {
        const { valid } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);
        return stub.fetch(req);
      }
      if (url.pathname === "/tasks/stats" && method === "GET") {
        // stats can be public; add HMAC if you want it private
        return stub.fetch(req);
      }
      // ---- TASK ENDPOINTS (HMAC then forward to DO) ----
      if (url.pathname === "/tasks/admin/clear" && method === "POST") {
        const { valid } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);
        // Forward to the DO's internal endpoint
        const forward = new Request("https://do/tasks/admin/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        return stub.fetch(forward);
      }      
      // ---------------------------------------------------

      // ---- /shodan/enqueue-mqtt (kept as you had it) ----
      if (url.pathname === "/shodan/enqueue-mqtt" && method === "POST") {
        const { valid, body } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);

        const limit = Number(url.searchParams.get("limit") || body?.limit || 50);
        const batchSize = Number(url.searchParams.get("batch") || body?.batch || 10);
        const query = body?.query || 'port:1883 mqtt "Topics:"';

        const ips = await fetchShodanIPs(env, query, limit);

        const tasks = [];
        for (let i = 0; i < ips.length; i += batchSize) {
          const slice = ips.slice(i, i + batchSize);
          tasks.push({
            type: "mqtt-probe",
            payload: { ips: slice, timeout: 7 },
            priority: 10,
            maxRetries: 2,
            shardKey: `mqtt:${new Date().toISOString().slice(0, 10)}`
          });
        }

        const submitReq = new Request("https://do/tasks/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tasks)
        });
        const r = await stub.fetch(submitReq);
        const j = await r.json();

        return json({ ok: true, enqueued: tasks.length, ips: ips.length, stats: j });
      }

      // ---- runner registry & LAN endpoints (unchanged) ----
      if (url.pathname === "/runners/register" && method === "POST") {
        const { valid, body } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);

        const { runnerId, labels = [], meta = {} } = body || {};
        if (!runnerId) return json({ error: "runnerId required" }, 400);

        const existingRaw = await env.STATE_KV.get(RUNNERS_KV_KEY);
        const registry = existingRaw ? JSON.parse(existingRaw) : {};
        registry[runnerId] = { labels, meta, updatedAt: Date.now() };
        await env.STATE_KV.put(RUNNERS_KV_KEY, JSON.stringify(registry));

        return json({ ok: true, runnerId, labels });
      }

      if (url.pathname === "/lan/enqueue-scan" && method === "POST") {
        const { valid, body } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);

        const { cidr, ports = [22,80,443,1883,2375], runnerId, labels = ["lan"], batch = 256 } = body || {};
        if (!cidr) return json({ error: "cidr required" }, 400);

        const task = {
          type: "lan-scan",
          payload: { cidr, ports, batch },
          priority: 10,
          maxRetries: 1,
          selector: { runnerId, labels }
        };

        const submitReq = new Request("https://do/tasks/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([task])
        });
        const r = await stub.fetch(submitReq);
        const stats = await r.json();
        return json({ ok: true, enqueued: 1, stats });
      }

      // Inside `async fetch(req, env)` before your existing routes:

      if (url.pathname === "/vpn/discover" && method === "GET") {
        const urls = (env.HEADSCALE_URLS || "").split(",").map((u) => u.trim()).filter(Boolean);
        return json({ ok: true, urls, ts: new Date().toISOString() });
      }

      // -- Open-source control-plane: Headscale preauth key (alias /subnet/create)
      if (url.pathname === "/subnet/create" && method === "POST") {
        const { valid, body } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);

        const urls = (env.HEADSCALE_URLS || env.HEADSCALE_BASE_URL || "")
          .split(",").map(s => s.trim()).filter(Boolean);
        if (!urls.length) return json({ error: "HEADSCALE_URLS or HEADSCALE_BASE_URL not configured" }, 500);

        const expiry = body?.expiry || "24h";
        const user = body?.user || "orchestrator";

        let lastErr = null;
        for (const base of urls) {
          try {
            const resp = await fetch(`${base}/api/v1/preauthkey`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.HEADSCALE_API_KEY}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                namespace: user,
                reusable: false,
                ephemeral: true,
                expiration: expiryToRFC3339(expiry),
              }),
              redirect: "manual",
            });
            if (!resp.ok) {
              lastErr = new Error(`Headscale ${base} -> ${resp.status} ${await resp.text()}`);
              continue;
            }
            const { preAuthKey } = await resp.json();
            const subnetId = crypto.randomUUID();
            const record = {
              authKey: preAuthKey.key,
              expireAt: preAuthKey.expiresAt,
              createdAt: Date.now(),
              base
            };
            await env.STATE_KV.put(`subnet:${subnetId}`, JSON.stringify(record), { expirationTtl: 24 * 3600 });
            return json({ ok: true, subnetId, authKey: record.authKey, expireAt: record.expireAt, base });
          } catch (e) {
            lastErr = e;
          }
        }
        throw lastErr || new Error("no-headscale-endpoint-reachable");
      }

      if (url.pathname === "/lan/submit-inventory" && method === "POST") {
        const { valid, body } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
        if (!valid) return json({ error: "unauthorized" }, 401);

        const { runnerId, leaseId, taskId, hosts = [] } = body || {};
        if (!runnerId || !leaseId || !taskId) return json({ error: "invalid payload" }, 400);

        const INVENTORY_KEY = `lan:inventory:${runnerId}:${Date.now()}`;
        await env.STATE_KV.put(INVENTORY_KEY, JSON.stringify({ hosts, ts: Date.now() }), {
          expirationTtl: 7 * 24 * 3600
        });

        const resultReq = new Request("https://do/tasks/result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runnerId, leaseId, taskId,
            status: "succeeded",
            result: { inventoryKey: INVENTORY_KEY, count: hosts.length }
          })
        });
        const r = await stub.fetch(resultReq);
        const j = await r.json();
        return json({ ok: true, stored: hosts.length, kvKey: INVENTORY_KEY, result: j });
      }

      if (url.pathname === "/lan/inventory" && method === "GET") {
        return json({ todo: "implement listing via DO/D1/R2" });
      }

      // list inventories for a runner
      if (url.pathname === "/lan/inventory/list" && method === "GET") {
        const runnerId = url.searchParams.get("runnerId");
        if (!runnerId) return json({ error: "runnerId required" }, 400);
        const prefix = `lan:inventory:${runnerId}:`;
        const { keys } = await env.STATE_KV.list({ prefix, limit: 50 });
        // sort newest last segment (timestamp) desc
        const sorted = keys.sort((a,b) => b.name.localeCompare(a.name));
        return json({ ok: true, keys: sorted.map(k => k.name) });
      }

      if (url.pathname === "/lan/inventory/get" && method === "GET") {
        const key = url.searchParams.get("key");
        if (!key) return json({ error: "key required" }, 400);
        const raw = await env.STATE_KV.get(key);
        return raw ? json(JSON.parse(raw)) : json({ error: "not found" }, 404);
      }

      if (url.pathname === "/lan/inventory/latest" && method === "GET") {
        const runnerId = url.searchParams.get("runnerId");
        if (!runnerId) return json({ error: "runnerId required" }, 400);
        const prefix = `lan:inventory:${runnerId}:`;
        const { keys } = await env.STATE_KV.list({ prefix, limit: 50 });
        if (!keys.length) return json({ ok: true, latest: null });
        const latest = keys.sort((a,b) => b.name.localeCompare(a.name))[0].name;
        const raw = await env.STATE_KV.get(latest);
        return json({ ok: true, key: latest, data: raw ? JSON.parse(raw) : null });
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
      const { runnerId, max = 1, leaseMs = 60_000, labels = [] } = await req.json();
      const leased = [];
      const now = Date.now();
      const deadline = now + leaseMs;

      // (optional) enforce selector & runner registry in the DO if you pass it in tasks

      for (let i = 0; i < this.queue.length && leased.length < max; i++) {
        const task = this.queue[i];
        if (task.state !== "pending") continue;

        // (optional) task.selector support
        if (task.selector) {
          const sel = task.selector;
          if (sel.runnerId && sel.runnerId !== runnerId) continue;
          if (sel.labels && sel.labels.length) {
            const hasAny = labels?.some(l => sel.labels.includes(l));
            if (!hasAny) continue;
          }
        }

        task.state = "leased";
        task.leaseId = crypto.randomUUID();
        task.leaseDeadline = deadline;
        task.runnerId = runnerId;
        this.leases.set(task.leaseId, { taskId: task.id, deadline, runnerId });
        leased.push(task);
      }

      await this.persist();

      // If nothing to lease, suggest a backoff (e.g., 30s). You can make this dynamic.
      const backoffMs = leased.length === 0 ? 30_000 : 5_000;
      return json({ ok: true, leased, backoffMs });
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

    if (url.pathname === "/tasks/admin/clear" && method === "POST") {
      this.queue = [];
      this.leases.clear();
      await this.persist();
      return json({ ok: true, cleared: true });
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

function parseDurationMs(s) {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit];
  return n * mult;
}
function expiryToRFC3339(expiry) {
  // If user passed an absolute time, accept it
  const asDate = new Date(expiry);
  if (!isNaN(asDate.valueOf())) return asDate.toISOString();

  // Otherwise treat as duration like "24h"
  const ms = parseDurationMs(expiry);
  const dt = new Date(Date.now() + (ms ?? 24 * 60 * 60 * 1000)); // default 24h
  return dt.toISOString();
}

async function fetchShodanIPs(env, query, limit) {
  const pageSize = 100; // Shodan's default page size
  const pages = Math.ceil(limit / pageSize);
  const out = [];

  for (let p = 1; p <= pages; p++) {
    if (out.length >= limit) break;
    const endpoint = `https://api.shodan.io/shodan/host/search?key=${encodeURIComponent(
      env.SHODAN_API_KEY
    )}&query=${encodeURIComponent(query)}&page=${p}`;

    const r = await fetch(endpoint);
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Shodan error: ${r.status} ${txt}`);
    }
    const j = await r.json();
    const ips = (j.matches || []).map((m) => m.ip_str);
    out.push(...ips);
  }
  return out.slice(0, limit);
}