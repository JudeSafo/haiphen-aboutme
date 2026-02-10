// ---------------------------------------------------------------------------
// GitHub Advisory Database crawler (GraphQL API)
// Rate: 5000/hr with token
// ---------------------------------------------------------------------------

import { ProspectLead, ProspectSource } from "../d1-writer";
import { randomUUID, sleep } from "../util";

interface GhAdvisoryConfig {
  min_severity: string;
  ecosystems: string[];
}

interface GhAdvisoryNode {
  ghsaId: string;
  summary: string;
  description: string;
  severity: string;
  cvss: { score: number } | null;
  identifiers: Array<{ type: string; value: string }>;
  vulnerabilities: {
    nodes: Array<{
      package: { ecosystem: string; name: string } | null;
      vulnerableVersionRange: string | null;
    }>;
  };
  updatedAt: string;
}

interface GhGraphQLResponse {
  data?: {
    securityAdvisories: {
      nodes: GhAdvisoryNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
}

const QUERY = `
query($first: Int!, $after: String, $updatedSince: DateTime) {
  securityAdvisories(
    first: $first
    after: $after
    orderBy: { field: UPDATED_AT, direction: DESC }
    updatedSince: $updatedSince
  ) {
    nodes {
      ghsaId
      summary
      description
      severity
      cvss { score }
      identifiers { type value }
      vulnerabilities(first: 10) {
        nodes {
          package { ecosystem name }
          vulnerableVersionRange
        }
      }
      updatedAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

function severityFromGh(severity: string): ProspectLead["severity"] {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MODERATE":
      return "medium";
    case "LOW":
      return "low";
    default:
      return "info";
  }
}

function matchesSeverity(severity: string, min: string): boolean {
  const levels: Record<string, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MODERATE: 2,
    LOW: 1,
  };
  return (levels[severity.toUpperCase()] ?? 0) >= (levels[min.toUpperCase()] ?? 0);
}

export async function crawlGitHubAdvisory(source: ProspectSource): Promise<ProspectLead[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("[github-advisory] GITHUB_TOKEN not set, skipping");
    return [];
  }

  const config: GhAdvisoryConfig = source.config_json
    ? JSON.parse(source.config_json)
    : { min_severity: "HIGH", ecosystems: ["npm", "pip", "go"] };

  const leads: ProspectLead[] = [];
  const ecosystemSet = new Set(config.ecosystems.map((e) => e.toLowerCase()));

  // Use last_cursor as the updatedSince timestamp, or default to 7 days ago
  const updatedSince = source.last_cursor
    ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let after: string | null = null;
  let pages = 0;
  const maxPages = 4; // Cap at 200 advisories

  while (pages < maxPages) {
    console.log(`[github-advisory] Fetching page ${pages + 1}`);

    const variables: Record<string, unknown> = {
      first: 50,
      after,
      updatedSince,
    };

    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "haiphen-prospect-crawler/1.0",
      },
      body: JSON.stringify({ query: QUERY, variables }),
    });

    if (!res.ok) {
      console.error(`[github-advisory] API error (${res.status}): ${await res.text()}`);
      break;
    }

    const data = (await res.json()) as GhGraphQLResponse;

    if (data.errors?.length) {
      console.error("[github-advisory] GraphQL errors:", data.errors);
      break;
    }

    const advisories = data.data?.securityAdvisories;
    if (!advisories) break;

    for (const adv of advisories.nodes) {
      if (!matchesSeverity(adv.severity, config.min_severity)) continue;

      // Filter by ecosystem
      const relevantPkgs = adv.vulnerabilities.nodes.filter(
        (v) => v.package && ecosystemSet.has(v.package.ecosystem.toLowerCase()),
      );

      if (relevantPkgs.length === 0) continue;

      const packageNames = relevantPkgs
        .map((v) => v.package?.name)
        .filter(Boolean)
        .join(", ");

      const cveId = adv.identifiers.find((i) => i.type === "CVE")?.value;

      leads.push({
        lead_id: randomUUID(),
        source_id: "github-advisory",
        entity_type: "software",
        entity_name: packageNames || adv.ghsaId,
        vulnerability_id: cveId ?? adv.ghsaId,
        severity: severityFromGh(adv.severity),
        cvss_score: adv.cvss?.score ?? null,
        summary: (adv.summary || adv.description).slice(0, 500),
        raw_data_json: JSON.stringify(adv),
        services_json: JSON.stringify(["secure", "supply"]),
      });
    }

    if (!advisories.pageInfo.hasNextPage) break;
    after = advisories.pageInfo.endCursor;
    pages++;

    await sleep(1000);
  }

  console.log(`[github-advisory] Found ${leads.length} leads`);
  return leads;
}
