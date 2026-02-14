package shell

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/haiphen/haiphen-cli/internal/acl"
	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/tui"
	"github.com/haiphen/haiphen-cli/internal/util"
)

// NewProspectWorkflow creates the 7-step prospect intelligence workflow.
func NewProspectWorkflow(cfg *config.Config, st store.Store, aclClient *acl.Client) *Workflow {
	return &Workflow{
		ID:          "prospect",
		Label:       "Prospect Intelligence",
		Description: "Targets, leads, and outreach",
		EntryGuard: func(state *State) string {
			if !state.GetBool(KeyLoggedIn) {
				return "You must be logged in. Select Onboarding to get started."
			}
			return ""
		},
		Steps: []Step{
			stepProspectCredentials(cfg, st, aclClient),
			stepProspectTargets(cfg, st),
			stepProspectCrawl(cfg, st),
			stepProspectLeads(cfg, st),
			stepProspectInvestigate(cfg, st),
			stepProspectReport(cfg, st),
			stepProspectOutreach(cfg, st),
		},
	}
}

func loadToken(st store.Store) (string, error) {
	tok, err := st.LoadToken()
	if err != nil {
		return "", err
	}
	if tok == nil || strings.TrimSpace(tok.AccessToken) == "" {
		return "", fmt.Errorf("not logged in; run Onboarding first")
	}
	return tok.AccessToken, nil
}

// allProviders defines the known credential providers.
var allProviders = []string{"NVD", "GitHub Advisory", "Shodan"}

// providerKeyMap maps display names to API keys.
var providerKeyMap = map[string]string{
	"NVD":             "nvd",
	"GitHub Advisory": "github",
	"Shodan":          "shodan",
}

// Step 1: API Credentials
func stepProspectCredentials(cfg *config.Config, st store.Store, aclClient *acl.Client) Step {
	return NewStep(
		"prospect.credentials", "API Credentials",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			role := state.GetString(KeyRole)
			isAdmin := role == "admin"

			token, err := loadToken(st)
			if err != nil {
				return StepResult{Error: err}
			}

			// Fetch current credential status
			creds, fetchErr := FetchCredentials(ctx, cfg, token)

			// Build status list
			configuredMap := make(map[string]CredentialInfo)
			if fetchErr == nil {
				for _, c := range creds {
					configuredMap[c.Provider] = c
				}
			}

			statuses := make([]tui.CredentialStatus, len(allProviders))
			for i, p := range allProviders {
				apiKey := providerKeyMap[p]
				cs := tui.CredentialStatus{Provider: p}
				if info, ok := configuredMap[apiKey]; ok {
					cs.Configured = true
					cs.UpdatedAt = info.UpdatedAt
				}
				statuses[i] = cs
			}

			// Render status panel
			fmt.Fprintln(w)
			fmt.Fprintln(w, tui.RenderCredentialStatus(statuses))
			fmt.Fprintln(w)

			if !isAdmin {
				fmt.Fprintf(w, "  %s Admin access required to configure credentials.\n",
					tui.C(tui.Yellow, "!"))

				open, err := tui.Confirm("  Open haiphen.io/pricing in browser?", true)
				if err == nil && open {
					_ = util.OpenBrowser("https://haiphen.io/#pricing")
					fmt.Fprintf(w, "  %s Opened in browser.\n", tui.C(tui.Green, "✓"))
				}
				return StepResult{}
			}

			set, err := tui.Confirm("  Configure a credential?", false)
			if err != nil || !set {
				return StepResult{}
			}

			// Offer unconfigured providers first, then "Re-enter existing"
			options := []string{}
			for _, p := range allProviders {
				apiKey := providerKeyMap[p]
				if _, ok := configuredMap[apiKey]; !ok {
					options = append(options, p)
				}
			}
			for _, p := range allProviders {
				apiKey := providerKeyMap[p]
				if _, ok := configuredMap[apiKey]; ok {
					options = append(options, p+" (update)")
				}
			}

			if len(options) == 0 {
				fmt.Fprintf(w, "  %s All credentials configured.\n", tui.C(tui.Green, "✓"))
				return StepResult{}
			}

			idx, err := tui.Select("  Provider:", options)
			if err != nil {
				return StepResult{BackToMenu: true}
			}

			// Extract provider name (strip " (update)" suffix)
			providerDisplay := strings.TrimSuffix(options[idx], " (update)")
			providerKey := providerKeyMap[providerDisplay]

			value, err := tui.SecretInput(fmt.Sprintf("  Enter %s API key: ", providerDisplay))
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			if value == "" {
				return StepResult{Error: fmt.Errorf("API key cannot be empty")}
			}

			spin := tui.NewSpinner("Saving credential...")
			if err := SetCredential(ctx, cfg, token, providerKey, value); err != nil {
				spin.Fail("Failed to save credential")
				return StepResult{Error: err}
			}
			spin.Success(fmt.Sprintf("%s credential saved", providerDisplay))

			// Re-fetch and show updated status
			creds, err = FetchCredentials(ctx, cfg, token)
			if err == nil {
				configuredMap = make(map[string]CredentialInfo)
				for _, c := range creds {
					configuredMap[c.Provider] = c
				}
				for i, p := range allProviders {
					apiKey := providerKeyMap[p]
					statuses[i] = tui.CredentialStatus{Provider: p}
					if info, ok := configuredMap[apiKey]; ok {
						statuses[i].Configured = true
						statuses[i].UpdatedAt = info.UpdatedAt
					}
				}
				fmt.Fprintln(w)
				fmt.Fprintln(w, tui.RenderCredentialStatus(statuses))
			}

			return StepResult{}
		},
	)
}

