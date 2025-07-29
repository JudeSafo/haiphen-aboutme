#!/usr/bin/env node
/**
 * Minimal LAN runner:
 *  - registers with orchestrator
 *  - leases lan-scan tasks (selector.labels=["lan"])
 *  - scans LAN (CIDR) -> pings + port-scan (22,80,443,1883,2375,...)
 *  - submits inventory and completes the task
 *
 * NOTE: This is an MVP scanner (no raw pcap). For faster/better scanning, you can shell out to `nmap`.
 */

// runners/lan-runner/runner.js
import crypto from "node:crypto";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import net from "node:net";
import fetch from "node-fetch";
const execP = promisify(exec);

const ORCH = process.env.ORCH_URL;               // e.g. https://orchestrator.haiphen.io
const SECRET = process.env.INGEST_HMAC_SECRET;
const RUNNER_ID = process.env.RUNNER_ID || `lan-${os.hostname()}-${crypto.randomUUID()}`;
const LABELS = (process.env.RUNNER_LABELS || "lan,local").split(",");
const LEASE_MS = 120_000;

if (!ORCH || !SECRET) {
  console.error("Missing ORCH_URL or INGEST_HMAC_SECRET");
  process.exit(1);
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function sign(ts, raw) {
  return crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");
}
async function call(path, body) {
  const ts = new Date().toISOString();
  const raw = JSON.stringify(body);
  const sig = await sign(ts, raw);
  const r = await fetch(`${ORCH}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-timestamp": ts, "x-signature": sig },
    body: raw
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function register() {
  return call("/runners/register", {
    runnerId: RUNNER_ID,
    labels: LABELS,
    meta: { host: os.hostname(), platform: os.platform(), arch: os.arch() }
  });
}

async function leaseOnce() {
  return call("/tasks/lease", { runnerId: RUNNER_ID, labels: LABELS, max: 1, leaseMs: LEASE_MS });
}

function expandCidr24(cidr) {
  // MVP: handle /24 only
  const [base, mask] = cidr.split("/");
  if (mask !== "24") throw new Error(`MVP supports /24 only: ${cidr}`);
  const [a,b,c] = base.split(".").map(Number);
  const out = [];
  for (let d=1; d<255; d++) out.push(`${a}.${b}.${c}.${d}`);
  return out;
}

async function ping(ip) {
  const cmd = process.platform === "darwin"
    ? `ping -c 1 -W 200 ${ip}`
    : `ping -c 1 -w 1 ${ip}`;
  try {
    await execP(cmd, { timeout: 1200, windowsHide: true });
    return true;
  } catch { return false; }
}

function checkPort(ip, port, timeout=600) {
  return new Promise(res => {
    const s = new net.Socket();
    let done = false;
    s.setTimeout(timeout);
    s.once("connect", () => { done = true; s.destroy(); res(true); });
    s.once("timeout", () => { if (!done) res(false); s.destroy(); });
    s.once("error", () => { if (!done) res(false); });
    s.connect(port, ip);
  });
}

async function scanHost(ip, ports) {
  const open = [];
  for (const p of ports) if (await checkPort(ip,p)) open.push(p);
  return { ip, ports: open };
}

async function doLanScan({ cidr, ports=[22,80,443,1883,2375] }) {
  const ips = expandCidr24(cidr);
  // ping sweep with modest concurrency
  const alive = [];
  const conc = 64;
  for (let i=0; i<ips.length; i+=conc) {
    const slice = ips.slice(i, i+conc);
    const flags = await Promise.all(slice.map(ping));
    for (let j=0;j<slice.length;j++) if (flags[j]) alive.push(slice[j]);
  }
  const hosts = [];
  for (const ip of alive) hosts.push(await scanHost(ip, ports));
  // naive score for “deployability”
  for (const h of hosts) {
    let s = 0;
    if (h.ports.includes(22)) s += 2;
    if (h.ports.includes(2375)) s += 3;
    if (h.ports.includes(80) || h.ports.includes(443)) s += 1;
    h.score = s;
  }
  return hosts;
}

async function submitInventory({ leaseId, taskId, hosts }) {
  return call("/lan/submit-inventory", {
    runnerId: RUNNER_ID, leaseId, taskId, hosts
  });
}

async function handleTask(t) {
  if (t.type !== "lan-scan") {
    // mark unknown tasks succeeded so queue doesn’t clog
    await call("/tasks/result", {
      runnerId: RUNNER_ID, leaseId: t.leaseId, taskId: t.id,
      status: "succeeded", result: { ignored: true }
    });
    return;
  }
  console.log(`Scanning ${t.payload?.cidr} …`);
  const hosts = await doLanScan(t.payload || {});
  const r = await submitInventory({ leaseId: t.leaseId, taskId: t.id, hosts });
  console.log(`Submitted ${hosts.length} hosts`, r);
}

async function main() {
  console.log(`LAN runner ${RUNNER_ID} starting`);
  await register();

  let idle = 5000;  // 5s
  const IDLE_MAX = 60000;

  while (true) {
    try {
      const { leased = [], backoffMs } = await leaseOnce();
      if (!leased.length) {
        idle = Math.min(backoffMs || idle * 2, IDLE_MAX);
        await sleep(idle);
        continue;
      }
      idle = 5000;
      for (const t of leased) await handleTask(t);
    } catch (e) {
      console.error("loop error:", e.message || e);
      idle = Math.min(idle * 2, IDLE_MAX);
      await sleep(idle);
    }
  }
}

main().catch(e => { console.error("fatal", e); process.exit(1); });