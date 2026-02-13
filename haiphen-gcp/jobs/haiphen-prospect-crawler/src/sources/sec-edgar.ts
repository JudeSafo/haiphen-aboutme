// ---------------------------------------------------------------------------
// SEC EDGAR EFTS full-text search crawler
// Queries 8-K and 10-K filings for cybersecurity/technology incidents.
// Public API — no auth needed. Rate limit: 10 req/sec (SEC fair use).
// ---------------------------------------------------------------------------

import { ProspectLead, ProspectSource, ProspectTarget } from "../d1-writer";
import { randomUUID, sleep } from "../util";

interface EdgarConfig {
  keywords: string[];
  forms: string[];
  dateRange: string;
}

interface EdgarHit {
  _id: string;
  _source: {
    file_date: string;
    display_date_dt: string;
    entity_name: string;
    file_num: string;
    form_type: string;
    file_description?: string;
    display_names?: string[];
    biz_locations?: string[];
    period_of_report?: string;
  };
}

interface EdgarResponse {
  hits: {
    total: { value: number };
    hits: EdgarHit[];
  };
}

function severityFromForm(formType: string): ProspectLead["severity"] {
  // 8-K = material event disclosure → high
  // 10-K risk factor mention → medium
  if (formType.startsWith("8-K")) return "high";
  if (formType.startsWith("10-K")) return "medium";
  return "medium";
}

function impactScoreFromForm(formType: string): number {
  if (formType.startsWith("8-K")) return 70;
  if (formType.startsWith("10-K")) return 50;
  return 60;
}

function accessionToId(accession: string): string {
  // EDGAR accession numbers are like "0001234567-25-001234"
  return `SEC-${accession.replace(/[^0-9-]/g, "")}`;
}

function determineServices(formType: string, text: string): string[] {
  const services: string[] = ["risk"];
  const lower = text.toLowerCase();

  if (/trading|execution|order|exchange/.test(lower)) services.push("network", "causal");
  if (/data breach|unauthorized access|cyber/.test(lower)) services.push("secure");
  if (/outage|disruption|failure|downtime/.test(lower)) services.push("causal", "network");
  if (/vendor|third.party|supply/.test(lower)) services.push("supply");
  if (/settlement|clearing|payment/.test(lower)) services.push("graph");

  return [...new Set(services)];
}

export async function crawlSecEdgar(source: ProspectSource): Promise<ProspectLead[]> {
  const config: EdgarConfig = source.config_json
    ? JSON.parse(source.config_json)
    : { keywords: ["cybersecurity incident", "technology failure", "trading disruption"], forms: ["8-K", "10-K"], dateRange: "30d" };

  const leads: ProspectLead[] = [];

  // Compute date range
  const daysMatch = config.dateRange.match(/^(\d+)d$/);
  const rangeDays = daysMatch ? parseInt(daysMatch[1], 10) : 30;
  const endDate = new Date();
  const startDate = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  for (const keyword of config.keywords) {
    // SEC EDGAR EFTS full-text search API
    const params = new URLSearchParams({
      q: `"${keyword}"`,
      dateRange: "custom",
      startdt: startStr,
      enddt: endStr,
      forms: config.forms.join(","),
    });

    const url = `https://efts.sec.gov/LATEST/search-index?${params}`;
    console.log(`[sec-edgar] Searching: "${keyword}"`);

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Haiphen/1.0 (infrastructure intelligence; contact@haiphen.io)",
        },
      });

      if (!res.ok) {
        console.warn(`[sec-edgar] API error (${res.status}) for keyword "${keyword}"`);
        await sleep(1000);
        continue;
      }

      const data = (await res.json()) as EdgarResponse;
      const hits = data.hits?.hits ?? [];
      console.log(`[sec-edgar] "${keyword}": ${hits.length} hits`);

      for (const hit of hits) {
        const src = hit._source;
        const entityName = src.entity_name || src.display_names?.[0] || "Unknown Entity";
        const accession = hit._id;
        const vulnId = accessionToId(accession);
        const severity = severityFromForm(src.form_type);
        const impactScore = impactScoreFromForm(src.form_type);

        const summary = `SEC ${src.form_type} filing by ${entityName} (${src.file_date}): ` +
          `${src.file_description || keyword}. ` +
          `Accession: ${accession}.`;

        const services = determineServices(src.form_type, summary);

        leads.push({
          lead_id: randomUUID(),
          source_id: "sec-edgar",
          entity_type: "company",
          entity_name: entityName,
          vulnerability_id: vulnId,
          severity,
          cvss_score: null,
          summary: summary.slice(0, 500),
          raw_data_json: JSON.stringify(src),
          services_json: JSON.stringify(services),
          signal_type: "regulatory",
          impact_score: impactScore,
        });
      }
    } catch (err) {
      console.error(`[sec-edgar] Error for keyword "${keyword}":`, err);
    }

    // SEC fair use: 10 req/sec → 100ms between requests (conservative 200ms)
    await sleep(200);
  }

  console.log(`[sec-edgar] Found ${leads.length} leads total`);
  return leads;
}

export async function crawlSecEdgarTargeted(target: ProspectTarget, source: ProspectSource): Promise<ProspectLead[]> {
  const leads: ProspectLead[] = [];

  // Search by company name and CIK for higher precision
  const searchQueries: string[] = [target.name];
  if (target.cik) searchQueries.push(target.cik);

  const endDate = new Date();
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  for (const query of searchQueries.slice(0, 2)) {
    const params = new URLSearchParams({
      q: `"${query}"`,
      dateRange: "custom",
      startdt: startStr,
      enddt: endStr,
      forms: "8-K,10-K",
    });

    const url = `https://efts.sec.gov/LATEST/search-index?${params}`;
    console.log(`[sec-edgar-targeted] Searching: "${query}" for ${target.name}`);

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Haiphen/1.0 (infrastructure intelligence; contact@haiphen.io)",
        },
      });

      if (!res.ok) {
        console.warn(`[sec-edgar-targeted] API error (${res.status}) for "${query}"`);
        await sleep(200);
        continue;
      }

      const data = (await res.json()) as EdgarResponse;
      const hits = data.hits?.hits ?? [];
      console.log(`[sec-edgar-targeted] "${query}": ${hits.length} hits`);

      for (const hit of hits.slice(0, 10)) {
        const src = hit._source;
        const entityName = src.entity_name || src.display_names?.[0] || target.name;
        const accession = hit._id;
        const vulnId = accessionToId(accession);
        const severity = severityFromForm(src.form_type);
        const impactScore = impactScoreFromForm(src.form_type);

        const summary = `SEC ${src.form_type} filing by ${entityName} (${src.file_date}): ` +
          `${src.file_description || query}. Accession: ${accession}.`;

        const services = determineServices(src.form_type, summary);

        leads.push({
          lead_id: randomUUID(),
          source_id: "sec-edgar",
          entity_type: "company",
          entity_name: entityName,
          vulnerability_id: vulnId,
          severity,
          cvss_score: null,
          summary: summary.slice(0, 500),
          raw_data_json: JSON.stringify(src),
          services_json: JSON.stringify(services),
          signal_type: "regulatory",
          impact_score: impactScore,
          target_id: target.target_id,
        });
      }
    } catch (err) {
      console.error(`[sec-edgar-targeted] Error for "${query}":`, err);
    }

    await sleep(200);
  }

  console.log(`[sec-edgar-targeted] Found ${leads.length} leads for ${target.name}`);
  return leads;
}
