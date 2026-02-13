// report.ts — LaTeX report renderer for prospect target investigations
//
// Generates a 3+1 page, 2-column LaTeX document (pages 1-3) plus a
// 1-column branding page (page 4) aggregating all leads and
// investigations for a given target company.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportTarget {
  target_id: string;
  name: string;
  ticker: string | null;
  industry: string | null;
  sector: string | null;
  domains: string | null; // JSON array
}

export interface ReportLead {
  lead_id: string;
  signal_type: string | null;
  severity: string | null;
  cvss_score: number | null;
  impact_score: number | null;
  vulnerability_id: string | null;
  entity_name: string;
  summary: string;
  source_id: string;
}

export interface ReportStepDetail {
  service: string;
  score: number | null;
  findings: string[];         // parsed from findings_json
  recommendation: string | null;
  duration_ms: number;
}

export interface ReportInvestigation {
  investigation_id: string;
  lead_id: string;
  aggregate_score: number;
  status: string;
  claude_summary: string | null; // JSON string {summary, impact, recommendations, threats?, impacts?}
  step_scores: string | null;    // JSON string Record<service, score>
  steps: ReportStepDetail[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREACH_COST_FINANCIAL = 6_080_000;  // IBM Cost of Data Breach 2025 — Financial sector
const MITIGATION_EFFECTIVENESS = 0.62;     // Industry average risk reduction

const HAIPHEN_BASE = "https://haiphen.io";

const SERVICE_META: Record<string, { label: string; color: string; desc: string }> = {
  secure: { label: "Secure", color: "haiphenRed", desc: "CVE matching \\& vulnerability assessment" },
  network: { label: "Network", color: "haiphenBlue", desc: "Protocol analysis \\& traffic inspection" },
  graph: { label: "Graph", color: "haiphenPurple", desc: "Entity intelligence \\& relationship mapping" },
  risk: { label: "Risk", color: "haiphenAmber", desc: "Monte Carlo risk simulation \\& VaR" },
  causal: { label: "Causal", color: "haiphenTeal", desc: "DAG builder \\& root-cause inference" },
  supply: { label: "Supply", color: "haiphenBlue", desc: "Counterparty risk scoring" },
};

const SERVICE_ORDER = ["secure", "network", "causal", "risk", "graph", "supply"];

const THREAT_EXPLANATIONS: Record<string, string> = {
  credential_compromise: "Credential compromise vectors indicate potential unauthorized access pathways through authentication or session management weaknesses. In financial infrastructure, compromised credentials can enable unauthorized trading, fund transfers, or access to material non-public information. Organizations should prioritize credential rotation, multi-factor authentication enforcement, and session token lifetime audits.",
  data_corruption: "Data corruption signals suggest risks to the integrity of market data feeds, pricing information, or transactional records. Corrupted or manipulated data in financial systems can lead to erroneous trades, mispriced assets, and cascading valuation errors across portfolios and counterparty positions.",
  protocol_exposure: "Protocol exposure findings reveal attack surfaces at the network communication layer, including insecure API endpoints, legacy protocol usage, or insufficient transport security. Exposed financial protocols such as FIX, proprietary WebSocket feeds, or OT/SCADA interfaces can be exploited for interception or injection attacks.",
  execution_disruption: "Execution disruption risks arise from latency anomalies, queue stalls, or matching engine vulnerabilities that could delay or prevent order execution. In high-frequency and algorithmic trading environments, even millisecond-level disruptions can result in significant financial losses and regulatory scrutiny.",
  settlement_failure: "Settlement failure vectors indicate potential breakdowns in the post-trade lifecycle including clearing, reconciliation, and position management. Failed settlements trigger counterparty risk cascades, regulatory penalties, and can erode market confidence in the institution.",
  supply_dependency: "Supply chain dependency risks arise from reliance on third-party vendors, single-source providers, or concentrated SaaS platforms for critical infrastructure components. Disruption to these dependencies can cascade through operational systems and affect service continuity.",
  cascade_propagation: "Cascade propagation signals indicate that failures in one system component could propagate to multiple downstream systems. In interconnected financial infrastructure, a single point of failure can trigger systemic disruptions affecting trading, settlement, and client-facing operations simultaneously.",
  regulatory_gap: "Regulatory gap signals suggest filing or compliance obligations that may be unmet or delayed. For public financial institutions, gaps in SEC filings (8-K, 10-K) can trigger enforcement actions, fines, and reputational damage. Proactive compliance monitoring is essential to maintain regulatory standing.",
  technology_obsolescence: "Technology obsolescence findings indicate the use of deprecated software versions, expiring certificates, or end-of-life dependencies. Outdated technology components accumulate unpatched vulnerabilities and reduce the effectiveness of security controls, creating expanding attack surfaces over time.",
  operational_fragility: "Operational fragility signals point to infrastructure patterns that lack redundancy, health monitoring, or automated failover capabilities. Single points of failure, inadequate disaster recovery, and insufficient chaos engineering practices increase the probability and severity of operational disruptions.",
};

const SERVICE_EXPLANATIONS: Record<string, string> = {
  secure: "elevated vulnerability exposure requiring immediate patching attention",
  network: "protocol-level risks that may expose internal systems to external actors",
  graph: "complex entity relationships suggesting broad blast radius potential",
  risk: "elevated probabilistic risk metrics across Monte Carlo simulations",
  causal: "identifiable causal chains that could propagate failures across systems",
  supply: "counterparty or vendor concentration risks in the supply chain",
};

// Pipeline weights by signal type (same as haiphen-api PIPELINE_WEIGHTS)
const PIPELINE_WEIGHTS: Record<string, Record<string, number>> = {
  vulnerability: { secure: 0.25, network: 0.20, graph: 0.15, risk: 0.15, causal: 0.10, supply: 0.15 },
  regulatory:    { secure: 0.10, network: 0.05, graph: 0.15, risk: 0.30, causal: 0.25, supply: 0.15 },
  performance:   { secure: 0.10, network: 0.30, graph: 0.10, risk: 0.20, causal: 0.20, supply: 0.10 },
  incident:      { secure: 0.15, network: 0.15, graph: 0.15, risk: 0.15, causal: 0.30, supply: 0.10 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[&%$#_{}]/g, (m) => "\\" + m)
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/</g, "\\textless{}")
    .replace(/>/g, "\\textgreater{}")
    .replace(/\|/g, "\\textbar{}");
}

function severityColor(severity: string | null): string {
  switch (severity) {
    case "critical": return "haiphenRed";
    case "high": return "haiphenAmber";
    case "medium": return "haiphenBlue";
    case "low": return "haiphenTeal";
    default: return "black";
  }
}

function scoreBand(score: number): string {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function formatDollars(n: number): string {
  if (n >= 1_000_000) return `\\$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `\\$${(n / 1_000).toFixed(0)}K`;
  return `\\$${Math.round(n)}`;
}

function safeParseDomains(domains: string | null): string[] {
  if (!domains) return [];
  try { return JSON.parse(domains); } catch { return []; }
}

function aggregateSignals(leads: ReportLead[]): Record<string, { total: number; scoreSum: number }> {
  const dist: Record<string, { total: number; scoreSum: number }> = {};
  for (const lead of leads) {
    const type = lead.signal_type || "vulnerability";
    if (!dist[type]) dist[type] = { total: 0, scoreSum: 0 };
    dist[type].total++;
    dist[type].scoreSum += lead.cvss_score ?? lead.impact_score ?? 0;
  }
  return dist;
}

function aggregateSeverity(leads: ReportLead[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const lead of leads) {
    const sev = lead.severity || "unknown";
    dist[sev] = (dist[sev] || 0) + 1;
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderPreamble(lines: string[]): void {
  lines.push(`\\documentclass[10pt,twocolumn]{article}`);
  lines.push(`\\usepackage[margin=0.75in,top=1in,bottom=0.8in]{geometry}`);
  lines.push(`\\usepackage{tikz}`);
  lines.push(`\\usetikzlibrary{positioning}`);
  lines.push(`\\usepackage{pgfplots}`);
  lines.push(`\\pgfplotsset{compat=1.18}`);
  lines.push(`\\usepackage{booktabs}`);
  lines.push(`\\usepackage{hyperref}`);
  lines.push(`\\usepackage{fancyhdr}`);
  lines.push(`\\usepackage{xcolor}`);
  lines.push(`\\usepackage{lastpage}`);
  lines.push(`\\usepackage{enumitem}`);
  lines.push(`\\usepackage{tabularx}`);
  lines.push(`\\usepackage{graphicx}`);
  lines.push(`\\usepackage{amsmath}`);
  lines.push(``);

  // Colors
  lines.push(`\\definecolor{haiphenBlue}{HTML}{5A9BD4}`);
  lines.push(`\\definecolor{haiphenTeal}{HTML}{10B981}`);
  lines.push(`\\definecolor{haiphenPurple}{HTML}{8B5CF6}`);
  lines.push(`\\definecolor{haiphenAmber}{HTML}{F59E0B}`);
  lines.push(`\\definecolor{haiphenRed}{HTML}{EF4444}`);
  lines.push(`\\definecolor{haiphenBg}{HTML}{F8FAFC}`);
  lines.push(`\\definecolor{haiphenGray}{HTML}{64748B}`);
  lines.push(``);

  // Header/Footer
  lines.push(`\\pagestyle{fancy}`);
  lines.push(`\\fancyhf{}`);
  lines.push(`\\fancyhead[L]{\\small\\textcolor{haiphenBlue}{\\textbf{Haiphen Intelligence Platform}}}`);
  lines.push(`\\fancyhead[R]{\\small\\textcolor{gray}{Confidential}}`);
  lines.push(`\\fancyfoot[C]{\\small Page \\thepage\\ of \\pageref{LastPage}}`);
  lines.push(`\\renewcommand{\\headrulewidth}{0.4pt}`);
  lines.push(`\\renewcommand{\\footrulewidth}{0pt}`);
  lines.push(``);

  // Hyperref
  lines.push(`\\hypersetup{colorlinks=true,linkcolor=haiphenBlue,urlcolor=haiphenBlue}`);
  lines.push(``);
}

function renderTitleAndAbstract(
  lines: string[],
  target: ReportTarget,
  leads: ReportLead[],
  investigations: ReportInvestigation[],
  signalDist: Record<string, { total: number; scoreSum: number }>,
  today: string,
): void {
  // Title block (full-width)
  lines.push(`\\twocolumn[{%`);
  lines.push(`\\begin{center}`);
  lines.push(`{\\LARGE\\textbf{Infrastructure Risk Advisory}}\\\\[4pt]`);
  lines.push(`{\\Large\\textcolor{haiphenBlue}{${escapeLatex(target.name)}${target.ticker ? ` (${escapeLatex(target.ticker)})` : ""}}}\\\\[6pt]`);
  lines.push(`{\\small Haiphen Intelligence Platform \\quad|\\quad ${today}}\\\\[2pt]`);
  lines.push(`{\\small\\textcolor{gray}{${leads.length} signals analyzed across ${investigations.length} investigation${investigations.length !== 1 ? "s" : ""}}}\\\\[8pt]`);
  lines.push(`\\end{center}`);
  lines.push(``);

  // Full-width abstract
  const signalTypes = Object.keys(signalDist);
  const signalTypesList = signalTypes.map(s => escapeLatex(s)).join(", ");
  lines.push(`\\noindent\\fcolorbox{haiphenBlue}{haiphenBg}{\\parbox{\\dimexpr\\textwidth-2\\fboxsep-2\\fboxrule}{%`);
  lines.push(`\\small\\textbf{Abstract.} This advisory presents findings from an automated infrastructure `);
  lines.push(`risk assessment of ${escapeLatex(target.name)}, conducted by the Haiphen Intelligence `);
  lines.push(`Platform on ${today}. The assessment analyzed ${leads.length} signals across `);
  lines.push(`${investigations.length} investigation pipeline${investigations.length !== 1 ? "s" : ""} `);
  lines.push(`spanning ${signalTypesList}. `);
  lines.push(`This investigation is performed as part of Haiphen's ongoing mission to strengthen `);
  lines.push(`financial infrastructure resilience and promote robust market operations. `);
  lines.push(`All analysis is based exclusively on publicly available data sources `);
  lines.push(`including SEC EDGAR filings, National Vulnerability Database (NVD) entries, `);
  lines.push(`and passive infrastructure telemetry. No proprietary or privileged information was accessed.`);
  lines.push(`}}\\\\[10pt]`);
  lines.push(`}]`);
  lines.push(``);
}

function renderIntroduction(
  lines: string[],
  target: ReportTarget,
  leads: ReportLead[],
  investigations: ReportInvestigation[],
  signalDist: Record<string, { total: number; scoreSum: number }>,
  domains: string[],
): void {
  lines.push(`\\section{Introduction}`);

  // Methodology paragraph with formula
  const primarySignalType = Object.entries(signalDist).sort((a, b) => b[1].total - a[1].total)[0]?.[0] ?? "vulnerability";
  const weights = PIPELINE_WEIGHTS[primarySignalType] ?? PIPELINE_WEIGHTS["vulnerability"];
  const topServices = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([svc]) => SERVICE_META[svc]?.label ?? svc);

  lines.push(`The Haiphen Intelligence Platform employs a six-service analysis pipeline to assess `);
  lines.push(`infrastructure risk. Each signal is processed through independent evaluation modules, `);
  lines.push(`and the aggregate risk score $R$ is computed as:`);
  lines.push(``);
  lines.push(`\\begin{equation}`);
  lines.push(`R = \\sum_{i=1}^{6} w_i \\cdot S_i`);
  lines.push(`\\end{equation}`);
  lines.push(``);
  lines.push(`\\noindent where $w_i$ represents the signal-type-specific weight for service $i$ and $S_i$ is the `);
  lines.push(`service score (0--100). For the primary signal type \\textit{${escapeLatex(primarySignalType)}}, `);
  lines.push(`the top-weighted services are ${topServices.join(", ")}.`);
  lines.push(``);

  // Target context paragraph
  lines.push(`\\subsection{Target Profile}`);
  lines.push(`\\begin{tabularx}{\\columnwidth}{lX}`);
  lines.push(`\\textbf{Company} & ${escapeLatex(target.name)} \\\\`);
  if (target.ticker) lines.push(`\\textbf{Ticker} & ${escapeLatex(target.ticker)} \\\\`);
  if (target.industry) lines.push(`\\textbf{Industry} & ${escapeLatex(target.industry)} \\\\`);
  if (target.sector) lines.push(`\\textbf{Sector} & ${escapeLatex(target.sector)} \\\\`);
  if (domains.length > 0) lines.push(`\\textbf{Domains} & ${domains.slice(0, 5).map(d => `\\texttt{${escapeLatex(d)}}`).join(", ")} \\\\`);
  lines.push(`\\textbf{Leads} & ${leads.length} signals \\\\`);
  lines.push(`\\textbf{Investigations} & ${investigations.length} completed \\\\`);
  lines.push(`\\end{tabularx}`);
  lines.push(``);

  // Signal distribution sub-table
  lines.push(`\\subsection{Signal Distribution}`);
  lines.push(`\\begin{tabular}{lrr}`);
  lines.push(`\\toprule`);
  lines.push(`\\textbf{Signal Type} & \\textbf{Count} & \\textbf{Avg Score} \\\\`);
  lines.push(`\\midrule`);
  for (const [type, data] of Object.entries(signalDist)) {
    const avgS = data.total > 0 ? Math.round(data.scoreSum / data.total) : 0;
    lines.push(`${escapeLatex(type)} & ${data.total} & ${avgS} \\\\`);
  }
  lines.push(`\\bottomrule`);
  lines.push(`\\end{tabular}`);
  lines.push(``);

  // Severity breakdown sub-table
  const severityDist = aggregateSeverity(leads);
  lines.push(`\\subsection{Severity Breakdown}`);
  lines.push(`\\begin{tabular}{lr}`);
  lines.push(`\\toprule`);
  lines.push(`\\textbf{Severity} & \\textbf{Count} \\\\`);
  lines.push(`\\midrule`);
  for (const [sev, count] of Object.entries(severityDist)) {
    lines.push(`\\textcolor{${severityColor(sev)}}{${escapeLatex(sev)}} & ${count} \\\\`);
  }
  lines.push(`\\bottomrule`);
  lines.push(`\\end{tabular}`);
  lines.push(``);
}

function renderSignalInventory(lines: string[], leads: ReportLead[]): void {
  lines.push(`\\section{Signal Inventory}`);
  lines.push(`Table~\\ref{tab:signals} summarizes the top signals detected during the assessment.`);
  lines.push(``);

  const topLeads = leads.slice(0, 10);
  lines.push(`\\begin{table}[h]`);
  lines.push(`\\centering`);
  lines.push(`\\caption{Top signals by severity}\\label{tab:signals}`);
  lines.push(`\\scriptsize`);
  lines.push(`\\begin{tabular}{llllp{1.8cm}}`);
  lines.push(`\\toprule`);
  lines.push(`\\textbf{Signal ID} & \\textbf{Type} & \\textbf{Sev.} & \\textbf{Source} & \\textbf{Entity} \\\\`);
  lines.push(`\\midrule`);
  for (const lead of topLeads) {
    const sigId = lead.vulnerability_id
      ? escapeLatex(lead.vulnerability_id.length > 16 ? lead.vulnerability_id.slice(0, 13) + "..." : lead.vulnerability_id)
      : "---";
    const sigType = escapeLatex((lead.signal_type || "vuln").slice(0, 8));
    const sev = lead.severity || "---";
    const entity = escapeLatex(lead.entity_name.length > 18 ? lead.entity_name.slice(0, 15) + "..." : lead.entity_name);
    const src = escapeLatex(lead.source_id.slice(0, 8));
    lines.push(`${sigId} & ${sigType} & \\textcolor{${severityColor(lead.severity)}}{${sev}} & ${src} & ${entity} \\\\`);
  }
  lines.push(`\\bottomrule`);
  lines.push(`\\end{tabular}`);
  lines.push(`\\end{table}`);
  lines.push(``);
}

function renderThreatClassification(
  lines: string[],
  allThreats: Array<{ primitive: string; confidence: string; evidence: string[] }>,
): void {
  lines.push(`\\section{Threat Classification}`);
  if (allThreats.length === 0) {
    lines.push(`No threat vectors classified at current evidence level.`);
    lines.push(``);
    return;
  }

  lines.push(`The following ${allThreats.length} threat vector${allThreats.length !== 1 ? "s were" : " was"} identified through automated pattern matching across all investigation pipelines.`);
  lines.push(``);

  for (const threat of allThreats) {
    const label = threat.primitive.replace(/_/g, " ");
    const confColor = threat.confidence === "high" ? "haiphenRed" : threat.confidence === "medium" ? "haiphenAmber" : "haiphenTeal";

    lines.push(`\\paragraph{${escapeLatex(label)}} \\textcolor{${confColor}}{\\textbf{[${threat.confidence} confidence]}}`);
    lines.push(``);

    // Static explanation paragraph
    const explanation = THREAT_EXPLANATIONS[threat.primitive];
    if (explanation) {
      lines.push(`${escapeLatex(explanation)}`);
      lines.push(``);
    }

    // Evidence bullets
    if (threat.evidence.length > 0) {
      lines.push(`\\textit{Evidence:}`);
      lines.push(`\\begin{itemize}[nosep,leftmargin=*]`);
      for (const ev of threat.evidence.slice(0, 3)) {
        lines.push(`\\item \\small ${escapeLatex(ev.slice(0, 120))}`);
      }
      lines.push(`\\end{itemize}`);
      lines.push(``);
    }
  }
}

function renderServiceAnalysis(
  lines: string[],
  avgServiceScores: Record<string, number>,
): void {
  lines.push(`\\section{Service Analysis}`);

  const svcEntries = SERVICE_ORDER
    .filter(svc => svc in avgServiceScores)
    .map(svc => [svc, avgServiceScores[svc]] as const);

  if (svcEntries.length === 0) {
    lines.push(`No service scores available at current evidence level.`);
    lines.push(``);
    return;
  }

  // Find highest-scoring service
  const [highSvc, highScore] = svcEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const highMeta = SERVICE_META[highSvc];
  const highExplanation = SERVICE_EXPLANATIONS[highSvc] || "elevated risk indicators";

  lines.push(`The highest-scoring service was \\textbf{${highMeta?.label ?? highSvc}} `);
  lines.push(`(score: ${highScore}/100), indicating ${escapeLatex(highExplanation)}.`);
  lines.push(``);

  // TikZ pipeline figure
  lines.push(`\\begin{center}`);
  lines.push(`\\begin{tikzpicture}[`);
  lines.push(`  node distance=0.3cm,`);
  lines.push(`  svcbox/.style={draw,rounded corners=2pt,minimum width=1.1cm,minimum height=0.7cm,font=\\tiny\\bfseries,align=center},`);
  lines.push(`]`);
  for (let i = 0; i < SERVICE_ORDER.length; i++) {
    const svc = SERVICE_ORDER[i];
    const meta = SERVICE_META[svc];
    const score = avgServiceScores[svc];
    const color = meta?.color ?? "black";
    const scoreLabel = score !== undefined ? `${Math.round(score)}` : "---";
    if (i === 0) {
      lines.push(`  \\node[svcbox,fill=${color}!15] (s${i}) {${meta?.label ?? svc}\\\\${scoreLabel}};`);
    } else {
      lines.push(`  \\node[svcbox,fill=${color}!15,right=of s${i - 1}] (s${i}) {${meta?.label ?? svc}\\\\${scoreLabel}};`);
    }
  }
  for (let i = 0; i < SERVICE_ORDER.length - 1; i++) {
    lines.push(`  \\draw[->,thick,haiphenBlue] (s${i}) -- (s${i + 1});`);
  }
  lines.push(`\\end{tikzpicture}`);
  lines.push(`\\end{center}`);
  lines.push(``);

  // Service scores table
  lines.push(`\\begin{tabularx}{\\columnwidth}{lrX}`);
  lines.push(`\\toprule`);
  lines.push(`\\textbf{Service} & \\textbf{Score} & \\textbf{Capability} \\\\`);
  lines.push(`\\midrule`);
  for (const [svc, score] of svcEntries) {
    const meta = SERVICE_META[svc];
    if (meta) {
      lines.push(`\\href{${HAIPHEN_BASE}/\\#mission:svc-${svc}}{\\textcolor{${meta.color}}{\\textbf{${meta.label}}}} & ${Math.round(score)} & ${meta.desc} \\\\`);
    } else {
      lines.push(`\\textbf{${escapeLatex(svc)}} & ${Math.round(score)} & --- \\\\`);
    }
  }
  lines.push(`\\bottomrule`);
  lines.push(`\\end{tabularx}`);
  lines.push(``);

  // TikZ bar chart
  lines.push(`\\begin{tikzpicture}`);
  lines.push(`\\begin{axis}[`);
  lines.push(`  xbar,`);
  lines.push(`  width=\\columnwidth,`);
  lines.push(`  height=3.2cm,`);
  lines.push(`  bar width=6pt,`);
  lines.push(`  xmin=0,xmax=100,`);
  lines.push(`  xlabel={Score},`);
  lines.push(`  symbolic y coords={${svcEntries.map(([s]) => escapeLatex(s)).join(",")}},`);
  lines.push(`  ytick=data,`);
  lines.push(`  nodes near coords,`);
  lines.push(`  nodes near coords align={horizontal},`);
  lines.push(`  every node near coord/.append style={font=\\scriptsize},`);
  lines.push(`]`);
  lines.push(`\\addplot[fill=haiphenBlue] coordinates {`);
  for (const [svc, score] of svcEntries) {
    lines.push(`  (${Math.round(score)},${escapeLatex(svc)})`);
  }
  lines.push(`};`);
  lines.push(`\\end{axis}`);
  lines.push(`\\end{tikzpicture}`);
  lines.push(``);
}

function renderImpactAssessment(
  lines: string[],
  allImpacts: Array<{ primitive: string; score: number; label: string }>,
  avgScore: number,
  target: ReportTarget,
): void {
  lines.push(`\\section{Impact Assessment}`);
  allImpacts.sort((a, b) => b.score - a.score);
  if (allImpacts.length === 0) {
    lines.push(`No impact scores computed at current threat level.`);
    lines.push(``);
  } else {
    lines.push(`\\begin{tabular}{llr}`);
    lines.push(`\\toprule`);
    lines.push(`\\textbf{Impact} & \\textbf{Rating} & \\textbf{Score} \\\\`);
    lines.push(`\\midrule`);
    for (const imp of allImpacts.slice(0, 5)) {
      lines.push(`${escapeLatex(imp.label)} & ${scoreBand(imp.score)} & ${imp.score.toFixed(1)} \\\\`);
    }
    lines.push(`\\bottomrule`);
    lines.push(`\\end{tabular}`);
    lines.push(``);
  }

  // Financial quantification
  const lowEst = BREACH_COST_FINANCIAL * (avgScore / 100) * 0.3;
  const highEst = BREACH_COST_FINANCIAL * (avgScore / 100) * 1.2;

  lines.push(`\\subsection{Financial Quantification}`);
  lines.push(`Using the IBM Cost of a Data Breach 2025 benchmark for the financial sector `);
  lines.push(`(${formatDollars(BREACH_COST_FINANCIAL)} average), and applying the aggregate risk score `);
  lines.push(`of ${avgScore.toFixed(1)}/100 as a probability-weighted multiplier, the estimated `);
  lines.push(`annualized breach exposure for ${escapeLatex(target.name)} is:`);
  lines.push(``);
  lines.push(`\\begin{center}`);
  lines.push(`\\fcolorbox{haiphenAmber}{haiphenBg}{\\parbox{0.85\\columnwidth}{%`);
  lines.push(`\\centering\\small`);
  lines.push(`\\textbf{Estimated Annual Exposure:} ${formatDollars(lowEst)} -- ${formatDollars(highEst)}`);
  lines.push(`}}`);
  lines.push(`\\end{center}`);
  lines.push(``);
  lines.push(`This estimate reflects the range between conservative (0.3x) and adverse (1.2x) `);
  lines.push(`scenario multipliers applied to the sector benchmark.`);
  lines.push(``);
}

function renderRemediation(
  lines: string[],
  allRecommendations: string[],
  target: ReportTarget,
  signalDist: Record<string, { total: number; scoreSum: number }>,
): void {
  lines.push(`\\section{Remediation Roadmap}`);
  if (allRecommendations.length === 0) {
    lines.push(`No specific recommendations at current evidence level.`);
  } else {
    lines.push(`\\begin{enumerate}[nosep,leftmargin=*]`);
    for (const rec of allRecommendations.slice(0, 8)) {
      lines.push(`\\item ${escapeLatex(rec)}`);
    }
    lines.push(`\\end{enumerate}`);
  }
  lines.push(``);

  // CLI command references
  lines.push(`\\subsection{Monitoring Commands}`);
  lines.push(`The following Haiphen CLI commands enable ongoing monitoring:`);
  lines.push(`\\begin{itemize}[nosep,leftmargin=*]`);
  lines.push(`\\item \\texttt{haiphen prospect pipeline --target "${escapeLatex(target.name)}"}`);
  for (const sigType of Object.keys(signalDist)) {
    lines.push(`\\item \\texttt{haiphen prospect list --signal-type ${escapeLatex(sigType)}}`);
  }
  lines.push(`\\item \\texttt{haiphen prospect report "${escapeLatex(target.name)}" --compile}`);
  lines.push(`\\end{itemize}`);
  lines.push(``);
}

function renderConclusion(
  lines: string[],
  target: ReportTarget,
  allThreats: Array<{ primitive: string; confidence: string; evidence: string[] }>,
  avgScore: number,
  leads: ReportLead[],
  lowEst: number,
  highEst: number,
): void {
  lines.push(`\\section{Conclusion}`);

  const topThreat = allThreats.length > 0
    ? escapeLatex(allThreats[0].primitive.replace(/_/g, " "))
    : "no classified threats";
  const mitigationSavings = (highEst - lowEst) * MITIGATION_EFFECTIVENESS;

  lines.push(`This assessment identified ${allThreats.length} threat vector${allThreats.length !== 1 ? "s" : ""} `);
  lines.push(`across ${leads.length} signal${leads.length !== 1 ? "s" : ""} for ${escapeLatex(target.name)}, `);
  lines.push(`yielding an aggregate risk score of ${avgScore.toFixed(1)}/100 (${scoreBand(avgScore)}). `);
  lines.push(`The primary threat classification is \\textit{${topThreat}}.`);
  lines.push(``);

  lines.push(`Based on industry benchmarks, proactive remediation of identified vulnerabilities `);
  lines.push(`can reduce annualized breach exposure by approximately ${Math.round(MITIGATION_EFFECTIVENESS * 100)}\\%, `);
  lines.push(`representing a potential savings of ${formatDollars(mitigationSavings)} annually. `);
  lines.push(`Peer institutions including JPMorgan Chase, Goldman Sachs, and Morgan Stanley have invested `);
  lines.push(`significantly in similar infrastructure resilience programs.`);
  lines.push(``);

  lines.push(`Haiphen recommends integrating this assessment into ${escapeLatex(target.name)}'s `);
  lines.push(`existing risk management framework and scheduling periodic re-assessments `);
  lines.push(`to track remediation progress and emerging threats.`);
  lines.push(``);
}

function renderReferences(lines: string[], references: string[]): void {
  if (references.length === 0) return;

  lines.push(`\\section*{References}`);
  lines.push(`\\begin{enumerate}[nosep,leftmargin=*,label={[\\arabic*]}]`);
  for (const ref of references.slice(0, 20)) {
    lines.push(`\\item \\small ${ref}`);
  }
  lines.push("\\item \\small IBM Security, ``Cost of a Data Breach Report 2025,'' IBM Corporation.");
  lines.push(`\\end{enumerate}`);
  lines.push(``);
}

function renderBrandingPage(lines: string[]): void {
  lines.push(`\\newpage`);
  lines.push(`\\onecolumn`);
  lines.push(`\\thispagestyle{empty}`);
  lines.push(`\\vspace*{\\fill}`);
  lines.push(`\\begin{center}`);
  lines.push(``);

  // Logo (will use robot_haiphen.png if available)
  lines.push(`\\IfFileExists{robot_haiphen.png}{%`);
  lines.push(`  \\includegraphics[width=3cm]{robot_haiphen}\\\\[12pt]`);
  lines.push(`}{%`);
  lines.push(`  \\rule{3cm}{3cm}\\\\[12pt]`);
  lines.push(`}`);
  lines.push(``);

  lines.push(`{\\Large\\textbf{Haiphen Intelligence Platform}}\\\\[6pt]`);
  lines.push(`{\\large\\textcolor{haiphenBlue}{Securing Financial Infrastructure at Scale}}\\\\[20pt]`);
  lines.push(``);

  // Legal disclaimer
  lines.push(`\\begin{minipage}{0.7\\textwidth}`);
  lines.push(`\\small\\color{haiphenGray}`);
  lines.push(`This report was generated by the Haiphen Intelligence Platform as part of`);
  lines.push(`a daily automated infrastructure risk assessment program. All findings are`);
  lines.push(`based exclusively on publicly available data sources including the National`);
  lines.push(`Vulnerability Database (NVD), SEC EDGAR filings, GitHub Security Advisories,`);
  lines.push(`and passive network telemetry.`);
  lines.push(``);
  lines.push(`No proprietary, confidential, or privileged information was accessed during`);
  lines.push(`this assessment. This document is provided for informational purposes only`);
  lines.push(`and does not constitute legal, financial, or professional advice.`);
  lines.push(`Recipients should independently verify all findings before taking action.`);
  lines.push(`\\end{minipage}\\\\[24pt]`);
  lines.push(``);

  // Links
  lines.push(`\\href{${HAIPHEN_BASE}/\\#mission}{\\textcolor{haiphenBlue}{Explore Our Mission \\& Services}}\\\\[6pt]`);
  lines.push(`\\href{mailto:jude@haiphen.io}{\\textcolor{haiphenBlue}{Contact: jude@haiphen.io}}\\\\[6pt]`);
  lines.push(`\\url{${HAIPHEN_BASE}}\\\\[12pt]`);
  lines.push(``);

  // Service index
  lines.push(`\\begin{minipage}{0.6\\textwidth}`);
  lines.push(`\\small`);
  lines.push(`\\textbf{Service Index}\\\\[4pt]`);
  for (const [svc, meta] of Object.entries(SERVICE_META)) {
    lines.push(`\\href{${HAIPHEN_BASE}/\\#mission:svc-${svc}}{\\textcolor{${meta.color}}{\\textbf{${meta.label}}}} --- ${meta.desc}\\\\`);
  }
  lines.push(`\\end{minipage}`);
  lines.push(``);

  lines.push(`\\end{center}`);
  lines.push(`\\vspace*{\\fill}`);
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export function renderReportLatex(
  target: ReportTarget,
  leads: ReportLead[],
  investigations: ReportInvestigation[],
): string {
  const today = new Date().toISOString().split("T")[0];
  const domains = safeParseDomains(target.domains);

  // Aggregate stats
  const signalDist = aggregateSignals(leads);
  const avgScore = investigations.length > 0
    ? Math.round(investigations.reduce((a, i) => a + i.aggregate_score, 0) / investigations.length * 100) / 100
    : 0;

  // Parse synthesis data from investigations
  const allThreats: Array<{ primitive: string; confidence: string; evidence: string[] }> = [];
  const allImpacts: Array<{ primitive: string; score: number; label: string }> = [];
  const allRecommendations: string[] = [];
  const serviceScores: Record<string, number[]> = {};
  const references: string[] = [];

  for (const inv of investigations) {
    if (inv.claude_summary) {
      try {
        const summary = JSON.parse(inv.claude_summary);
        if (summary.threats) {
          for (const t of summary.threats) {
            if (!allThreats.find(x => x.primitive === t.primitive)) {
              allThreats.push(t);
            }
          }
        }
        if (summary.impacts) {
          for (const imp of summary.impacts) {
            const existing = allImpacts.find(x => x.primitive === imp.primitive);
            if (existing) {
              existing.score = Math.max(existing.score, imp.score);
            } else {
              allImpacts.push({ ...imp });
            }
          }
        }
        if (summary.recommendations) {
          for (const r of summary.recommendations) {
            if (!allRecommendations.includes(r)) allRecommendations.push(r);
          }
        }
      } catch { /* skip */ }
    }
    if (inv.step_scores) {
      try {
        const scores = JSON.parse(inv.step_scores);
        for (const [svc, score] of Object.entries(scores)) {
          if (typeof score === "number") {
            if (!serviceScores[svc]) serviceScores[svc] = [];
            serviceScores[svc].push(score);
          }
        }
      } catch { /* skip */ }
    }
  }

  // Collect references from leads
  for (const lead of leads) {
    if (lead.vulnerability_id) {
      if (lead.vulnerability_id.startsWith("CVE-")) {
        references.push(`${lead.vulnerability_id}: ${escapeLatex(lead.summary.slice(0, 80))}`);
      } else if (lead.vulnerability_id.startsWith("SEC-")) {
        references.push(`SEC Filing ${escapeLatex(lead.vulnerability_id)}: ${escapeLatex(lead.entity_name)}`);
      } else if (lead.vulnerability_id.startsWith("GHSA-")) {
        references.push(`${lead.vulnerability_id}: ${escapeLatex(lead.summary.slice(0, 80))}`);
      }
    }
  }

  // Average service scores
  const avgServiceScores: Record<string, number> = {};
  for (const [svc, scores] of Object.entries(serviceScores)) {
    avgServiceScores[svc] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  // Financial estimates
  const lowEst = BREACH_COST_FINANCIAL * (avgScore / 100) * 0.3;
  const highEst = BREACH_COST_FINANCIAL * (avgScore / 100) * 1.2;

  // Build LaTeX
  const lines: string[] = [];

  // === Preamble ===
  renderPreamble(lines);

  // === Document start ===
  lines.push(`\\begin{document}`);
  lines.push(``);

  // === PAGE 1: Title, Abstract, Introduction, Target Profile ===
  renderTitleAndAbstract(lines, target, leads, investigations, signalDist, today);
  renderIntroduction(lines, target, leads, investigations, signalDist, domains);

  // === PAGE 2: Signal Inventory, Threat Classification, Service Analysis ===
  renderSignalInventory(lines, leads);
  renderThreatClassification(lines, allThreats);
  renderServiceAnalysis(lines, avgServiceScores);

  // === PAGE 3: Impact Assessment, Remediation, Conclusion, References ===
  renderImpactAssessment(lines, allImpacts, avgScore, target);
  renderRemediation(lines, allRecommendations, target, signalDist);
  renderConclusion(lines, target, allThreats, avgScore, leads, lowEst, highEst);
  renderReferences(lines, references);

  // === PAGE 4: Branding page ===
  renderBrandingPage(lines);

  lines.push(`\\end{document}`);

  return lines.join("\n");
}
