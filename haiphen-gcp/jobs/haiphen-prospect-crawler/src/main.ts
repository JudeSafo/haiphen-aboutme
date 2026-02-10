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
  writeLead,
  updateSourceCursor,
  ProspectSource,
  ProspectLead,
} from "./d1-writer";
import { crawlNvd } from "./sources/nvd";
import { crawlOsv } from "./sources/osv";
import { crawlGitHubAdvisory } from "./sources/github-advisory";
import { crawlShodan } from "./sources/shodan";

// ---------------------------------------------------------------------------
// Source dispatcher
// ---------------------------------------------------------------------------

type CrawlFn = (source: ProspectSource) => Promise<ProspectLead[]>;

const CRAWLERS: Record<string, CrawlFn> = {
  nvd: crawlNvd,
  osv: crawlOsv,
  "github-advisory": crawlGitHubAdvisory,
  shodan: crawlShodan,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const start = Date.now();
  console.log("[prospect-crawler] Starting crawl pipeline...");

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
  const summary = {
    ok: true,
    duration_ms: duration,
    sources: stats,
    total_found: stats.reduce((a, s) => a + s.found, 0),
    total_written: stats.reduce((a, s) => a + s.written, 0),
    total_errors: stats.reduce((a, s) => a + s.errors, 0),
  };

  console.log("[prospect-crawler] Complete:", JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("[prospect-crawler] Fatal error:", err);
  process.exit(1);
});
