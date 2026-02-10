// ---------------------------------------------------------------------------
// OSV API crawler — Open Source Vulnerabilities
// https://api.osv.dev/v1/query
// Unlimited rate, queries by ecosystem
// ---------------------------------------------------------------------------

import { ProspectLead, ProspectSource } from "../d1-writer";
import { randomUUID, sleep } from "../util";

interface OsvConfig {
  ecosystems: string[];
  keywords: string[];
}

interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  severity?: Array<{ type: string; score: string }>;
  affected?: Array<{
    package?: { ecosystem: string; name: string };
    ranges?: Array<{ type: string; events: Array<{ introduced?: string; fixed?: string }> }>;
  }>;
  references?: Array<{ type: string; url: string }>;
  modified?: string;
  published?: string;
}

interface OsvQueryResponse {
  vulns?: OsvVulnerability[];
  next_page_token?: string;
}

function parseCvssScore(severity: OsvVulnerability["severity"]): number | null {
  if (!severity) return null;
  for (const s of severity) {
    if (s.type === "CVSS_V3") {
      // CVSS vector string — extract base score from end
      const match = s.score.match(/(\d+\.\d+)$/);
      if (match) return parseFloat(match[1]);
    }
  }
  return null;
}

function severityFromCvss(score: number | null): ProspectLead["severity"] {
  if (score === null) return "medium";
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  if (score >= 0.1) return "low";
  return "info";
}

// ICS/IoT-relevant packages to query across ecosystems
const ICS_PACKAGES: Record<string, string[]> = {
  npm: ["modbus-serial", "node-opcua", "mqtt", "bacnet-client", "node-red"],
  PyPI: ["pymodbus", "opcua", "paho-mqtt", "scapy", "pycomm3"],
  Go: ["github.com/gopcua/opcua", "github.com/eclipse/paho.mqtt.golang"],
};

export async function crawlOsv(source: ProspectSource): Promise<ProspectLead[]> {
  const config: OsvConfig = source.config_json
    ? JSON.parse(source.config_json)
    : { ecosystems: ["npm", "PyPI", "Go"], keywords: ["industrial", "iot", "scada"] };

  const leads: ProspectLead[] = [];
  const baseUrl = source.api_base_url;

  for (const ecosystem of config.ecosystems) {
    const packages = ICS_PACKAGES[ecosystem] ?? [];

    for (const pkg of packages) {
      console.log(`[osv] Querying ${ecosystem}/${pkg}`);

      try {
        const res = await fetch(`${baseUrl}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            package: { ecosystem, name: pkg },
          }),
        });

        if (!res.ok) {
          console.error(`[osv] API error for ${pkg} (${res.status})`);
          continue;
        }

        const data = (await res.json()) as OsvQueryResponse;
        const vulns = data.vulns ?? [];

        for (const vuln of vulns.slice(0, 10)) {
          const cvssScore = parseCvssScore(vuln.severity);
          const summary = vuln.summary ?? vuln.details?.slice(0, 300) ?? vuln.id;

          leads.push({
            lead_id: randomUUID(),
            source_id: "osv",
            entity_type: "software",
            entity_name: pkg,
            vulnerability_id: vuln.id,
            severity: severityFromCvss(cvssScore),
            cvss_score: cvssScore,
            summary: summary.slice(0, 500),
            raw_data_json: JSON.stringify(vuln),
            services_json: JSON.stringify(["secure", "supply"]),
          });
        }
      } catch (err) {
        console.error(`[osv] Error querying ${pkg}:`, err);
      }

      // Brief pause between queries
      await sleep(500);
    }
  }

  console.log(`[osv] Found ${leads.length} leads`);
  return leads;
}
