// ---------------------------------------------------------------------------
// Infrastructure Fingerprint Scanner
// Passive fingerprinting of entity domains already in D1.
// No port scanning — only HTTPS fetch, TLS inspection, header analysis, DNS.
// ---------------------------------------------------------------------------

import { ProspectLead, ProspectSource, ProspectTarget } from "../d1-writer";
import { randomUUID, sleep } from "../util";
import * as tls from "tls";
import * as https from "https";
import { Resolver } from "dns";

interface InfraConfig {
  targets: string;
  checks: string[];
}

interface DomainFinding {
  check_type: string;
  severity: ProspectLead["severity"];
  summary: string;
  impact_score: number;
}

// ---------------------------------------------------------------------------
// D1 query: get distinct domain-like entity names
// ---------------------------------------------------------------------------

const CF_API = "https://api.cloudflare.com/client/v4";

async function getDomainEntities(): Promise<string[]> {
  const accountId = process.env.CF_ACCOUNT_ID ?? "";
  const dbId = process.env.CF_D1_DATABASE_ID ?? "";
  const token = process.env.CF_API_TOKEN ?? "";

  if (!accountId || !dbId || !token) {
    console.warn("[infra-scan] Missing CF credentials, cannot query D1 for domains");
    return [];
  }

  const url = `${CF_API}/accounts/${accountId}/d1/database/${dbId}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql: `SELECT DISTINCT entity_name FROM prospect_leads WHERE entity_name LIKE '%.%' AND entity_name NOT LIKE '%, %' LIMIT 50`,
      params: [],
    }),
  });

  if (!res.ok) {
    console.error(`[infra-scan] D1 query failed (${res.status})`);
    return [];
  }

  const json = (await res.json()) as any;
  const rows = json.result?.[0]?.results ?? [];
  return rows.map((r: any) => r.entity_name as string);
}

// ---------------------------------------------------------------------------
// TLS check: version + cert expiry
// ---------------------------------------------------------------------------

function checkTls(domain: string): Promise<DomainFinding[]> {
  return new Promise((resolve) => {
    const findings: DomainFinding[] = [];
    const timeout = setTimeout(() => resolve(findings), 10000);

    try {
      const socket = tls.connect(443, domain, { servername: domain, rejectUnauthorized: false }, () => {
        clearTimeout(timeout);
        const proto = socket.getProtocol?.();
        const cert = socket.getPeerCertificate();

        // TLS version check
        if (proto && (proto === "TLSv1" || proto === "TLSv1.1")) {
          findings.push({
            check_type: "tls_version",
            severity: "high",
            summary: `Legacy ${proto} on ${domain}. Modern browsers and APIs require TLS 1.2+.`,
            impact_score: 70,
          });
        }

        // Certificate expiry check
        if (cert?.valid_to) {
          const expiryDate = new Date(cert.valid_to);
          const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

          if (daysUntilExpiry < 0) {
            findings.push({
              check_type: "cert_expiry",
              severity: "critical",
              summary: `Expired SSL certificate on ${domain} (expired ${Math.abs(daysUntilExpiry)} days ago).`,
              impact_score: 80,
            });
          } else if (daysUntilExpiry < 30) {
            findings.push({
              check_type: "cert_expiry",
              severity: "high",
              summary: `SSL certificate on ${domain} expires in ${daysUntilExpiry} days (${expiryDate.toISOString().split("T")[0]}).`,
              impact_score: 70,
            });
          } else if (daysUntilExpiry < 90) {
            findings.push({
              check_type: "cert_expiry",
              severity: "medium",
              summary: `SSL certificate on ${domain} expires in ${daysUntilExpiry} days.`,
              impact_score: 50,
            });
          }
        }

        socket.end();
        resolve(findings);
      });

      socket.on("error", () => {
        clearTimeout(timeout);
        resolve(findings);
      });
    } catch {
      clearTimeout(timeout);
      resolve(findings);
    }
  });
}

// ---------------------------------------------------------------------------
// HTTP headers + response time
// ---------------------------------------------------------------------------

function checkHeaders(domain: string): Promise<DomainFinding[]> {
  return new Promise((resolve) => {
    const findings: DomainFinding[] = [];
    const startTime = Date.now();
    const timeout = setTimeout(() => resolve(findings), 15000);

    try {
      const req = https.get(`https://${domain}`, { timeout: 10000, rejectUnauthorized: false }, (res) => {
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        const headers = res.headers;

        // Response time
        if (elapsed > 2000) {
          findings.push({
            check_type: "response_time",
            severity: "medium",
            summary: `Slow response time on ${domain}: ${elapsed}ms (>2000ms threshold).`,
            impact_score: 50,
          });
        }

        // HSTS check
        if (!headers["strict-transport-security"]) {
          findings.push({
            check_type: "hsts",
            severity: "low",
            summary: `Missing HSTS header on ${domain}. Vulnerable to protocol downgrade attacks.`,
            impact_score: 30,
          });
        }

        // Server header leak
        const server = headers["server"];
        const powered = headers["x-powered-by"];
        if (server && powered) {
          findings.push({
            check_type: "server_headers",
            severity: "info",
            summary: `Server information disclosed on ${domain}: ${server}, X-Powered-By: ${powered}.`,
            impact_score: 20,
          });
        }

        res.resume();
        resolve(findings);
      });

      req.on("error", () => {
        clearTimeout(timeout);
        resolve(findings);
      });

      req.on("timeout", () => {
        clearTimeout(timeout);
        findings.push({
          check_type: "response_time",
          severity: "medium",
          summary: `Request timeout on ${domain} (>10s).`,
          impact_score: 50,
        });
        req.destroy();
        resolve(findings);
      });
    } catch {
      clearTimeout(timeout);
      resolve(findings);
    }
  });
}