// Step 2: Browse Targets (interactive table)
func stepProspectTargets(cfg *config.Config, st store.Store) Step {
	return NewStep(
		"prospect.targets", "Browse Targets",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			sectors := []string{
				"All Sectors",
				"Financials",
				"Information Technology",
				"Industrials",
				"Health Care",
				"Consumer Discretionary",
				"Energy",
				"Consumer Staples",
				"Materials",
				"Utilities",
				"Real Estate",
				"Communication Services",
			}

			idx, err := tui.Select("  Filter by sector:", sectors)
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			sector := ""
			if idx > 0 {
				sector = sectors[idx]
			}

			token, err := loadToken(st)
			if err != nil {
				return StepResult{Error: err}
			}

			spin := tui.NewSpinner("Loading targets...")
			targets, err := FetchTargets(ctx, cfg, token, sector, 50)
			if err != nil {
				spin.Fail("Failed to load targets")
				return StepResult{Error: err}
			}
			spin.Stop()

			if len(targets) == 0 {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "No targets found for this sector."))
				return StepResult{}
			}

			// Build interactive table
			columns := []tui.TableColumn{
				{Title: "TICKER", Width: 8, SortKey: "ticker"},
				{Title: "NAME", Width: 30, SortKey: "name"},
				{Title: "SECTOR", Width: 16, SortKey: "sector"},
				{Title: "INDUSTRY", Width: 22, SortKey: "industry"},
			}

			rows := make([]tui.RowData, len(targets))
			for i, t := range targets {
				sectorShort := t.Sector
				if len(sectorShort) > 15 {
					sectorShort = sectorShort[:15]
				}
				rows[i] = tui.RowData{
					"ticker":   t.Ticker,
					"name":     t.Name,
					"sector":   sectorShort,
					"industry": t.Industry,
				}
			}

			table := tui.NewInteractiveTable("F500 Targets", columns, rows, 15)
			result, err := tui.RunTea[int](table)
			if err != nil {
				return StepResult{Error: err}
			}
			if result.Quit || result.Value < 0 {
				return StepResult{BackToMenu: true}
			}

			selected := targets[result.Value]
			state.Set(KeyTargetID, selected.TargetID)
			state.Set(KeyTargetName, selected.Name)

			fmt.Fprintf(w, "\n  %s Selected: %s (%s)\n",
				tui.C(tui.Green, "✓"), selected.Name, selected.Ticker)

			return StepResult{}
		},
	)
}

