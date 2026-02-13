// Package report provides offline LaTeX report generation for prospect targets.
// This is a Go-template fallback for when the API report endpoint is unavailable.
package report

import (
	"bytes"
	"embed"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"text/template"
	"time"
)

//go:embed report.tex.tmpl
var tmplFS embed.FS

//go:embed robot_haiphen.png
var logoPNG []byte

// Target represents the company being reported on.
type Target struct {
	TargetID string
	Name     string
	Ticker   string
	Industry string
	Sector   string
	Domains  []string
}

// Lead represents a single intelligence signal.
type Lead struct {
	LeadID          string
	SignalType      string
	Severity        string
	CvssScore       float64
	ImpactScore     float64
	VulnerabilityID string
	EntityName      string
	Summary         string
	SourceID        string
}

// Investigation represents a completed analysis.
type Investigation struct {
	InvestigationID string
	LeadID          string
	AggregateScore  float64
	Status          string
	Summary         string
	Impact          string
	Recommendations []string
	StepScores      map[string]float64
	Threats         []Threat
	Impacts         []Impact
}

// Threat represents a classified threat primitive.
type Threat struct {
	Primitive  string
	Confidence string
	Evidence   []string
}

// Impact represents a scored impact primitive.
type Impact struct {
	Primitive string
	Score     float64
	Label     string
}

// ServiceMeta describes a Haiphen service for the report.
type ServiceMeta struct {
	Key   string
	Label string
	Color string
	Desc  string
	URL   string
}

// ReportData aggregates all data for the LaTeX template.
type ReportData struct {
	Target          Target
	Leads           []Lead
	TopLeads        []Lead
	Investigations  []Investigation
	Date            string
	AvgScore        float64
	SignalDist      map[string]SignalStat
	SeverityDist    map[string]int
	ServiceScores   map[string]float64
	AllThreats      []Threat
	AllImpacts      []Impact
	Recommendations []string
	References      []string
	Services        []ServiceMeta
	ServiceOrder    []string

	// Computed fields for new template sections
	PrimarySignalType    string
	TopWeightedServices  string
	SignalTypesList      string
	HighestService       string
	HighestServiceLabel  string
	HighestServiceScore  float64
	HighestServiceExplan string
	FinancialEstLow      string
	FinancialEstHigh     string
	MitigationPct        int
	MitigationSavings    string
	TopThreatLabel       string
	HasLogo              bool
}

// SignalStat holds signal distribution data.
type SignalStat struct {
	Total    int
	ScoreSum float64
	AvgScore int
}

var defaultServices = []ServiceMeta{
	{Key: "secure", Label: "Secure", Color: "haiphenRed", Desc: "CVE matching \\& vulnerability assessment", URL: "https://haiphen.io/\\#mission:svc-secure"},
	{Key: "network", Label: "Network", Color: "haiphenBlue", Desc: "Protocol analysis \\& traffic inspection", URL: "https://haiphen.io/\\#mission:svc-network"},
	{Key: "graph", Label: "Graph", Color: "haiphenPurple", Desc: "Entity intelligence \\& relationship mapping", URL: "https://haiphen.io/\\#mission:svc-graph"},
	{Key: "risk", Label: "Risk", Color: "haiphenAmber", Desc: "Monte Carlo risk simulation \\& VaR", URL: "https://haiphen.io/\\#mission:svc-risk"},
	{Key: "causal", Label: "Causal", Color: "haiphenTeal", Desc: "DAG builder \\& root-cause inference", URL: "https://haiphen.io/\\#mission:svc-causal"},
	{Key: "supply", Label: "Supply", Color: "haiphenBlue", Desc: "Counterparty risk scoring", URL: "https://haiphen.io/\\#mission:svc-supply"},
}

var serviceOrder = []string{"secure", "network", "causal", "risk", "graph", "supply"}

var serviceExplanations = map[string]string{
	"secure":  "elevated vulnerability exposure requiring immediate patching attention",
	"network": "protocol-level risks that may expose internal systems to external actors",
	"graph":   "complex entity relationships suggesting broad blast radius potential",
	"risk":    "elevated probabilistic risk metrics across Monte Carlo simulations",
	"causal":  "identifiable causal chains that could propagate failures across systems",
	"supply":  "counterparty or vendor concentration risks in the supply chain",
}

