// ---------------------------------------------------------------------------
// haiphen-prospect-crawler — Cloud Run Job entry point
//
// Orchestrates crawling of public vulnerability/exposure APIs, deduplicates
// against existing prospect_leads in D1, and writes new leads.
// Runs as a Cloud Run Job (no HTTP server — just runs and exits).
// Triggered daily at 3am UTC by Cloud Scheduler.
// ---------------------------------------------------------------------------

import {
  readSources,
  readTarget,
  writeLead,
  updateSourceCursor,
  ProspectSource,
  ProspectLead,
  ProspectTarget,
} from "./d1-writer";
import { crawlNvd } from "./sources/nvd";
import { crawlNvdTargeted } from "./sources/nvd";
import { crawlOsv } from "./sources/osv";
import { crawlOsvTargeted } from "./sources/osv";
import { crawlGitHubAdvisory } from "./sources/github-advisory";
import { crawlGitHubAdvisoryTargeted } from "./sources/github-advisory";
import { crawlShodan } from "./sources/shodan";
import { crawlShodanTargeted } from "./sources/shodan";
import { crawlSecEdgar } from "./sources/sec-edgar";
import { crawlSecEdgarTargeted } from "./sources/sec-edgar";
import { crawlInfraScan } from "./sources/infra-scan";
import { crawlInfraScanTargeted } from "./sources/infra-scan";

// ---------------------------------------------------------------------------
// Source dispatcher
// ---------------------------------------------------------------------------

type CrawlFn = (source: ProspectSource) => Promise<ProspectLead[]>;

const CRAWLERS: Record<string, CrawlFn> = {
  nvd: crawlNvd,
  osv: crawlOsv,
  "github-advisory": crawlGitHubAdvisory,
  shodan: crawlShodan,
  "sec-edgar": crawlSecEdgar,
  "infra-scan": crawlInfraScan,
};

// ---------------------------------------------------------------------------
// Targeted crawl dispatcher
// ---------------------------------------------------------------------------

type TargetedCrawlFn = (target: ProspectTarget, source: ProspectSource) => Promise<ProspectLead[]>;

const TARGETED_CRAWLERS: Record<string, TargetedCrawlFn> = {
  nvd: crawlNvdTargeted,
  osv: crawlOsvTargeted,
  "github-advisory": crawlGitHubAdvisoryTargeted,
  shodan: crawlShodanTargeted,
  "sec-edgar": crawlSecEdgarTargeted,
  "infra-scan": crawlInfraScanTargeted,
};