// Step 3: Targeted Crawl (per-source detail)
func stepProspectCrawl(cfg *config.Config, st store.Store) Step {
	return NewStep(
		"prospect.crawl", "Targeted Crawl",
		func(state *State) bool {
			return state.GetString(KeyRole) != "admin"
		},
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			targetID := state.GetString(KeyTargetID)
			targetName := state.GetString(KeyTargetName)
			if targetID == "" {
				fmt.Fprintf(w, "  %s No target selected. Select one in the Targets step.\n",
					tui.C(tui.Yellow, "!"))
				return StepResult{}
			}

			ok, err := tui.Confirm(fmt.Sprintf("  Crawl %s for intelligence?", targetName), true)
			if err != nil || !ok {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "Skipped."))
				return StepResult{}
			}

			token, err := loadToken(st)
			if err != nil {
				return StepResult{Error: err}
			}

			spin := tui.NewSpinner(fmt.Sprintf("Crawling %s...", targetName))
			result, err := TriggerCrawl(ctx, cfg, token, targetID)
			if err != nil {
				spin.Fail("Crawl failed")
				return StepResult{Error: err}
			}
			spin.Stop()

			// Aggregate per-source details from the returned leads
			sourceMap := make(map[string]int)
			for _, lead := range result.Leads {
				sourceMap[lead.SourceID]++
			}

			sources := []tui.CrawlSourceDetail{}
			// Show all known sources, even if 0 leads
			knownSources := []string{"nvd", "osv", "github-advisory", "shodan", "sec-edgar", "infra-scan"}
			for _, src := range knownSources {
				count := sourceMap[src]
				sources = append(sources, tui.CrawlSourceDetail{
					Source:     src,
					LeadsFound: count,
				})
			}
			// Add any unknown sources
			for src, count := range sourceMap {
				found := false
				for _, ks := range knownSources {
					if ks == src {
						found = true
						break
					}
				}
				if !found {
					sources = append(sources, tui.CrawlSourceDetail{
						Source:     src,
						LeadsFound: count,
					})
				}
			}

			fmt.Fprintln(w)
			fmt.Fprintln(w, tui.RenderCrawlDetails(sources, result.LeadsCreated))
			state.Set(KeyLeadCount, result.LeadsCreated)

			return StepResult{}
		},
	)
}

// Step 4: View Leads (interactive table with badges)
func stepProspectLeads(cfg *config.Config, st store.Store) Step {
	return NewStep(
		"prospect.leads", "View Leads",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			targetID := state.GetString(KeyTargetID)

			token, err := loadToken(st)
			if err != nil {
				return StepResult{Error: err}
			}

			spin := tui.NewSpinner("Loading leads...")
			leads, err := FetchLeads(ctx, cfg, token, targetID, 50)
			if err != nil {
				spin.Fail("Failed to load leads")
				return StepResult{Error: err}
			}
			spin.Stop()

			if len(leads) == 0 {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "No leads found. Run a crawl first."))
				return StepResult{}
			}

			state.Set(KeyLeadCount, len(leads))

			// Build interactive table
			columns := []tui.TableColumn{
				{Title: "ENTITY", Width: 30, SortKey: "entity",
					Render: func(r tui.RowData) string {
						e := r["entity"]
						if len(e) > 28 {
							return e[:25] + "..."
						}
						return e
					},
					RawValue: func(r tui.RowData) string { return r["entity"] },
				},
				{Title: "CVSS", Width: 8, SortKey: "cvss",
					Render: func(r tui.RowData) string {
						return tui.ScoreBadge(parseFloat(r["cvss"]))
					},
					RawValue: func(r tui.RowData) string { return r["cvss"] },
				},
				{Title: "SEVERITY", Width: 10, SortKey: "severity",
					Render: func(r tui.RowData) string {
						return tui.SeverityBadge(r["severity"])
					},
					RawValue: func(r tui.RowData) string { return r["severity"] },
				},
				{Title: "SIGNAL", Width: 10, SortKey: "signal",
					Render: func(r tui.RowData) string {
						return tui.SignalTypeBadge(r["signal"])
					},
					RawValue: func(r tui.RowData) string { return r["signal"] },
				},
			}

			rows := make([]tui.RowData, len(leads))
			for i, l := range leads {
				rows[i] = tui.RowData{
					"entity":   l.Entity,
					"cvss":     fmt.Sprintf("%.1f", l.CVSS),
					"severity": strings.ToLower(l.Severity),
					"signal":   l.SignalType,
				}
			}

			// Pro-tier gate for selection
			plan := state.GetString(KeyPlan)
			if plan == "free" {
				// Show table read-only (still interactive for browsing)
				table := tui.NewInteractiveTable("Prospect Leads", columns, rows, 15)
				_, _ = tui.RunTea[int](table)

				fmt.Fprintf(w, "\n  %s Upgrade to Pro to run investigations on these leads.\n",
					tui.C(tui.Gray, "i"))
				return StepResult{}
			}

			table := tui.NewInteractiveTable("Prospect Leads", columns, rows, 15)
			result, err := tui.RunTea[int](table)
			if err != nil {
				return StepResult{Error: err}
			}
			if result.Quit || result.Value < 0 {
				return StepResult{BackToMenu: true}
			}

			selected := leads[result.Value]
			state.Set("selected_lead_id", selected.LeadID)
			state.Set("selected_lead_entity", selected.Entity)

			fmt.Fprintf(w, "\n  %s Selected: %s (CVSS %.1f, %s)\n",
				tui.C(tui.Green, "✓"), selected.Entity, selected.CVSS, selected.Severity)

			return StepResult{}
		},
	)
}

