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

import crypto from "node:crypto";
import os from "node:os";
import child_process from "node:child_process";
import fetch from "node-fetch";

const ORCH = process.env.ORCH_URL;               // https://orchestrator.haiphen.io
const SECRET = process.env.INGEST_HMAC_SECRET;
const RUNNER_ID = process.env.RUNNER_ID || `lan-${os.hostname()}-${crypto.randomUUID()}`;
const LABELS = (process.env.RUNNER_LABELS || "lan").split(",");
const LEASE_MS = 120_000;

if (!ORCH || !SECRET) {
  console.error("Missing ORCH_URL or INGEST_HMAC_SECRET");
  process.exit(1);
}

async function main() {
  console.log(`LAN runner ${RUNNER_ID} starting`);
  await register();

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

async function handleLanScan(task) {
  const { cidr, ports = [22,80,443,1883,2375], batch = 256 } = task.payload || {};
  console.log(`Scanning ${cidr} ports=${ports.join(",")}`);

  // naive scanner stub (replace with nmap if installed)
  const hosts = await simpleScan(cidr, ports);

  // Compute a naive "deployability score"
  for (const h of hosts) {
    h.score = scoreHost(h);
  }

  // Send inventory + complete task
  await submitInventory({
    runnerId: RUNNER_ID,
    leaseId: task.leaseId,
    taskId: task.id,
    hosts
  });
}

function scoreHost(h) {
  let s = 0;
  if (h.ports?.includes(22)) s += 2; // ssh
  if (h.ports?.includes(2375)) s += 3; // docker tcp
  if (h.ports?.includes(80) || h.ports?.includes(443)) s += 1;
  // negative weight if only IoT mgmt ports (vendor libs omitted here)
  return s;
}

// This is intentionally minimal. For real networks:
// - use `nmap -sn` to discover live hosts and `nmap -p ...` to port scan.
// - or speed up with raw sockets/libpcap
async function simpleScan(cidr, ports) {
  const liveHosts = await pingSweep(cidr);
  const scanned = [];
  for (const ip of liveHosts) {
    const open = await portScan(ip, ports);
    scanned.push({ ip, ports: open });
  }
  return scanned;
}

async function pingSweep(cidr) {
  // Very naive: iterate /24 and ping
  const ips = expandCidr(cidr);
  const out = [];
  await Promise.all(ips.map(async ip => {
    const ok = await ping(ip);
    if (ok) out.push(ip);
  }));
  return out;
}

function expandCidr(cidr) {
  const [base, mask] = cidr.split("/");
  const baseParts = base.split(".").map(Number);
  const bits = Number(mask);
  if (bits !== 24) {
    // support only /24 for MVP
    console.warn("MVP expandCidr supports only /24; got", cidr);
  }
  const prefix = baseParts.slice(0, 3).join(".");
  const out = [];
  for (let i = 1; i < 255; i++) out.push(`${prefix}.${i}`);
  return out;
}

function ping(ip) {
  return new Promise(resolve => {
    const cmd = process.platform === "darwin" ? `ping -c 1 -W 50 ${ip}` : `ping -c 1 -w 1 ${ip}`;
    child_process.exec(cmd, { timeout: 1000 }, (err, stdout, stderr) => {
      resolve(!err);
    });
  });
}

function portScan(ip, ports) {
  return Promise.all(ports.map(p => isOpen(ip, p))).then(flags => {
    const open = [];
    for (let i = 0; i < ports.length; i++) {
      if (flags[i]) open.push(ports[i]);
    }
    return open;
  });
}

function isOpen(ip, port, timeout = 500) {
  return new Promise(resolve => {
    const socket = new (require("net").Socket)();
    let done = false;
    socket.setTimeout(timeout);
    socket.once("connect", () => { done = true; socket.destroy(); resolve(true); });
    socket.once("timeout", () => { if (!done) resolve(false); socket.destroy(); });
    socket.once("error", () => { if (!done) resolve(false); });
    socket.connect(port, ip);
  });
}

async function submitInventory(payload) {
  await call("/lan/submit-inventory", payload);
}

async function register() {
  await call("/runners/register", {
    runnerId: RUNNER_ID,
    labels: LABELS,
    meta: { host: os.hostname(), platform: os.platform() }
  });
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
  try { return JSON.parse(text); } catch { return text; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => {
  console.error("runner fatal", err);
  process.exit(1);
});
