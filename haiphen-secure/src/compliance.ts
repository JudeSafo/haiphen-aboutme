// compliance.ts — Compliance framework checks against scan findings

import type { ScanFinding } from "./cve-matcher";

export interface ComplianceResult {
  framework: string;
  controls_checked: number;
  controls_passed: number;
  controls_failed: number;
  compliance_pct: number;
  findings: ComplianceFinding[];
}

interface ComplianceFinding {
  control_id: string;
  control_name: string;
  status: "pass" | "fail" | "warning";
  detail: string;
}

// Simplified IEC 62443 compliance checks for industrial systems
const IEC_62443_CONTROLS = [
  { id: "IAC-1", name: "Identification and authentication", check: checkAuth },
  { id: "UC-1", name: "Use control", check: checkUseControl },
  { id: "SI-1", name: "System integrity", check: checkSystemIntegrity },
  { id: "DC-1", name: "Data confidentiality", check: checkDataConfidentiality },
  { id: "TRE-1", name: "Timely response to events", check: checkEventResponse },
  { id: "RA-1", name: "Resource availability", check: checkAvailability },
  { id: "PM-1", name: "Patch management", check: checkPatchManagement },
];

export function runComplianceCheck(
  findings: ScanFinding[],
  scanType: string
): ComplianceResult {
  if (scanType !== "compliance" && scanType !== "full") {
    return {
      framework: "IEC 62443",
      controls_checked: 0,
      controls_passed: 0,
      controls_failed: 0,
      compliance_pct: 0,
      findings: [],
    };
  }

  const results: ComplianceFinding[] = [];

  for (const control of IEC_62443_CONTROLS) {
    results.push(control.check(findings));
  }

  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;

  return {
    framework: "IEC 62443",
    controls_checked: results.length,
    controls_passed: passed,
    controls_failed: failed,
    compliance_pct: Math.round((passed / results.length) * 100),
    findings: results,
  };
}

function checkAuth(findings: ScanFinding[]): ComplianceFinding {
  const authCves = findings.filter(f =>
    f.cve && (f.title.toLowerCase().includes("authentication") ||
              f.title.toLowerCase().includes("bypass") ||
              f.title.toLowerCase().includes("unauthorized"))
  );
  return {
    control_id: "IAC-1",
    control_name: "Identification and authentication",
    status: authCves.length === 0 ? "pass" : authCves.some(c => c.severity === "critical") ? "fail" : "warning",
    detail: authCves.length === 0
      ? "No authentication bypass vulnerabilities detected"
      : `${authCves.length} authentication-related vulnerabilities found: ${authCves.map(c => c.cve).join(", ")}`,
  };
}

function checkUseControl(findings: ScanFinding[]): ComplianceFinding {
  const privCves = findings.filter(f =>
    f.cve && (f.title.toLowerCase().includes("privilege") ||
              f.title.toLowerCase().includes("escalat") ||
              f.title.toLowerCase().includes("injection"))
  );
  return {
    control_id: "UC-1",
    control_name: "Use control",
    status: privCves.length === 0 ? "pass" : "fail",
    detail: privCves.length === 0
      ? "No privilege escalation vulnerabilities detected"
      : `${privCves.length} use control vulnerabilities: ${privCves.map(c => c.cve).join(", ")}`,
  };
}

function checkSystemIntegrity(findings: ScanFinding[]): ComplianceFinding {
  const integrityCves = findings.filter(f =>
    f.cve && (f.title.toLowerCase().includes("buffer overflow") ||
              f.title.toLowerCase().includes("code execution") ||
              f.title.toLowerCase().includes("remote code"))
  );
  return {
    control_id: "SI-1",
    control_name: "System integrity",
    status: integrityCves.length === 0 ? "pass" : "fail",
    detail: integrityCves.length === 0
      ? "No code execution vulnerabilities detected"
      : `${integrityCves.length} system integrity risks: ${integrityCves.map(c => c.cve).join(", ")}`,
  };
}

function checkDataConfidentiality(findings: ScanFinding[]): ComplianceFinding {
  const disclosureCves = findings.filter(f =>
    f.cve && (f.title.toLowerCase().includes("disclosure") ||
              f.title.toLowerCase().includes("information leak") ||
              f.title.toLowerCase().includes("ssrf") ||
              f.title.toLowerCase().includes("read sensitive"))
  );
  return {
    control_id: "DC-1",
    control_name: "Data confidentiality",
    status: disclosureCves.length === 0 ? "pass" : "warning",
    detail: disclosureCves.length === 0
      ? "No data confidentiality issues detected"
      : `${disclosureCves.length} data confidentiality risks detected`,
  };
}

function checkEventResponse(findings: ScanFinding[]): ComplianceFinding {
  const critCount = findings.filter(f => f.severity === "critical").length;
  return {
    control_id: "TRE-1",
    control_name: "Timely response to events",
    status: critCount === 0 ? "pass" : critCount <= 2 ? "warning" : "fail",
    detail: critCount === 0
      ? "No unpatched critical vulnerabilities requiring immediate response"
      : `${critCount} critical vulnerabilities require immediate incident response`,
  };
}

function checkAvailability(findings: ScanFinding[]): ComplianceFinding {
  const dosCves = findings.filter(f =>
    f.cve && (f.title.toLowerCase().includes("denial of service") ||
              f.title.toLowerCase().includes("crash") ||
              f.title.toLowerCase().includes("restart") ||
              f.title.toLowerCase().includes("stop state"))
  );
  return {
    control_id: "RA-1",
    control_name: "Resource availability",
    status: dosCves.length === 0 ? "pass" : "warning",
    detail: dosCves.length === 0
      ? "No availability-impacting vulnerabilities detected"
      : `${dosCves.length} vulnerabilities could impact system availability`,
  };
}

function checkPatchManagement(findings: ScanFinding[]): ComplianceFinding {
  const total = findings.filter(f => f.cve && f.remediation).length;
  const patchable = findings.filter(f => f.cve && f.remediation && f.severity !== "info").length;
  return {
    control_id: "PM-1",
    control_name: "Patch management",
    status: patchable === 0 ? "pass" : patchable <= 3 ? "warning" : "fail",
    detail: patchable === 0
      ? "All known vulnerabilities have been addressed"
      : `${patchable} of ${total} vulnerabilities have available patches that should be applied`,
  };
}
