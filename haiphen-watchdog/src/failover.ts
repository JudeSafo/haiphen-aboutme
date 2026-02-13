// ---------------------------------------------------------------------------
// Failover execution: CF route deletion + DNS CNAME creation + rollback
// ---------------------------------------------------------------------------

import type { Env, WatchdogState } from "./index";
import { WORKER_ROUTES } from "./thresholds";

const CF_API = "https://api.cloudflare.com/client/v4";

// ---------------------------------------------------------------------------
// CF API helpers
// ---------------------------------------------------------------------------

async function cfApi(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<any> {
  const res = await fetch(`${CF_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json();
  if (!json.success) {
    const msg = json.errors?.map((e: any) => e.message).join("; ") ?? res.statusText;
    throw new Error(`CF API ${method} ${path}: ${msg}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Route management
// ---------------------------------------------------------------------------

interface RouteRecord {
  id: string;
  pattern: string;
  script: string;
}

/** List all worker routes for the zone. */
async function listRoutes(zoneId: string, token: string): Promise<RouteRecord[]> {
  const json = await cfApi("GET", `/zones/${zoneId}/workers/routes`, token);
  return json.result ?? [];
}

/** Find the route ID for a given worker name. */
async function findRouteId(
  zoneId: string,
  workerName: string,
  token: string,
): Promise<string | null> {
  const routes = await listRoutes(zoneId, token);
  const meta = WORKER_ROUTES[workerName];
  if (!meta) return null;
  const match = routes.find(
    (r) => r.pattern === meta.pattern || r.script === workerName,
  );
  return match?.id ?? null;
}

/** Delete a worker route by ID. */
async function deleteRoute(zoneId: string, routeId: string, token: string): Promise<void> {
  await cfApi("DELETE", `/zones/${zoneId}/workers/routes/${routeId}`, token);
}

/** Recreate a worker route. */
async function createRoute(
  zoneId: string,
  pattern: string,
  workerName: string,
  token: string,
): Promise<string> {
  const json = await cfApi("POST", `/zones/${zoneId}/workers/routes`, token, {
    pattern,
    script: workerName,
  });
  return json.result?.id ?? "";
}

// ---------------------------------------------------------------------------
// DNS management
// ---------------------------------------------------------------------------

/** Create a CNAME record pointing subdomain.haiphen.io → gcpTarget. */
async function createDnsCname(
  zoneId: string,
  subdomain: string,
  gcpTarget: string,
  token: string,
): Promise<string> {
  const json = await cfApi("POST", `/zones/${zoneId}/dns_records`, token, {
    type: "CNAME",
    name: `${subdomain}.haiphen.io`,
    content: gcpTarget,
    ttl: 60,
    proxied: false, // direct resolution so CF doesn't proxy (and consume worker invocations)
  });
  return json.result?.id ?? "";
}

/** Delete a DNS record by ID. */
async function deleteDnsRecord(
  zoneId: string,
  recordId: string,
  token: string,
): Promise<void> {
  await cfApi("DELETE", `/zones/${zoneId}/dns_records/${recordId}`, token);
}

// ---------------------------------------------------------------------------
// GCP target URL placeholder
// ---------------------------------------------------------------------------

/**
 * Derive the expected GCP Cloud Function / Cloud Run URL for a worker.
 * This follows the naming convention set up in haiphen-gcp/.
 * For now, returns a placeholder — real URLs are populated after GCP deploy.
 */
function gcpEndpoint(workerName: string): string {
  // Convention: haiphen-{service}-xyz.cloudfunctions.net or *.run.app
  // The actual URL will be stored in WATCHDOG_KV per worker after GCP deploy.
  return `${workerName}.us-central1.run.app`;
}

// ---------------------------------------------------------------------------
// Public: execute failover for a single worker
// ---------------------------------------------------------------------------

export interface FailoverRecord {
  worker:     string;
  routeId:    string;          // saved for rollback
  dnsRecordId: string;         // saved for rollback
  gcpTarget:  string;
  failedAt:   string;          // ISO timestamp
}

/**
 * Fail over a single worker from CF to GCP:
 * 1. Delete the CF worker route (stops CF from handling requests)
 * 2. Create a DNS CNAME pointing the subdomain to the GCP endpoint
 * 3. Return a FailoverRecord for state persistence
 */
export async function executeFailover(
  workerName: string,
  env: Env,
): Promise<FailoverRecord> {
  const token  = env.CF_API_TOKEN;
  const zoneId = env.CF_ZONE_ID;
  const meta   = WORKER_ROUTES[workerName];
  if (!meta) throw new Error(`Unknown worker: ${workerName}`);

  // Check for a pre-configured GCP URL in KV, fall back to convention
  const storedUrl = await env.WATCHDOG_KV.get(`gcp:${workerName}`);
  const gcpTarget = storedUrl || gcpEndpoint(workerName);

  // 1. Find and delete the CF route
  const routeId = await findRouteId(zoneId, workerName, token);
  if (routeId) {
    await deleteRoute(zoneId, routeId, token);
  }

  // 2. Create DNS CNAME → GCP
  const dnsRecordId = await createDnsCname(zoneId, meta.subdomain, gcpTarget, token);

  return {
    worker: workerName,
    routeId: routeId ?? "",
    dnsRecordId,
    gcpTarget,
    failedAt: new Date().toISOString(),
  };
}

/**
 * Revert a single worker back to CF:
 * 1. Delete the GCP DNS CNAME record
 * 2. Recreate the CF worker route
 */
export async function executeRevert(
  record: FailoverRecord,
  env: Env,
): Promise<void> {
  const token  = env.CF_API_TOKEN;
  const zoneId = env.CF_ZONE_ID;
  const meta   = WORKER_ROUTES[record.worker];
  if (!meta) throw new Error(`Unknown worker: ${record.worker}`);

  // 1. Delete the DNS CNAME
  if (record.dnsRecordId) {
    try {
      await deleteDnsRecord(zoneId, record.dnsRecordId, token);
    } catch {
      // DNS record may already be gone — safe to ignore
    }
  }

  // 2. Recreate the CF worker route
  await createRoute(zoneId, meta.pattern, record.worker, token);
}

/**
 * Revert ALL failed-over workers back to CF.
 */
export async function revertAll(
  state: WatchdogState,
  env: Env,
): Promise<string[]> {
  const reverted: string[] = [];
  for (const [worker, record] of Object.entries(state.routing)) {
    await executeRevert(record, env);
    reverted.push(worker);
  }
  return reverted;
}
