// ---------------------------------------------------------------------------
// Shodan Internet Search crawler
// https://api.shodan.io
// Rate: 1 req/sec, 100 queries/month on free tier
// ---------------------------------------------------------------------------

import { ProspectLead, ProspectSource, ProspectTarget } from "../d1-writer";
import { randomUUID, sleep } from "../util";

interface ShodanConfig {
  queries: string[];
}

interface ShodanMatch {
  ip_str: string;
  port: number;
  org?: string;
  isp?: string;
  os?: string;
  product?: string;
  version?: string;
  hostnames?: string[];
  domains?: string[];
  country_code?: string;
  city?: string;
  vulns?: string[];
  data?: string;
}

interface ShodanSearchResponse {
  matches: ShodanMatch[];
  total: number;
}

interface ShodanApiInfo {
  query_credits: number;
  scan_credits: number;
  plan: string;
}

const PORT_SERVICE_MAP: Record<number, string> = {
  502: "Modbus",
  4840: "OPC-UA",
  1883: "MQTT",
  47808: "BACnet",
  20000: "DNP3",
  2404: "IEC 60870-5-104",
  44818: "EtherNet/IP",
};

function determineServices(match: ShodanMatch): string[] {
  const services: string[] = ["secure", "network"];

  if (match.vulns && match.vulns.length > 0) {
    services.push("risk");
  }

  const portService = PORT_SERVICE_MAP[match.port];
  if (portService) {
    services.push("graph"); // Network topology mapping
  }

  return [...new Set(services)];
}

function determineSeverity(match: ShodanMatch): ProspectLead["severity"] {
  // Exposed ICS ports are inherently high severity
  if (match.vulns && match.vulns.length > 0) return "critical";
  if (PORT_SERVICE_MAP[match.port]) return "high";
  return "medium";
}

export async function crawlShodan(source: ProspectSource): Promise<ProspectLead[]> {
  const apiKey = process.env.SHODAN_API_KEY;
  if (!apiKey) {
    console.warn("[shodan] SHODAN_API_KEY not set, skipping");
    return [];
  }

  const config: ShodanConfig = source.config_json
    ? JSON.parse(source.config_json)
    : { queries: ["port:502 country:US"] };

  // Check remaining query credits
  try {
    const infoRes = await fetch(`https://api.shodan.io/api-info?key=${apiKey}`);
    if (infoRes.ok) {
      const info = (await infoRes.json()) as ShodanApiInfo;
      console.log(`[shodan] Query credits remaining: ${info.query_credits}`);
      if (info.query_credits <= 0) {
        console.warn("[shodan] No query credits remaining, skipping");
        return [];
      }
    }
  } catch (err) {
    console.warn("[shodan] Could not check API info:", err);
  }

  const leads: ProspectLead[] = [];

  for (const query of config.queries) {
    console.log(`[shodan] Searching: ${query}`);

    try {
      const params = new URLSearchParams({
        key: apiKey,
        query,
      });

      const res = await fetch(`https://api.shodan.io/shodan/host/search?${params}`);

      if (!res.ok) {
        const text = await res.text();
        console.error(`[shodan] API error for "${query}" (${res.status}): ${text}`);
        continue;
      }

      const data = (await res.json()) as ShodanSearchResponse;

      for (const match of data.matches.slice(0, 20)) {
        const portService = PORT_SERVICE_MAP[match.port] ?? `port ${match.port}`;
        const entityName = match.org ?? match.isp ?? match.ip_str;
        const hostname = match.hostnames?.[0] ?? match.ip_str;
        const domain = match.domains?.[0] ?? null;

        const summary = [
          `Exposed ${portService} service on ${hostname}:${match.port}`,
          match.product ? `(${match.product}${match.version ? ` v${match.version}` : ""})` : "",
          match.country_code ? `in ${match.country_code}` : "",
          match.vulns?.length ? `with ${match.vulns.length} known vulns` : "",
        ]
          .filter(Boolean)
          .join(" ");

        const vulnId = match.vulns?.[0] ?? `shodan:${match.ip_str}:${match.port}`;

        leads.push({
          lead_id: randomUUID(),
          source_id: "shodan",
          entity_type: match.org ? "company" : "device",
          entity_name: entityName,
          entity_domain: domain,
          country: match.country_code ?? null,
          vulnerability_id: vulnId,
          severity: determineSeverity(match),
          summary: summary.slice(0, 500),
          raw_data_json: JSON.stringify(match),
          services_json: JSON.stringify(determineServices(match)),
        });
      }
    } catch (err) {
      console.error(`[shodan] Error searching "${query}":`, err);
    }

    // Rate limit: 1 req/sec
    await sleep(1500);
  }

  console.log(`[shodan] Found ${leads.length} leads`);
  return leads;
}

export async function crawlShodanTargeted(target: ProspectTarget, source: ProspectSource): Promise<ProspectLead[]> {
  const apiKey = process.env.SHODAN_API_KEY;
  if (!apiKey) {
    console.warn("[shodan-targeted] SHODAN_API_KEY not set, skipping");
    return [];
  }

  const leads: ProspectLead[] = [];
  const domains: string[] = target.domains ? JSON.parse(target.domains) : [];

  // Build targeted queries: org name + domain hostnames
  const queries: string[] = [`org:"${target.name}"`];
  for (const domain of domains.slice(0, 3)) {
    queries.push(`hostname:${domain}`);
    queries.push(`ssl.cert.subject.cn:${domain}`);
  }

  for (const query of queries.slice(0, 5)) {
    console.log(`[shodan-targeted] Searching: ${query}`);

    try {
      const params = new URLSearchParams({ key: apiKey, query });
      const res = await fetch(`https://api.shodan.io/shodan/host/search?${params}`);

      if (!res.ok) {
        const text = await res.text();
        console.error(`[shodan-targeted] API error for "${query}" (${res.status}): ${text}`);
        continue;
      }

      const data = (await res.json()) as ShodanSearchResponse;

      for (const match of data.matches.slice(0, 10)) {
        const portService = PORT_SERVICE_MAP[match.port] ?? `port ${match.port}`;
        const entityName = match.org ?? match.isp ?? match.ip_str;
        const hostname = match.hostnames?.[0] ?? match.ip_str;
        const domain = match.domains?.[0] ?? null;

        const summary = [
          `Exposed ${portService} service on ${hostname}:${match.port}`,
          match.product ? `(${match.product}${match.version ? ` v${match.version}` : ""})` : "",
          match.country_code ? `in ${match.country_code}` : "",
          match.vulns?.length ? `with ${match.vulns.length} known vulns` : "",
        ].filter(Boolean).join(" ");

        const vulnId = match.vulns?.[0] ?? `shodan:${match.ip_str}:${match.port}`;

        leads.push({
          lead_id: randomUUID(),
          source_id: "shodan",
          entity_type: match.org ? "company" : "device",
          entity_name: entityName,
          entity_domain: domain,
          country: match.country_code ?? null,
          vulnerability_id: vulnId,
          severity: determineSeverity(match),
          summary: summary.slice(0, 500),
          raw_data_json: JSON.stringify(match),
          services_json: JSON.stringify(determineServices(match)),
          target_id: target.target_id,
        });
      }
    } catch (err) {
      console.error(`[shodan-targeted] Error searching "${query}":`, err);
    }

    await sleep(1500);
  }

  console.log(`[shodan-targeted] Found ${leads.length} leads for ${target.name}`);
  return leads;
}
