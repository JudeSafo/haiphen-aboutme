package report

import (
	"strings"
	"testing"
)

func TestEscapeLatex(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"hello", "hello"},
		{"foo & bar", `foo \& bar`},
		{"100%", `100\%`},
		{"$100", `\$100`},
		{"a_b", `a\_b`},
		{"a#b", `a\#b`},
	}
	for _, tt := range tests {
		got := EscapeLatex(tt.in)
		if got != tt.want {
			t.Errorf("EscapeLatex(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestScoreBand(t *testing.T) {
	tests := []struct {
		score float64
		want  string
	}{
		{90, "Critical"},
		{70, "High"},
		{50, "Medium"},
		{20, "Low"},
	}
	for _, tt := range tests {
		got := ScoreBand(tt.score)
		if got != tt.want {
			t.Errorf("ScoreBand(%.0f) = %q, want %q", tt.score, got, tt.want)
		}
	}
}

func TestRenderLatex(t *testing.T) {
	target := Target{
		TargetID: "t-test-corp",
		Name:     "Test Corp",
		Ticker:   "TST",
		Industry: "Technology",
		Sector:   "Information Technology",
		Domains:  []string{"test.com", "testcorp.io"},
	}

	leads := []Lead{
		{
			LeadID:          "led-1",
			SignalType:      "vulnerability",
			Severity:        "high",
			CvssScore:       8.1,
			VulnerabilityID: "CVE-2026-1234",
			EntityName:      "test-package",
			Summary:         "Authentication bypass in test-package allows remote code execution.",
			SourceID:        "nvd",
		},
		{
			LeadID:          "led-2",
			SignalType:      "regulatory",
			Severity:        "medium",
			ImpactScore:     55,
			VulnerabilityID: "SEC-2026-8K-001",
			EntityName:      "Test Corp",
			Summary:         "Material cybersecurity incident disclosure.",
			SourceID:        "sec-edgar",
		},
	}

	investigations := []Investigation{
		{
			InvestigationID: "inv-1",
			LeadID:          "led-1",
			AggregateScore:  62.5,
			Status:          "completed",
			StepScores:      map[string]float64{"secure": 72, "network": 58, "risk": 64, "graph": 38, "causal": 51, "supply": 49},
			Threats: []Threat{
				{Primitive: "credential_compromise", Confidence: "high", Evidence: []string{"Auth bypass in trade execution API"}},
			},
			Impacts: []Impact{
				{Primitive: "financial_loss", Score: 75, Label: "Financial Loss"},
			},
			Recommendations: []string{"Rotate all API tokens immediately", "Enable MFA on admin accounts"},
		},
	}

	latex, err := RenderLatex(target, leads, investigations)
	if err != nil {
		t.Fatalf("RenderLatex failed: %v", err)
	}

	// Basic structure checks
	if !strings.Contains(latex, `\documentclass`) {
		t.Error("missing documentclass")
	}
	if !strings.Contains(latex, "Test Corp") {
		t.Error("missing target name")
	}
	if !strings.Contains(latex, "TST") {
		t.Error("missing ticker")
	}
	if !strings.Contains(latex, "CVE-2026-1234") {
		t.Error("missing CVE reference")
	}
	if !strings.Contains(latex, "haiphen.io/\\#mission:svc-secure") {
		t.Error("missing secure service hyperlink")
	}
	if !strings.Contains(latex, "Service Index") {
		t.Error("missing service index section")
	}
	if !strings.Contains(latex, `\end{document}`) {
		t.Error("missing end document")
	}
	// New 3+1 page structure checks
	if !strings.Contains(latex, "Abstract.") {
		t.Error("missing abstract section")
	}
	if !strings.Contains(latex, `R = \sum_{i=1}^{6}`) {
		t.Error("missing methodology formula")
	}
	if !strings.Contains(latex, "Signal Inventory") {
		t.Error("missing signal inventory section")
	}
	if !strings.Contains(latex, "Threat Classification") {
		t.Error("missing threat classification section")
	}
	if !strings.Contains(latex, "Financial Quantification") {
		t.Error("missing financial quantification")
	}
	if !strings.Contains(latex, "Remediation Roadmap") {
		t.Error("missing remediation roadmap")
	}
	if !strings.Contains(latex, "Monitoring Commands") {
		t.Error("missing monitoring commands")
	}
	if !strings.Contains(latex, "Conclusion") {
		t.Error("missing conclusion section")
	}
	if !strings.Contains(latex, "robot_haiphen.png") {
		t.Error("missing branding page logo reference")
	}
	if !strings.Contains(latex, "Securing Financial Infrastructure at Scale") {
		t.Error("missing branding page tagline")
	}
	if !strings.Contains(latex, "jude@haiphen.io") {
		t.Error("missing contact email on branding page")
	}
	if !strings.Contains(latex, "credential compromise") {
		t.Error("missing threat explanation text")
	}
}