// Step 5: Run Investigation — FLAGSHIP (animated progress + rich panels)
func stepProspectInvestigate(cfg *config.Config, st store.Store) Step {
	return NewStep(
		"prospect.investigate", "Run Investigation",
		func(state *State) bool {
			if state.GetString(KeyPlan) == "free" {
				return true
			}
			_, hasLead := state.Get("selected_lead_id")
			return !hasLead
		},
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			leadID := state.GetString("selected_lead_id")
			leadEntity := state.GetString("selected_lead_entity")
			if leadID == "" {
				fmt.Fprintf(w, "  %s No lead selected.\n", tui.C(tui.Yellow, "!"))
				return StepResult{}
			}

			token, err := loadToken(st)
			if err != nil {
				return StepResult{Error: err}
			}

			// Show lead info
			fmt.Fprintf(w, "  Investigating: %s\n\n", tui.C(tui.Bold, leadEntity))

			spin := tui.NewSpinner(fmt.Sprintf("Running 6-service pipeline on %s...", leadEntity))
			result, err := TriggerAnalysis(ctx, cfg, token, leadID)
			if err != nil {
				spin.Fail("Investigation failed")
				return StepResult{Error: err}
			}
			spin.Stop()

			// Animated progress tracker
			if len(result.Steps) > 0 {
				pipeSteps := make([]tui.PipelineStep, len(result.Steps))
				for i, s := range result.Steps {
					pipeSteps[i] = tui.PipelineStep{
						Service:    s.Service,
						Score:      s.Score,
						Findings:   len(s.Findings),
						DurationMs: s.DurationMs,
						Status:     s.Status,
					}
				}

				tracker := tui.NewProgressTracker(pipeSteps, result.Score)
				_, _ = tui.RunTea[tui.PipelineResult](tracker)
			}

			fmt.Fprintln(w)

			// Score panel with service breakdown
			if len(result.Steps) > 0 {
				panelSteps := make([]tui.PipelineStep, len(result.Steps))
				for i, s := range result.Steps {
					panelSteps[i] = tui.PipelineStep{
						Service:    s.Service,
						Score:      s.Score,
						Findings:   len(s.Findings),
						DurationMs: s.DurationMs,
						Status:     s.Status,
					}
				}
				fmt.Fprintln(w, tui.RenderScorePanel(result.Score, panelSteps))
			}

			// Synthesis panels
			if result.ClaudeSummary != nil {
				if result.ClaudeSummary.Summary != "" {
					fmt.Fprintln(w)
					fmt.Fprintln(w, tui.RenderSynthesisSummary(result.ClaudeSummary.Summary))
				}

				if result.ClaudeSummary.Impact != "" {
					fmt.Fprintln(w)
					// Parse impact as narrative
					impacts := parseImpactDimensions(result.ClaudeSummary.Impact)
					if len(impacts) > 0 {
						fmt.Fprintln(w, tui.RenderImpactChart(impacts))
					} else {
						fmt.Fprintln(w, tui.RenderSynthesisSummary(result.ClaudeSummary.Impact))
					}
				}

				if len(result.ClaudeSummary.Recommendations) > 0 {
					fmt.Fprintln(w)
					fmt.Fprintln(w, tui.RenderRecommendations(result.ClaudeSummary.Recommendations))
				}

				if len(result.ClaudeSummary.DataGaps) > 0 {
					fmt.Fprintln(w)
					fmt.Fprintln(w, tui.RenderDataGaps(result.ClaudeSummary.DataGaps))
				}
			}

			invCount := state.GetInt(KeyInvestigationCount)
			state.Set(KeyInvestigationCount, invCount+1)

			return StepResult{}
		},
	)
}

