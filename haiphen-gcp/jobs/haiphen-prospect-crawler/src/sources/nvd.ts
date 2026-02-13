// ---------------------------------------------------------------------------
// NVD CVE 2.0 API crawler
// https://services.nvd.nist.gov/rest/json/cves/2.0
// Rate limit: 5 req/30s without API key, 50 with
// ---------------------------------------------------------------------------

import { ProspectLead, ProspectSource, ProspectTarget } from "../d1-writer";
import { randomUUID, sleep } from "../util";

interface NvdConfig {
  min_cvss: number;
  keywords: string[];
}

interface NvdCve {
  id: string;
  sourceIdentifier?: string;
  descriptions: Array<{ lang: string; value: string }>;
  metrics?: {
    cvssMetricV31?: Array<{
      cvssData: { baseScore: number; baseSeverity: string };
    }>;
    cvssMetricV2?: Array<{
      cvssData: { baseScore: number };
    }>;
  };
  configurations?: Array<{
    nodes: Array<{
      cpeMatch: Array<{
        criteria: string;
        vulnerable: boolean;
      }>;
    }>;
  }>;
}

interface NvdResponse {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  vulnerabilities: Array<{ cve: NvdCve }>;
}

function extractVendorProduct(cpe: string): { vendor: string; product: string } | null {
  // CPE 2.3 format: cpe:2.3:a:vendor:product:version:...
  const parts = cpe.split(":");
  if (parts.length >= 5) {
    return { vendor: parts[3], product: parts[4] };
  }
  return null;
}

function severityFromCvss(score: number): ProspectLead["severity"] {
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  if (score >= 0.1) return "low";
  return "info";
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function determineServices(cve: NvdCve, description: string): string[] {
  const services: string[] = ["secure"]; // All CVEs are relevant to secure
  const lower = description.toLowerCase();

  // Trade execution & order flow
  if (/trading|order|execution|fix\b|fix protocol|matching engine/.test(lower)) {
    services.push("risk", "network");
  }
  // Settlement & clearing
  if (/settlement|clearing|reconciliation|position|drift|margin/.test(lower)) {
    services.push("risk", "causal");
  }
  // Brokerage & asset management
  if (/broker|brokerage|custodian|portfolio|wealth/.test(lower)) {
    services.push("risk", "supply");
  }
  // Market data feeds
  if (/market data|price feed|quote|ticker|data vendor/.test(lower)) {
    services.push("network", "causal");
  }
  // API & gateway
  if (/\bapi\b|gateway|webhook|oauth|rest\b/.test(lower)) {
    services.push("network", "supply");
  }
  // Payment & ledger
  if (/payment|ledger|transaction|ach|wire|swift|treasury/.test(lower)) {
    services.push("risk", "graph");
  }
  // Supply chain / dependency (keep existing)
  if (/supply chain|dependency|third-party|vendor/.test(lower)) {
    services.push("supply");
  }
  // Industrial protocols (keep for backward compat)
  if (/modbus|mqtt|opcua|dnp3|bacnet|scada|plc/.test(lower)) {
    services.push("network");
  }
  // Causal chain
  if (/cascade|propagat|chain|downstream/.test(lower)) {
    services.push("causal");
  }

  return [...new Set(services)];
}

export async function crawlNvd(source: ProspectSource): Promise<ProspectLead[]> {
  const config: NvdConfig = source.config_json
    ? JSON.parse(source.config_json)
    : { min_cvss: 7.0, keywords: ["SCADA", "PLC", "Modbus", "OPC", "HMI", "ICS"] };

  const leads: ProspectLead[] = [];
  const baseUrl = source.api_base_url;

  // Use last_cursor as lastModStartDate, or default to 7 days ago
  const cursor = source.last_cursor
    ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let startIndex = 0;
  const resultsPerPage = 50;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      lastModStartDate: cursor,
      lastModEndDate: new Date().toISOString(),
      resultsPerPage: String(resultsPerPage),
      startIndex: String(startIndex),
    });

    const url = `${baseUrl}?${params}`;
    console.log(`[nvd] Fetching: startIndex=${startIndex}`);

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`[nvd] API error (${res.status}): ${await res.text()}`);
      break;
    }

    const data = (await res.json()) as NvdResponse;

    for (const { cve } of data.vulnerabilities) {
      const description =
        cve.descriptions.find((d) => d.lang === "en")?.value ?? cve.descriptions[0]?.value ?? "";

      // Extract CVSS score
      const cvssV31 = cve.metrics?.cvssMetricV31?.[0]?.cvssData;
      const cvssV2 = cve.metrics?.cvssMetricV2?.[0]?.cvssData;
      const cvssScore = cvssV31?.baseScore ?? cvssV2?.baseScore ?? 0;

      // Filter: minimum CVSS and keyword match
      if (cvssScore < config.min_cvss) continue;
      if (!matchesKeywords(description, config.keywords)) continue;

      // Extract affected vendors/products from CPE
      const vendors = new Set<string>();
      for (const cfg of cve.configurations ?? []) {
        for (const node of cfg.nodes) {
          for (const match of node.cpeMatch) {
            if (match.vulnerable) {
              const vp = extractVendorProduct(match.criteria);
              if (vp) vendors.add(vp.vendor);
            }
          }
        }
      }

      const entityName = vendors.size > 0
        ? [...vendors].join(", ")
        : cve.sourceIdentifier ?? "unknown";

      const services = determineServices(cve, description);

      leads.push({
        lead_id: randomUUID(),
        source_id: "nvd",
        entity_type: "software",
        entity_name: entityName,
        vulnerability_id: cve.id,
        severity: severityFromCvss(cvssScore),
        cvss_score: cvssScore,
        summary: description.slice(0, 500),
        raw_data_json: JSON.stringify(cve),
        services_json: JSON.stringify(services),
      });
    }

    startIndex += resultsPerPage;
    hasMore = startIndex < data.totalResults && startIndex < 200; // Cap at 200 results per run

    // Rate limit: 5 requests per 30 seconds (conservative)
    if (hasMore) {
      await sleep(6000);
    }
  }

  console.log(`[nvd] Found ${leads.length} leads`);
  return leads;
}

