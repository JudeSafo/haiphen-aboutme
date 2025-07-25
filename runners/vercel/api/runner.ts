import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const ORCH_URL = process.env.ORCH_URL!;
const SECRET = process.env.INGEST_HMAC_SECRET!;
const RUNNER_ID = process.env.RUNNER_ID || `vercel-${crypto.randomUUID()}`;
const MAX_TASKS = 2;
const LEASE_MS = 60_000;

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const leased = await call("/tasks/lease", {
      runnerId: RUNNER_ID,
      max: MAX_TASKS,
      leaseMs: LEASE_MS
    });

    for (const t of leased.leased ?? []) {
      await handleTask(t);
    }
    res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || String(e) });
  }
}

async function handleTask(task: any) {
  const leaseId = task.leaseId;
  const taskId = task.id;
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
  }
}

async function execute(task: any) {
  return { echo: task.payload ?? null };
}

async function call(path: string, body: any) {
  const ts = new Date().toISOString();
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");
  const r = await fetch(`${ORCH_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-timestamp": ts,
      "x-signature": sig
    },
    body: raw
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}