// parseImpactDimensions attempts to parse impact text into structured dimensions.
// Falls back to empty if the text isn't in a recognized format.
func parseImpactDimensions(impact string) []tui.ImpactDimension {
	// The synthesizer produces impact as a narrative string, not structured.
	// We map the 5 known impact primitives to approximate scores from keywords.
	dimensions := []struct {
		name     string
		keywords []string
	}{
		{"Financial Loss", []string{"financial", "monetary", "revenue", "cost"}},
		{"Regulatory", []string{"regulatory", "compliance", "legal", "audit"}},
		{"Client Data", []string{"client", "data", "breach", "pii", "sensitive"}},
		{"Operations", []string{"operational", "disruption", "downtime", "outage"}},
		{"Reputation", []string{"reputation", "trust", "brand", "credibility"}},
	}

	lower := strings.ToLower(impact)
	var result []tui.ImpactDimension
	anyFound := false
	for _, dim := range dimensions {
		score := 2.0 // base
		for _, kw := range dim.keywords {
			if strings.Contains(lower, kw) {
				score += 2.5
				anyFound = true
			}
		}
		if score > 10 {
			score = 10
		}
		result = append(result, tui.ImpactDimension{
			Name:  dim.name,
			Score: score,
		})
	}
	if !anyFound {
		return nil
	}
	return result
}

// Step 6: Generate Report
func stepProspectReport(cfg *config.Config, st store.Store) Step {
	return NewStep(
		"prospect.report", "Generate Report",
		func(state *State) bool {
			return state.GetString(KeyPlan) == "free"
		},
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			targetID := state.GetString(KeyTargetID)
			targetName := state.GetString(KeyTargetName)
			if targetID == "" {
				fmt.Fprintf(w, "  %s No target selected.\n", tui.C(tui.Yellow, "!"))
				return StepResult{}
			}

			ok, err := tui.Confirm(fmt.Sprintf("  Generate report for %s?", targetName), true)
			if err != nil || !ok {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "Skipped."))
				return StepResult{}
			}

			token, err := loadToken(st)
			if err != nil {
				return StepResult{Error: err}
			}

			spin := tui.NewSpinner("Fetching LaTeX report...")
			data, err := FetchReport(ctx, cfg, token, targetID)
			if err != nil {
				spin.Fail("Report fetch failed")
				return StepResult{Error: err}
			}
			spin.Stop()

			// Save to file
			safeName := strings.ReplaceAll(strings.ToLower(targetName), " ", "-")
			filename := fmt.Sprintf("haiphen-report-%s.tex", safeName)
			if err := os.WriteFile(filename, data, 0o644); err != nil {
				return StepResult{Error: fmt.Errorf("write report: %w", err)}
			}

			absPath, _ := filepath.Abs(filename)
			fileSize := len(data)
			fmt.Fprintf(w, "  %s Report saved to %s (%s)\n",
				tui.C(tui.Green, "✓"), absPath, formatBytes(fileSize))

			compile, err := tui.Confirm("  Compile to PDF with pdflatex?", false)
			if err == nil && compile {
				spin := tui.NewSpinner("Compiling PDF...")
				if compileErr := compileLaTeX(filename); compileErr != nil {
					spin.Fail("Compilation failed")
					fmt.Fprintf(w, "\n  %s %v\n", tui.C(tui.Yellow, "!"), compileErr)
					fmt.Fprintf(w, "  %s Ensure pdflatex is installed (e.g. brew install mactex)\n",
						tui.C(tui.Gray, "i"))
				} else {
					pdfFile := strings.TrimSuffix(filename, ".tex") + ".pdf"
					pdfAbs, _ := filepath.Abs(pdfFile)
					if info, serr := os.Stat(pdfFile); serr == nil {
						fmt.Fprintf(w, "  %s PDF: %s (%s)\n",
							tui.C(tui.Green, "✓"), pdfAbs, formatBytes(int(info.Size())))
					} else {
						spin.Success(fmt.Sprintf("PDF: %s", pdfFile))
					}
				}
			}

			return StepResult{}
		},
	)
}

