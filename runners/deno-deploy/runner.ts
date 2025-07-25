// Deno Deploy runner (cron). Each run leases a few tasks, executes, posts results.
// No infinite loops—each cron tick processes and exits.

const ORCH_URL = Deno.env.get("ORCH_URL")!;
const SECRET = Deno.env.get("INGEST_HMAC_SECRET")!;
const RUNNER_ID = Deno.env.get("RUNNER_ID") || `deno-${crypto.randomUUID()}`;
const MAX_TASKS = 2;
const LEASE_MS = 60_000;

Deno.cron("haiphen-runner", "*/15 * * * *", async () => {
  try {
    const leased = await call("/tasks/lease", {
      runnerId: RUNNER_ID,
      max: MAX_TASKS,
      leaseMs: LEASE_MS
    });

    for (const t of leased.leased ?? []) {
      await handleTask(t);
    }
  } catch (e) {
    console.error("cron error", e);
  }
});

async function handleTask(task: any) {
  const leaseId = task.leaseId;
  const taskId = task.id;

  let done = false;
  const hb = setInterval(async () => {
    if (done) {
      clearInterval(hb);
      return;
    }
    try {
      await call("/tasks/heartbeat", { runnerId: RUNNER_ID, leaseId, extendMs: LEASE_MS });
    } catch (e) {
      console.error("heartbeat err", e);
    }
  }, 20_000);

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

async function execute(task: any) {
  // implement your task types here
  return { echo: task.payload ?? null };
}

async function call(path: string, body: any) {
  const ts = new Date().toISOString();
  const raw = JSON.stringify(body);
  const sig = await hmac(SECRET, `${ts}.${raw}`);
  const r = await fetch(`${ORCH_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-timestamp": ts,
      "x-signature": sig
    },
    body: raw
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}