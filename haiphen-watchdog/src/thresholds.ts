// ---------------------------------------------------------------------------
// Cloudflare $5/mo Workers Paid plan limits & failover decision logic
// ---------------------------------------------------------------------------

/** Monthly limits for the CF Workers Paid plan ($5/mo). */
export const CF_LIMITS = {
  workerRequests: 10_000_000,
  d1RowsRead:    25_000_000_000,
  d1RowsWritten: 50_000_000,
  kvReads:       10_000_000,
  kvWrites:      1_000_000,
  doRequests:    1_000_000,
} as const;

export type ResourceKey = keyof typeof CF_LIMITS;

export interface ResourceUsage {
  current: number;
  limit:   number;
  pct:     number; // 0–100
}

export type UsageMap = Record<ResourceKey, ResourceUsage>;

/** Alert levels in ascending severity. */
export type AlertLevel = "normal" | "warning" | "failover" | "critical";

export interface Evaluation {
  level:            AlertLevel;
  /** Resources that crossed a threshold (empty when normal). */
  triggers:         { resource: ResourceKey; pct: number }[];
  /** Next worker(s) to fail over, if level >= failover. */
  failoverTargets:  string[];
}

/**
 * Worker failover priority — highest-traffic / most-quota-intensive first.
 * The watchdog fails over workers in this order when thresholds are breached.
 * Workers already failed over are skipped.
 */
export const FAILOVER_PRIORITY: string[] = [
  "haiphen-api",
  "haiphen-secure",
  "haiphen-network",
  "haiphen-graph",
  "haiphen-risk",
  "haiphen-causal",
  "haiphen-supply",
  "haiphen-auth",
  "haiphen-contact",
  "edge-crawler",        // wrangler name for haiphen-crawler
  "haiphen-checkout",
  "haiphen-orchestrator",
];

/**
 * Map each wrangler worker name → its route pattern and subdomain so the
 * failover module knows which route to delete / which DNS record to create.
 */
export const WORKER_ROUTES: Record<string, { pattern: string; subdomain: string }> = {
  "haiphen-api":          { pattern: "api.haiphen.io/*",          subdomain: "api" },
  "haiphen-auth":         { pattern: "auth.haiphen.io/*",         subdomain: "auth" },
  "haiphen-checkout":     { pattern: "checkout.haiphen.io/*",     subdomain: "checkout" },
  "haiphen-contact":      { pattern: "haiphen-contact",           subdomain: "contact" },   // workers.dev only
  "edge-crawler":         { pattern: "crawler.haiphen.io/*",      subdomain: "crawler" },
  "haiphen-orchestrator": { pattern: "orchestrator.haiphen.io/*", subdomain: "orchestrator" },
  "haiphen-secure":       { pattern: "secure.haiphen.io/*",       subdomain: "secure" },
  "haiphen-network":      { pattern: "network.haiphen.io/*",      subdomain: "network" },
  "haiphen-graph":        { pattern: "graph.haiphen.io/*",        subdomain: "graph" },
  "haiphen-risk":         { pattern: "risk.haiphen.io/*",         subdomain: "risk" },
  "haiphen-causal":       { pattern: "causal.haiphen.io/*",       subdomain: "causal" },
  "haiphen-supply":       { pattern: "supply.haiphen.io/*",       subdomain: "supply" },
};

// ---------------------------------------------------------------------------
// Decision logic
// ---------------------------------------------------------------------------

export function buildUsageMap(snapshot: Record<ResourceKey, number>): UsageMap {
  const map = {} as UsageMap;
  for (const key of Object.keys(CF_LIMITS) as ResourceKey[]) {
    const current = snapshot[key] ?? 0;
    const limit   = CF_LIMITS[key];
    map[key] = { current, limit, pct: limit > 0 ? (current / limit) * 100 : 0 };
  }
  return map;
}

/**
 * Evaluate current usage against thresholds and return the alert level plus
 * which workers should be failed over next.
 *
 * @param usage         Current usage percentages per resource.
 * @param alreadyFailed Workers already in failover state (skipped).
 * @param warnPct       Warning threshold (default 60%).
 * @param failPct       Failover threshold (default 80%).
 */
export function evaluateUsage(
  usage: UsageMap,
  alreadyFailed: string[],
  warnPct  = 60,
  failPct  = 80,
): Evaluation {
  const triggers: Evaluation["triggers"] = [];
  let maxPct = 0;

  for (const [resource, data] of Object.entries(usage) as [ResourceKey, ResourceUsage][]) {
    if (data.pct >= warnPct) {
      triggers.push({ resource, pct: data.pct });
    }
    if (data.pct > maxPct) maxPct = data.pct;
  }

  // Determine level from the worst resource
  let level: AlertLevel = "normal";
  if (maxPct >= 90)      level = "critical";
  else if (maxPct >= failPct) level = "failover";
  else if (maxPct >= warnPct) level = "warning";

  // Decide which workers to fail over
  const failedSet = new Set(alreadyFailed);
  const remaining = FAILOVER_PRIORITY.filter(w => !failedSet.has(w));
  let failoverTargets: string[] = [];

  if (level === "critical") {
    // Fail over ALL remaining workers
    failoverTargets = remaining;
  } else if (level === "failover") {
    // Fail over next single worker in priority
    if (remaining.length > 0) failoverTargets = [remaining[0]];
  }
  // warning & normal → no automatic failover

  return { level, triggers, failoverTargets };
}