export async function crawlNvdTargeted(target: ProspectTarget, source: ProspectSource): Promise<ProspectLead[]> {
  const leads: ProspectLead[] = [];
  const baseUrl = source.api_base_url;
  const searchTerms = [target.name];

  // Also search known products as CPE vendor names
  const products: string[] = target.products ? JSON.parse(target.products) : [];
  const keywords: string[] = target.keywords ? JSON.parse(target.keywords) : [];
  searchTerms.push(...keywords);

  for (const term of searchTerms.slice(0, 3)) {
    const params = new URLSearchParams({
      keywordSearch: term,
      resultsPerPage: "20",
    });

    const url = `${baseUrl}?${params}`;
    console.log(`[nvd-targeted] Searching: "${term}"`);

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`[nvd-targeted] API error (${res.status}): ${await res.text()}`);
      await sleep(6000);
      continue;
    }

    const data = (await res.json()) as NvdResponse;

    for (const { cve } of data.vulnerabilities) {
      const description =
        cve.descriptions.find((d) => d.lang === "en")?.value ?? cve.descriptions[0]?.value ?? "";

      const cvssV31 = cve.metrics?.cvssMetricV31?.[0]?.cvssData;
      const cvssV2 = cve.metrics?.cvssMetricV2?.[0]?.cvssData;
      const cvssScore = cvssV31?.baseScore ?? cvssV2?.baseScore ?? 0;

      if (cvssScore < 4.0) continue; // Lower threshold for targeted crawl

      const vendors = new Set<string>();
      for (const cfg of cve.configurations ?? []) {
        for (const node of cfg.nodes) {
          for (const match of node.cpeMatch) {
            if (match.vulnerable) {
              const vp = extractVendorProduct(match.criteria);
              if (vp) vendors.add(vp.vendor);
            }
          }
        }
      }

      const entityName = vendors.size > 0
        ? [...vendors].join(", ")
        : cve.sourceIdentifier ?? target.name;

      const services = determineServices(cve, description);

      leads.push({
        lead_id: randomUUID(),
        source_id: "nvd",
        entity_type: "software",
        entity_name: entityName,
        vulnerability_id: cve.id,
        severity: severityFromCvss(cvssScore),
        cvss_score: cvssScore,
        summary: description.slice(0, 500),
        raw_data_json: JSON.stringify(cve),
        services_json: JSON.stringify(services),
        target_id: target.target_id,
      });
    }

    await sleep(6000);
  }

  console.log(`[nvd-targeted] Found ${leads.length} leads for ${target.name}`);
  return leads;
}
