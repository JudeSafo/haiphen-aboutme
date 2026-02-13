// ---------------------------------------------------------------------------
// OSV API crawler — Open Source Vulnerabilities
// https://api.osv.dev/v1/query
// Unlimited rate, queries by ecosystem
// ---------------------------------------------------------------------------

import { ProspectLead, ProspectSource, ProspectTarget } from "../d1-writer";
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

// Fintech + ICS/IoT-relevant packages to query across ecosystems
const ICS_PACKAGES: Record<string, string[]> = {
  npm: [
    // Fintech
    "ccxt", "ws", "socket.io", "express", "fastify", "passport",
    "jsonwebtoken", "stripe", "plaid", "alpaca-trade-api",
    // ICS/IoT
    "modbus-serial", "node-opcua", "mqtt", "bacnet-client", "node-red",
  ],
  PyPI: [
    // Fintech
    "ccxt", "websockets", "fastapi", "django", "celery", "alpaca-trade-api",
    "ibapi", "pandas", "numpy",
    // ICS/IoT
    "pymodbus", "opcua", "paho-mqtt", "scapy", "pycomm3",
  ],
  Go: [
    // Fintech/API
    "github.com/gin-gonic/gin", "github.com/gorilla/websocket",
    "github.com/golang-jwt/jwt",
    // ICS/IoT
    "github.com/gopcua/opcua", "github.com/eclipse/paho.mqtt.golang",
  ],
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

          // Determine services based on summary content
          const svcSet = new Set(["secure", "supply"]);
          const lowerSummary = summary.toLowerCase();
          if (/trading|order|execution|websocket|fix\b/.test(lowerSummary)) { svcSet.add("risk"); svcSet.add("network"); }
          if (/api|gateway|auth|oauth|jwt|token/.test(lowerSummary)) { svcSet.add("network"); }
          if (/payment|transaction|ledger/.test(lowerSummary)) { svcSet.add("risk"); svcSet.add("graph"); }
          if (/settlement|clearing|reconcil/.test(lowerSummary)) { svcSet.add("risk"); svcSet.add("causal"); }

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
            services_json: JSON.stringify([...svcSet]),
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

export async function crawlOsvTargeted(target: ProspectTarget, source: ProspectSource): Promise<ProspectLead[]> {
  const leads: ProspectLead[] = [];
  const baseUrl = source.api_base_url;
  const products: string[] = target.products ? JSON.parse(target.products) : [];

  if (products.length === 0) {
    console.log(`[osv-targeted] No products for ${target.name}, skipping`);
    return leads;
  }

  // Query each product as a package name across common ecosystems
  const ecosystems = ["npm", "PyPI", "Go", "Maven", "NuGet", "crates.io"];

  for (const product of products.slice(0, 5)) {
    for (const ecosystem of ecosystems) {
      console.log(`[osv-targeted] Querying ${ecosystem}/${product}`);

      try {
        const res = await fetch(`${baseUrl}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package: { ecosystem, name: product } }),
        });

        if (!res.ok) continue;

        const data = (await res.json()) as OsvQueryResponse;
        const vulns = data.vulns ?? [];

        for (const vuln of vulns.slice(0, 5)) {
          const cvssScore = parseCvssScore(vuln.severity);
          const summary = vuln.summary ?? vuln.details?.slice(0, 300) ?? vuln.id;

          const svcSet = new Set(["secure", "supply"]);
          const lowerSummary = summary.toLowerCase();
          if (/trading|order|execution/.test(lowerSummary)) { svcSet.add("risk"); svcSet.add("network"); }
          if (/api|gateway|auth/.test(lowerSummary)) { svcSet.add("network"); }

          leads.push({
            lead_id: randomUUID(),
            source_id: "osv",
            entity_type: "software",
            entity_name: product,
            vulnerability_id: vuln.id,
            severity: severityFromCvss(cvssScore),
            cvss_score: cvssScore,
            summary: summary.slice(0, 500),
            raw_data_json: JSON.stringify(vuln),
            services_json: JSON.stringify([...svcSet]),
            target_id: target.target_id,
          });
        }
      } catch (err) {
        console.error(`[osv-targeted] Error querying ${product}:`, err);
      }

      await sleep(300);
    }
  }

  console.log(`[osv-targeted] Found ${leads.length} leads for ${target.name}`);
  return leads;
}