var threatExplanations = map[string]string{
	"credential_compromise":  "Credential compromise vectors indicate potential unauthorized access pathways through authentication or session management weaknesses. In financial infrastructure, compromised credentials can enable unauthorized trading, fund transfers, or access to material non-public information. Organizations should prioritize credential rotation, multi-factor authentication enforcement, and session token lifetime audits.",
	"data_corruption":        "Data corruption signals suggest risks to the integrity of market data feeds, pricing information, or transactional records. Corrupted or manipulated data in financial systems can lead to erroneous trades, mispriced assets, and cascading valuation errors across portfolios and counterparty positions.",
	"protocol_exposure":      "Protocol exposure findings reveal attack surfaces at the network communication layer, including insecure API endpoints, legacy protocol usage, or insufficient transport security. Exposed financial protocols such as FIX, proprietary WebSocket feeds, or OT/SCADA interfaces can be exploited for interception or injection attacks.",
	"execution_disruption":   "Execution disruption risks arise from latency anomalies, queue stalls, or matching engine vulnerabilities that could delay or prevent order execution. In high-frequency and algorithmic trading environments, even millisecond-level disruptions can result in significant financial losses and regulatory scrutiny.",
	"settlement_failure":     "Settlement failure vectors indicate potential breakdowns in the post-trade lifecycle including clearing, reconciliation, and position management. Failed settlements trigger counterparty risk cascades, regulatory penalties, and can erode market confidence in the institution.",
	"supply_dependency":      "Supply chain dependency risks arise from reliance on third-party vendors, single-source providers, or concentrated SaaS platforms for critical infrastructure components. Disruption to these dependencies can cascade through operational systems and affect service continuity.",
	"cascade_propagation":    "Cascade propagation signals indicate that failures in one system component could propagate to multiple downstream systems. In interconnected financial infrastructure, a single point of failure can trigger systemic disruptions affecting trading, settlement, and client-facing operations simultaneously.",
	"regulatory_gap":         "Regulatory gap signals suggest filing or compliance obligations that may be unmet or delayed. For public financial institutions, gaps in SEC filings (8-K, 10-K) can trigger enforcement actions, fines, and reputational damage. Proactive compliance monitoring is essential to maintain regulatory standing.",
	"technology_obsolescence": "Technology obsolescence findings indicate the use of deprecated software versions, expiring certificates, or end-of-life dependencies. Outdated technology components accumulate unpatched vulnerabilities and reduce the effectiveness of security controls, creating expanding attack surfaces over time.",
	"operational_fragility":  "Operational fragility signals point to infrastructure patterns that lack redundancy, health monitoring, or automated failover capabilities. Single points of failure, inadequate disaster recovery, and insufficient chaos engineering practices increase the probability and severity of operational disruptions.",
}

var pipelineWeights = map[string]map[string]float64{
	"vulnerability": {"secure": 0.25, "network": 0.20, "graph": 0.15, "risk": 0.15, "causal": 0.10, "supply": 0.15},
	"regulatory":    {"secure": 0.10, "network": 0.05, "graph": 0.15, "risk": 0.30, "causal": 0.25, "supply": 0.15},
	"performance":   {"secure": 0.10, "network": 0.30, "graph": 0.10, "risk": 0.20, "causal": 0.20, "supply": 0.10},
	"incident":      {"secure": 0.15, "network": 0.15, "graph": 0.15, "risk": 0.15, "causal": 0.30, "supply": 0.10},
}

const breachCostFinancial = 6_080_000.0
const mitigationEffectiveness = 0.62

// EscapeLatex escapes special LaTeX characters in a string.
func EscapeLatex(s string) string {
	r := strings.NewReplacer(
		`\`, `\textbackslash{}`,
		`&`, `\&`,
		`%`, `\%`,
		`$`, `\$`,
		`#`, `\#`,
		`_`, `\_`,
		`{`, `\{`,
		`}`, `\}`,
		`~`, `\textasciitilde{}`,
		`^`, `\textasciicircum{}`,
		`<`, `\textless{}`,
		`>`, `\textgreater{}`,
		`|`, `\textbar{}`,
	)
	return r.Replace(s)
}