// ---------------------------------------------------------------------------
// DNS checks: SPF/DKIM
// ---------------------------------------------------------------------------

function checkDns(domain: string): Promise<DomainFinding[]> {
  return new Promise((resolve) => {
    const findings: DomainFinding[] = [];
    const resolver = new Resolver();
    resolver.setServers(["8.8.8.8", "1.1.1.1"]);
    const timeout = setTimeout(() => resolve(findings), 5000);

    let pending = 2;
    const done = () => {
      if (--pending <= 0) {
        clearTimeout(timeout);
        resolve(findings);
      }
    };

    // SPF check
    resolver.resolveTxt(domain, (err, records) => {
      if (!err && records) {
        const flat = records.map(r => r.join("")).join(" ");
        if (!flat.includes("v=spf1")) {
          findings.push({
            check_type: "dns_spf",
            severity: "low",
            summary: `No SPF record found for ${domain}. Email spoofing is possible.`,
            impact_score: 30,
          });
        }
      }
      done();
    });

    // DKIM check (common selectors)
    resolver.resolveTxt(`default._domainkey.${domain}`, (err) => {
      if (err) {
        // Try google selector
        resolver.resolveTxt(`google._domainkey.${domain}`, (err2) => {
          if (err2) {
            findings.push({
              check_type: "dns_dkim",
              severity: "low",
              summary: `No DKIM record found for ${domain}. Email authenticity cannot be verified.`,
              impact_score: 30,
            });
          }
          done();
        });
      } else {
        done();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Main crawler
// ---------------------------------------------------------------------------

export async function crawlInfraScan(source: ProspectSource): Promise<ProspectLead[]> {
  const config: InfraConfig = source.config_json
    ? JSON.parse(source.config_json)
    : { targets: "from_leads", checks: ["tls_version", "cert_expiry", "server_headers", "hsts", "response_time", "dns_records"] };

  const leads: ProspectLead[] = [];

  // Get domain-like entities from D1
  const domains = await getDomainEntities();
  console.log(`[infra-scan] ${domains.length} domains to scan`);

  for (const domain of domains) {
    console.log(`[infra-scan] Scanning ${domain}...`);

    const allFindings: DomainFinding[] = [];

    try {
      // Run checks in parallel per domain
      const [tlsFindings, headerFindings, dnsFindings] = await Promise.all([
        config.checks.some(c => c === "tls_version" || c === "cert_expiry") ? checkTls(domain) : Promise.resolve([]),
        config.checks.some(c => c === "server_headers" || c === "hsts" || c === "response_time") ? checkHeaders(domain) : Promise.resolve([]),
        config.checks.some(c => c === "dns_records") ? checkDns(domain) : Promise.resolve([]),
      ]);

      allFindings.push(...tlsFindings, ...headerFindings, ...dnsFindings);
    } catch (err) {
      console.warn(`[infra-scan] Error scanning ${domain}:`, err);
    }

    // Convert each finding to a lead
    for (const finding of allFindings) {
      const services = determineServicesForFinding(finding.check_type);

      leads.push({
        lead_id: randomUUID(),
        source_id: "infra-scan",
        entity_type: "system",
        entity_name: domain,
        entity_domain: domain,
        vulnerability_id: `INFRA-${domain}-${finding.check_type}`,
        severity: finding.severity,
        cvss_score: null,
        summary: finding.summary,
        raw_data_json: JSON.stringify({ domain, check_type: finding.check_type, timestamp: new Date().toISOString() }),
        services_json: JSON.stringify(services),
        signal_type: "performance",
        impact_score: finding.impact_score,
      });
    }

    // Be polite: 500ms between domains
    await sleep(500);
  }

  console.log(`[infra-scan] Found ${leads.length} leads total`);
  return leads;
}

export async function crawlInfraScanTargeted(target: ProspectTarget, _source: ProspectSource): Promise<ProspectLead[]> {
  const leads: ProspectLead[] = [];
  const domains: string[] = target.domains ? JSON.parse(target.domains) : [];

  if (domains.length === 0) {
    console.log(`[infra-scan-targeted] No domains for ${target.name}, skipping`);
    return leads;
  }

  console.log(`[infra-scan-targeted] Scanning ${domains.length} domains for ${target.name}`);

  for (const domain of domains.slice(0, 10)) {
    console.log(`[infra-scan-targeted] Scanning ${domain}...`);

    const allFindings: DomainFinding[] = [];

    try {
      const [tlsFindings, headerFindings, dnsFindings] = await Promise.all([
        checkTls(domain),
        checkHeaders(domain),
        checkDns(domain),
      ]);

      allFindings.push(...tlsFindings, ...headerFindings, ...dnsFindings);
    } catch (err) {
      console.warn(`[infra-scan-targeted] Error scanning ${domain}:`, err);
    }

    for (const finding of allFindings) {
      const services = determineServicesForFinding(finding.check_type);

      leads.push({
        lead_id: randomUUID(),
        source_id: "infra-scan",
        entity_type: "system",
        entity_name: domain,
        entity_domain: domain,
        vulnerability_id: `INFRA-${domain}-${finding.check_type}`,
        severity: finding.severity,
        cvss_score: null,
        summary: finding.summary,
        raw_data_json: JSON.stringify({ domain, check_type: finding.check_type, timestamp: new Date().toISOString() }),
        services_json: JSON.stringify(services),
        signal_type: "performance",
        impact_score: finding.impact_score,
        target_id: target.target_id,
      });
    }

    await sleep(500);
  }

  console.log(`[infra-scan-targeted] Found ${leads.length} leads for ${target.name}`);
  return leads;
}

function determineServicesForFinding(checkType: string): string[] {
  switch (checkType) {
    case "tls_version":
    case "cert_expiry":
      return ["secure", "network"];
    case "response_time":
      return ["network", "risk"];
    case "hsts":
    case "server_headers":
      return ["secure"];
    case "dns_spf":
    case "dns_dkim":
      return ["secure", "network"];
    default:
      return ["secure"];
  }
}
