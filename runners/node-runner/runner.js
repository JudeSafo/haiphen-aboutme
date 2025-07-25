import crypto from "node:crypto";
import fetch from "node-fetch";

const ORCH = process.env.ORCH_URL;
const SECRET = process.env.INGEST_HMAC_SECRET;
const RUNNER_ID = process.env.RUNNER_ID || `runner-${crypto.randomUUID()}`;
const MAX_TASKS = 2;
const LEASE_MS = 60_000;
const HEARTBEAT_EVERY = 20_000;

async function main() {
  if (!ORCH || !SECRET) {
    console.error("Missing ORCH_URL or INGEST_HMAC_SECRET");
    process.exit(1);
  }

  console.log(`runner ${RUNNER_ID} starting against ${ORCH}`);
  let idleDelay = 5000;            // start at 5s
  const IDLE_MAX = 60000;          // cap at 60s

  while (true) {
    try {
      const leased = await call("/tasks/lease", {
        runnerId: RUNNER_ID,
        labels: LABELS,
        max: 1,
        leaseMs: LEASE_MS
      });

      const tasks = leased.leased || [];
      if (tasks.length === 0) {
        // use server hint if provided; else backoff exponentially
        idleDelay = Math.min(leased.backoffMs || idleDelay * 2, IDLE_MAX);
        await sleep(idleDelay);
        continue;
      }

      // got work: reset delay
      idleDelay = 5000;

      for (const task of tasks) {
        if (task.type !== "lan-scan") { /* skip */ continue; }
        await handleLanScan(task);
      }
    } catch (e) {
      console.error("lease err", e);
      idleDelay = Math.min(idleDelay * 2, IDLE_MAX);
      await sleep(idleDelay);
    }
  }

async function handleTask(task) {
  const leaseId = task.leaseId;
  const taskId = task.id;

  let done = false;
  const hb = setInterval(async () => {
    if (done) return clearInterval(hb);
    try {
      await call("/tasks/heartbeat", { runnerId: RUNNER_ID, leaseId, extendMs: LEASE_MS });
    } catch (e) {
      console.error("heartbeat err", e);
    }
  }, HEARTBEAT_EVERY);

  try {
    const result = await execute(task);
    await call("/tasks/result", {
      runnerId: RUNNER_ID,
      leaseId,
      taskId,
      status: "succeeded",
      result
    });
  } catch (err) {
    await call("/tasks/result", {
      runnerId: RUNNER_ID,
      leaseId,
      taskId,
      status: "failed",
      error: String(err?.message || err)
    });
  } finally {
    done = true;
    clearInterval(hb);
  }
}

async function execute(task) {
  // Swap in your mqtt-probe/web-crawl/etc logic here
  return { echo: task.payload || null };
}

async function call(path, body) {
  const ts = new Date().toISOString();
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");
  const r = await fetch(`${ORCH}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-timestamp": ts,
      "x-signature": sig
    },
    body: raw
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${text}`);
  return JSON.parse(text);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error("runner fatal", err);
  process.exit(1);
});