// ScoreBand returns a human-readable severity label for a score.
func ScoreBand(score float64) string {
	if score >= 80 {
		return "Critical"
	}
	if score >= 60 {
		return "High"
	}
	if score >= 40 {
		return "Medium"
	}
	return "Low"
}

// WriteLogoFile extracts the embedded robot_haiphen.png to the given directory.
func WriteLogoFile(dir string) error {
	return os.WriteFile(filepath.Join(dir, "robot_haiphen.png"), logoPNG, 0644)
}

// RenderLatex generates a complete LaTeX document from the provided data.
func RenderLatex(target Target, leads []Lead, investigations []Investigation) (string, error) {
	data := buildReportData(target, leads, investigations)

	funcMap := template.FuncMap{
		"escape":    EscapeLatex,
		"scoreBand": ScoreBand,
		"join":      strings.Join,
		"truncate": func(s string, n int) string {
			if len(s) <= n {
				return s
			}
			return s[:n-3] + "..."
		},
		"severityColor": func(s string) string {
			switch s {
			case "critical":
				return "haiphenRed"
			case "high":
				return "haiphenAmber"
			case "medium":
				return "haiphenBlue"
			case "low":
				return "haiphenTeal"
			default:
				return "black"
			}
		},
		"threatExplanation": func(primitive string) string {
			if e, ok := threatExplanations[primitive]; ok {
				return EscapeLatex(e)
			}
			return ""
		},
		"serviceScore": func(svc string, scores map[string]float64) string {
			if s, ok := scores[svc]; ok {
				return fmt.Sprintf("%.0f", s)
			}
			return "---"
		},
		"hasService": func(svc string, scores map[string]float64) bool {
			_, ok := scores[svc]
			return ok
		},
		"round": func(f float64) int {
			return int(math.Round(f))
		},
	}

	tmpl, err := template.New("report.tex.tmpl").Funcs(funcMap).ParseFS(tmplFS, "report.tex.tmpl")
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}

	return buf.String(), nil
}

