import { describe, it, expect } from "vitest";
import { runComplianceCheck } from "../compliance";
import type { ScanFinding } from "../cve-matcher";

describe("Compliance Check", () => {
  const baseFinding = (overrides: Partial<ScanFinding> = {}): ScanFinding => ({
    severity: "medium",
    cve: "CVE-2024-0001",
    title: "Test vulnerability",
    affected_asset: "plc.local",
    cvss_score: 5.0,
    remediation: "Apply patch",
    match_confidence: 0.8,
    ...overrides,
  });

  describe("scan type filtering", () => {
    it("should return empty results for non-compliance scan types", () => {
      const result = runComplianceCheck([baseFinding()], "vulnerability");
      expect(result.controls_checked).toBe(0);
      expect(result.findings).toHaveLength(0);
    });

    it("should check controls for 'compliance' scan type", () => {
      const result = runComplianceCheck([baseFinding()], "compliance");
      expect(result.framework).toBe("IEC 62443");
      expect(result.controls_checked).toBe(7);
    });

    it("should check controls for 'full' scan type", () => {
      const result = runComplianceCheck([baseFinding()], "full");
      expect(result.controls_checked).toBe(7);
    });
  });

  describe("IEC 62443 controls", () => {
    it("should pass all controls when no relevant CVEs found", () => {
      const findings = [baseFinding({ title: "Generic issue" })];
      const result = runComplianceCheck(findings, "compliance");
      expect(result.controls_passed).toBeGreaterThan(0);
      expect(result.compliance_pct).toBeGreaterThan(0);
    });

    it("should fail IAC-1 on critical authentication bypass", () => {
      const findings = [
        baseFinding({ title: "Authentication bypass vulnerability", severity: "critical" }),
      ];
      const result = runComplianceCheck(findings, "compliance");
      const iac = result.findings.find(f => f.control_id === "IAC-1");
      expect(iac).toBeDefined();
      expect(iac!.status).toBe("fail");
    });

    it("should warn IAC-1 on non-critical authentication issue", () => {
      const findings = [
        baseFinding({ title: "Authentication bypass vulnerability", severity: "high" }),
      ];
      const result = runComplianceCheck(findings, "compliance");
      const iac = result.findings.find(f => f.control_id === "IAC-1");
      expect(iac).toBeDefined();
      expect(iac!.status).toBe("warning");
    });

    it("should fail UC-1 on privilege escalation", () => {
      const findings = [
        baseFinding({ title: "Privilege escalation in admin module" }),
      ];
      const result = runComplianceCheck(findings, "compliance");
      const uc = result.findings.find(f => f.control_id === "UC-1");
      expect(uc).toBeDefined();
      expect(uc!.status).toBe("fail");
    });

    it("should fail SI-1 on remote code execution", () => {
      const findings = [
        baseFinding({ title: "Remote code execution in firmware" }),
      ];
      const result = runComplianceCheck(findings, "compliance");
      const si = result.findings.find(f => f.control_id === "SI-1");
      expect(si).toBeDefined();
      expect(si!.status).toBe("fail");
    });

    it("should warn DC-1 on information disclosure", () => {
      const findings = [
        baseFinding({ title: "Information disclosure via SSRF" }),
      ];
      const result = runComplianceCheck(findings, "compliance");
      const dc = result.findings.find(f => f.control_id === "DC-1");
      expect(dc).toBeDefined();
      expect(dc!.status).toBe("warning");
    });

    it("should fail TRE-1 when more than 2 critical vulns", () => {
      const findings = [
        baseFinding({ severity: "critical" }),
        baseFinding({ severity: "critical", cve: "CVE-2024-0002" }),
        baseFinding({ severity: "critical", cve: "CVE-2024-0003" }),
      ];
      const result = runComplianceCheck(findings, "compliance");
      const tre = result.findings.find(f => f.control_id === "TRE-1");
      expect(tre).toBeDefined();
      expect(tre!.status).toBe("fail");
    });

    it("should warn RA-1 on denial of service", () => {
      const findings = [
        baseFinding({ title: "Denial of service via malformed packets" }),
      ];
      const result = runComplianceCheck(findings, "compliance");
      const ra = result.findings.find(f => f.control_id === "RA-1");
      expect(ra).toBeDefined();
      expect(ra!.status).toBe("warning");
    });

    it("should compute compliance percentage correctly", () => {
      // No relevant findings = all pass
      const result = runComplianceCheck([], "compliance");
      expect(result.controls_passed).toBe(7);
      expect(result.compliance_pct).toBe(100);
    });
  });
});