// compileLaTeX runs pdflatex on the given file.
func compileLaTeX(texFile string) error {
	return util.RunCommand("pdflatex", "-interaction=nonstopmode", texFile)
}

// Step 7: Draft Outreach (styled preview)
func stepProspectOutreach(cfg *config.Config, st store.Store) Step {
	return NewStep(
		"prospect.outreach", "Draft Outreach",
		func(state *State) bool {
			return state.GetString(KeyRole) != "admin"
		},
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			leadID := state.GetString("selected_lead_id")
			leadEntity := state.GetString("selected_lead_entity")
			if leadID == "" {
				fmt.Fprintf(w, "  %s No lead selected. Run an investigation first.\n", tui.C(tui.Yellow, "!"))
				return StepResult{Done: true}
			}

			ok, err := tui.Confirm(fmt.Sprintf("  Draft outreach email for %s?", leadEntity), true)
			if err != nil || !ok {
				return StepResult{Done: true}
			}

			token, err := loadToken(st)
			if err != nil {
				return StepResult{Error: err}
			}

			spin := tui.NewSpinner("Drafting outreach...")
			draft, err := DraftOutreach(ctx, cfg, token, leadID)
			if err != nil {
				spin.Fail("Draft failed")
				return StepResult{Error: err}
			}
			spin.Stop()

			// Render styled preview
			preview := tui.OutreachPreview{
				Subject: draft.Subject,
				To:      leadEntity,
				Body:    draft.BodyText,
			}
			fmt.Fprintln(w)
			fmt.Fprintln(w, tui.RenderOutreachPreview(preview))
			fmt.Fprintln(w)

			fmt.Fprintf(w, "  Outreach ID: %s\n\n", tui.C(tui.Gray, draft.OutreachID))

			approve, err := tui.Confirm("  Approve and queue for sending?", false)
			if err != nil || !approve {
				fmt.Fprintf(w, "  %s Draft saved but not sent.\n", tui.C(tui.Gray, "i"))
				fmt.Fprintf(w, "  %s Run: haiphen prospect send %s\n",
					tui.C(tui.Gray, " "), draft.OutreachID)
				return StepResult{Done: true}
			}

			spin = tui.NewSpinner("Approving...")
			if err := ApproveOutreach(ctx, cfg, token, leadID); err != nil {
				spin.Fail("Approval failed")
				return StepResult{Error: err}
			}
			spin.Success(fmt.Sprintf("Outreach %s approved and queued", draft.OutreachID))

			return StepResult{Done: true}
		},
	)
}

// parseFloat is a small helper to parse a float from a string, returning 0 on error.
func parseFloat(s string) float64 {
	var f float64
	fmt.Sscanf(s, "%f", &f)
	return f
}

// formatBytes returns a human-readable byte size.
func formatBytes(b int) string {
	switch {
	case b >= 1024*1024:
		return fmt.Sprintf("%.1f MB", float64(b)/(1024*1024))
	case b >= 1024:
		return fmt.Sprintf("%.1f KB", float64(b)/1024)
	default:
		return fmt.Sprintf("%d B", b)
	}
}