async function crawlTargeted(targetId: string): Promise<void> {
  const start = Date.now();
  console.log(`[prospect-crawler] Starting TARGETED crawl for ${targetId}...`);

  const target = await readTarget(targetId);
  if (!target) {
    console.error(`[prospect-crawler] Target not found: ${targetId}`);
    process.exit(1);
  }

  console.log(`[prospect-crawler] Target: ${target.name} (${target.ticker ?? "no ticker"})`);

  let sources: ProspectSource[];
  try {
    sources = await readSources();
  } catch (err) {
    console.error("[prospect-crawler] Failed to read sources from D1:", err);
    process.exit(1);
  }

  const stats: Array<{ source: string; found: number; written: number; errors: number }> = [];

  for (const source of sources) {
    const crawler = TARGETED_CRAWLERS[source.source_id];
    if (!crawler) {
      console.warn(`[prospect-crawler] No targeted crawler for source: ${source.source_id}`);
      continue;
    }

    console.log(`[prospect-crawler] Targeted crawl ${source.source_id} for ${target.name}...`);
    let found = 0;
    let written = 0;
    let errors = 0;

    try {
      const leads = await crawler(target, source);
      found = leads.length;

      for (const lead of leads) {
        try {
          const ok = await writeLead(lead);
          if (ok) written++;
        } catch (err: any) {
          if (err.message?.includes("UNIQUE constraint")) continue;
          console.error(`[prospect-crawler] Write error for ${lead.vulnerability_id}:`, err);
          errors++;
        }
      }
    } catch (err) {
      console.error(`[prospect-crawler] Targeted crawler failed for ${source.source_id}:`, err);
      errors++;
    }

    stats.push({ source: source.source_id, found, written, errors });
  }

  const duration = Date.now() - start;
  const totalWritten = stats.reduce((a, s) => a + s.written, 0);
  const summary = {
    ok: true,
    mode: "targeted",
    target_id: targetId,
    target_name: target.name,
    duration_ms: duration,
    sources: stats,
    total_found: stats.reduce((a, s) => a + s.found, 0),
    total_written: totalWritten,
    total_errors: stats.reduce((a, s) => a + s.errors, 0),
  };

  console.log("[prospect-crawler] Targeted crawl complete:", JSON.stringify(summary, null, 2));

  // Trigger regression detection + auto-investigate for targeted leads
  if (totalWritten > 0) {
    const apiOrigin = process.env.HAIPHEN_API_ORIGIN ?? "https://api.haiphen.io";
    const internalToken = process.env.INTERNAL_TOKEN ?? "";
    if (internalToken) {
      try {
        const regRes = await fetch(`${apiOrigin}/v1/prospect/regressions/detect`, {
          method: "POST",
          headers: { "X-Internal-Token": internalToken },
        });
        const regData = (await regRes.json()) as { ok?: boolean };
        console.log("[prospect-crawler] Regression detection:", regData);
      } catch (err) {
        console.warn("[prospect-crawler] Regression detection failed:", err);
      }

      try {
        const invRes = await fetch(`${apiOrigin}/v1/internal/prospect/auto-investigate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Internal-Token": internalToken },
          body: JSON.stringify({ max_leads: 10, target_id: targetId }),
        });
        const invData = (await invRes.json()) as { ok?: boolean; investigated?: number };
        console.log("[prospect-crawler] Targeted auto-investigate:", invData);
      } catch (err) {
        console.warn("[prospect-crawler] Auto-investigate failed:", err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Credential resolution: D1 (via internal decrypt endpoint) → env var
// ---------------------------------------------------------------------------

const PROVIDER_ENV_MAP: Record<string, string> = {
  nvd: "NVD_API_KEY",
  github: "GITHUB_TOKEN",
  shodan: "SHODAN_API_KEY",
};

async function resolveCredentials(): Promise<void> {
  const apiOrigin = process.env.HAIPHEN_API_ORIGIN ?? "https://api.haiphen.io";
  const internalToken = process.env.INTERNAL_TOKEN ?? "";
  const userId = process.env.CREDENTIAL_USER_ID ?? "";

  if (!internalToken || !userId) {
    console.log("[prospect-crawler] No INTERNAL_TOKEN or CREDENTIAL_USER_ID set, using env vars only");
    return;
  }

  for (const [provider, envVar] of Object.entries(PROVIDER_ENV_MAP)) {
    // Skip if env var is already set
    if (process.env[envVar]) continue;

    try {
      const res = await fetch(`${apiOrigin}/v1/prospect/credentials/${provider}/decrypt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": internalToken,
        },
        body: JSON.stringify({ user_id: userId }),
      });

      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; api_key?: string };
        if (data.ok && data.api_key) {
          process.env[envVar] = data.api_key;
          console.log(`[prospect-crawler] Resolved ${provider} credential from vault`);
        }
      } else if (res.status !== 404) {
        console.warn(`[prospect-crawler] Failed to resolve ${provider} credential (${res.status})`);
      }
    } catch (err) {
      console.warn(`[prospect-crawler] Error resolving ${provider} credential:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const start = Date.now();
  console.log("[prospect-crawler] Starting crawl pipeline...");

  // Resolve user-stored credentials before crawling
  await resolveCredentials();

  // Read enabled sources from D1
  let sources: ProspectSource[];
  try {
    sources = await readSources();
  } catch (err) {
    console.error("[prospect-crawler] Failed to read sources from D1:", err);
    process.exit(1);
  }

  console.log(`[prospect-crawler] ${sources.length} enabled sources found`);

  const stats: Array<{ source: string; found: number; written: number; errors: number }> = [];

  // Process sources sequentially to respect rate limits
  for (const source of sources) {
    const crawler = CRAWLERS[source.source_id];
    if (!crawler) {
      console.warn(`[prospect-crawler] No crawler for source: ${source.source_id}`);
      continue;
    }

    console.log(`[prospect-crawler] Crawling ${source.source_id}...`);
    let found = 0;
    let written = 0;
    let errors = 0;

    try {
      const leads = await crawler(source);
      found = leads.length;

      for (const lead of leads) {
        try {
          const ok = await writeLead(lead);
          if (ok) written++;
        } catch (err: any) {
          // Dedup constraint violations are expected
          if (err.message?.includes("UNIQUE constraint")) {
            continue;
          }
          console.error(`[prospect-crawler] Write error for ${lead.vulnerability_id}:`, err);
          errors++;
        }
      }

      // Update cursor to now
      await updateSourceCursor(source.source_id, new Date().toISOString()).catch((err) => {
        console.error(`[prospect-crawler] Failed to update cursor for ${source.source_id}:`, err);
      });
    } catch (err) {
      console.error(`[prospect-crawler] Crawler failed for ${source.source_id}:`, err);
      errors++;
    }

    stats.push({ source: source.source_id, found, written, errors });
  }

  const duration = Date.now() - start;
  const totalWritten = stats.reduce((a, s) => a + s.written, 0);
  const summary = {
    ok: true,
    duration_ms: duration,
    sources: stats,
    total_found: stats.reduce((a, s) => a + s.found, 0),
    total_written: totalWritten,
    total_errors: stats.reduce((a, s) => a + s.errors, 0),
  };

  console.log("[prospect-crawler] Complete:", JSON.stringify(summary, null, 2));

  // Trigger regression detection if new leads were written
  if (totalWritten > 0) {
    const apiOrigin = process.env.HAIPHEN_API_ORIGIN ?? "https://api.haiphen.io";
    const internalToken = process.env.INTERNAL_TOKEN ?? "";
    if (internalToken) {
      try {
        const regRes = await fetch(`${apiOrigin}/v1/prospect/regressions/detect`, {
          method: "POST",
          headers: { "X-Internal-Token": internalToken },
        });
        const regData = (await regRes.json()) as { ok?: boolean; entity_regressions?: number; vuln_class_regressions?: number };
        console.log("[prospect-crawler] Regression detection:", regData);
      } catch (err) {
        console.warn("[prospect-crawler] Regression detection failed:", err);
      }

      // Auto-investigate top new leads
      try {
        const invRes = await fetch(`${apiOrigin}/v1/internal/prospect/auto-investigate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Internal-Token": internalToken },
          body: JSON.stringify({ max_leads: 5 }),
        });
        const invData = (await invRes.json()) as { ok?: boolean; investigated?: number };
        console.log("[prospect-crawler] Auto-investigate:", invData);
      } catch (err) {
        console.warn("[prospect-crawler] Auto-investigate failed:", err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Entry: check for TARGET_ID env var to select mode
// ---------------------------------------------------------------------------

const TARGET_ID = process.env.TARGET_ID;

if (TARGET_ID) {
  resolveCredentials()
    .then(() => crawlTargeted(TARGET_ID))
    .catch((err) => {
      console.error("[prospect-crawler] Fatal error (targeted):", err);
      process.exit(1);
    });
} else {
  main().catch((err) => {
    console.error("[prospect-crawler] Fatal error:", err);
    process.exit(1);
  });
}