func buildReportData(target Target, leads []Lead, investigations []Investigation) ReportData {
	data := ReportData{
		Target:         target,
		Leads:          leads,
		Investigations: investigations,
		Date:           time.Now().Format("2006-01-02"),
		SignalDist:     map[string]SignalStat{},
		SeverityDist:   map[string]int{},
		ServiceScores:  map[string]float64{},
		Services:       defaultServices,
		ServiceOrder:   serviceOrder,
		MitigationPct:  int(mitigationEffectiveness * 100),
		HasLogo:        len(logoPNG) > 0,
	}

	// Top leads (first 10)
	if len(leads) > 10 {
		data.TopLeads = leads[:10]
	} else {
		data.TopLeads = leads
	}

	// Signal & severity distributions
	for _, l := range leads {
		sig := l.SignalType
		if sig == "" {
			sig = "vulnerability"
		}
		stat := data.SignalDist[sig]
		stat.Total++
		stat.ScoreSum += l.CvssScore
		if l.CvssScore == 0 {
			stat.ScoreSum += l.ImpactScore
		}
		data.SignalDist[sig] = stat

		sev := l.Severity
		if sev == "" {
			sev = "unknown"
		}
		data.SeverityDist[sev]++
	}

	// Compute avg scores for signal dist
	for k, stat := range data.SignalDist {
		if stat.Total > 0 {
			stat.AvgScore = int(math.Round(stat.ScoreSum / float64(stat.Total)))
		}
		data.SignalDist[k] = stat
	}

	// Signal types list
	sigTypes := make([]string, 0, len(data.SignalDist))
	for k := range data.SignalDist {
		sigTypes = append(sigTypes, k)
	}
	data.SignalTypesList = strings.Join(sigTypes, ", ")

	// Primary signal type (most leads)
	maxCount := 0
	for k, stat := range data.SignalDist {
		if stat.Total > maxCount {
			maxCount = stat.Total
			data.PrimarySignalType = k
		}
	}
	if data.PrimarySignalType == "" {
		data.PrimarySignalType = "vulnerability"
	}

	// Top weighted services for primary signal type
	weights, ok := pipelineWeights[data.PrimarySignalType]
	if !ok {
		weights = pipelineWeights["vulnerability"]
	}
	type wEntry struct {
		svc    string
		weight float64
	}
	var wEntries []wEntry
	for svc, w := range weights {
		wEntries = append(wEntries, wEntry{svc, w})
	}
	sort.Slice(wEntries, func(i, j int) bool { return wEntries[i].weight > wEntries[j].weight })
	topSvcs := make([]string, 0, 3)
	for i := 0; i < 3 && i < len(wEntries); i++ {
		for _, meta := range defaultServices {
			if meta.Key == wEntries[i].svc {
				topSvcs = append(topSvcs, meta.Label)
				break
			}
		}
	}
	data.TopWeightedServices = strings.Join(topSvcs, ", ")

	// Aggregate investigation data
	totalScore := 0.0
	svcScoreSums := map[string]float64{}
	svcScoreCounts := map[string]int{}
	threatsSeen := map[string]bool{}

	for _, inv := range investigations {
		totalScore += inv.AggregateScore
		for svc, score := range inv.StepScores {
			svcScoreSums[svc] += score
			svcScoreCounts[svc]++
		}
		for _, t := range inv.Threats {
			if !threatsSeen[t.Primitive] {
				threatsSeen[t.Primitive] = true
				data.AllThreats = append(data.AllThreats, t)
			}
		}
		for _, imp := range inv.Impacts {
			found := false
			for i, existing := range data.AllImpacts {
				if existing.Primitive == imp.Primitive {
					if imp.Score > existing.Score {
						data.AllImpacts[i].Score = imp.Score
					}
					found = true
					break
				}
			}
			if !found {
				data.AllImpacts = append(data.AllImpacts, imp)
			}
		}
		for _, r := range inv.Recommendations {
			found := false
			for _, existing := range data.Recommendations {
				if existing == r {
					found = true
					break
				}
			}
			if !found {
				data.Recommendations = append(data.Recommendations, r)
			}
		}
	}

	if len(investigations) > 0 {
		data.AvgScore = totalScore / float64(len(investigations))
	}

	for svc, sum := range svcScoreSums {
		data.ServiceScores[svc] = sum / float64(svcScoreCounts[svc])
	}

	// Find highest-scoring service
	highScore := 0.0
	for _, svc := range serviceOrder {
		if s, ok := data.ServiceScores[svc]; ok && s > highScore {
			highScore = s
			data.HighestService = svc
			data.HighestServiceScore = s
		}
	}
	for _, meta := range defaultServices {
		if meta.Key == data.HighestService {
			data.HighestServiceLabel = meta.Label
			break
		}
	}
	data.HighestServiceExplan = serviceExplanations[data.HighestService]

	// Financial estimates
	lowEst := breachCostFinancial * (data.AvgScore / 100) * 0.3
	highEst := breachCostFinancial * (data.AvgScore / 100) * 1.2
	data.FinancialEstLow = formatDollars(lowEst)
	data.FinancialEstHigh = formatDollars(highEst)
	mitigationSavings := (highEst - lowEst) * mitigationEffectiveness
	data.MitigationSavings = formatDollars(mitigationSavings)

	// Top threat label
	if len(data.AllThreats) > 0 {
		data.TopThreatLabel = strings.ReplaceAll(data.AllThreats[0].Primitive, "_", " ")
	} else {
		data.TopThreatLabel = "no classified threats"
	}

	// References
	for _, l := range leads {
		if strings.HasPrefix(l.VulnerabilityID, "CVE-") {
			ref := l.VulnerabilityID + ": " + EscapeLatex(truncStr(l.Summary, 80))
			data.References = append(data.References, ref)
		} else if strings.HasPrefix(l.VulnerabilityID, "SEC-") {
			ref := "SEC Filing " + EscapeLatex(l.VulnerabilityID) + ": " + EscapeLatex(l.EntityName)
			data.References = append(data.References, ref)
		} else if strings.HasPrefix(l.VulnerabilityID, "GHSA-") {
			ref := l.VulnerabilityID + ": " + EscapeLatex(truncStr(l.Summary, 80))
			data.References = append(data.References, ref)
		}
	}

	return data
}

func truncStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-3] + "..."
}

func formatDollars(n float64) string {
	if n >= 1_000_000 {
		return fmt.Sprintf("\\$%.1fM", n/1_000_000)
	}
	if n >= 1_000 {
		return fmt.Sprintf("\\$%.0fK", n/1_000)
	}
	return fmt.Sprintf("\\$%.0f", n)
}
