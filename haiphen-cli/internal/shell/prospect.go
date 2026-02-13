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

// Step 1: API Credentials
func stepProspectCredentials(cfg *config.Config, st store.Store, aclClient *acl.Client) Step {
	return NewStep(
		"prospect.credentials", "API Credentials",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			role := state.GetString(KeyRole)
			isAdmin := role == "admin"

			providers := []string{"NVD", "GitHub Advisory", "Shodan"}
			fmt.Fprintf(w, "  Crawler credential sources:\n\n")
			for _, p := range providers {
				// We can't actually check if they're set without an API call,
				// so just list them with guidance.
				fmt.Fprintf(w, "    %s  %s\n", tui.C(tui.Gray, "•"), p)
			}
			fmt.Fprintln(w)

			if !isAdmin {
				fmt.Fprintf(w, "  %s Admin access required to configure credentials.\n",
					tui.C(tui.Gray, "ℹ"))
				fmt.Fprintf(w, "  %s Contact your admin or upgrade at https://haiphen.io/#pricing\n",
					tui.C(tui.Gray, " "))
				return StepResult{}
			}

			set, err := tui.Confirm("  Configure a credential?", false)
			if err != nil || !set {
				return StepResult{}
			}

			idx, err := tui.Select("  Provider:", providers)
			if err != nil {
				return StepResult{BackToMenu: true}
			}

			providerKey := strings.ToLower(strings.ReplaceAll(providers[idx], " ", "-"))
			value, err := tui.SecretInput(fmt.Sprintf("  Enter %s API key: ", providers[idx]))
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			if value == "" {
				return StepResult{Error: fmt.Errorf("API key cannot be empty")}
			}

			token, err := loadToken(st)
			if err != nil {
				return StepResult{Error: err}
			}

			spin := tui.NewSpinner("Saving credential...")
			if err := SetCredential(ctx, cfg, token, providerKey, value); err != nil {
				spin.Fail("Failed to save credential")
				return StepResult{Error: err}
			}
			spin.Success(fmt.Sprintf("%s credential saved", providers[idx]))

			return StepResult{}
		},
	)
}

// Step 2: Browse Targets
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
			targets, err := FetchTargets(ctx, cfg, token, sector, 20)
			if err != nil {
				spin.Fail("Failed to load targets")
				return StepResult{Error: err}
			}
			spin.Stop()

			if len(targets) == 0 {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "No targets found for this sector."))
				return StepResult{}
			}

			fmt.Fprintf(w, "  %-6s  %-30s  %-8s  %s\n",
				tui.C(tui.Gray, "TICKER"),
				tui.C(tui.Gray, "NAME"),
				tui.C(tui.Gray, "SECTOR"),
				tui.C(tui.Gray, "INDUSTRY"))
			fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, strings.Repeat("─", 70)))

			labels := make([]string, len(targets))
			for i, t := range targets {
				sectorShort := t.Sector
				if len(sectorShort) > 12 {
					sectorShort = sectorShort[:12]
				}
				fmt.Fprintf(w, "  %-6s  %-30s  %-8s  %s\n",
					tui.C(tui.Cyan, t.Ticker), t.Name, sectorShort, t.Industry)
				labels[i] = fmt.Sprintf("%s (%s)", t.Name, t.Ticker)
			}
			fmt.Fprintln(w)

			selIdx, err := tui.Select("  Select a target:", labels)
			if err != nil {
				return StepResult{BackToMenu: true}
			}

			selected := targets[selIdx]
			state.Set(KeyTargetID, selected.TargetID)
			state.Set(KeyTargetName, selected.Name)

			fmt.Fprintf(w, "\n  %s Selected: %s (%s)\n",
				tui.C(tui.Green, "✓"), selected.Name, selected.Ticker)

			return StepResult{}
		},
	)
}

// Step 3: Targeted Crawl
func stepProspectCrawl(cfg *config.Config, st store.Store) Step {
	return NewStep(
		"prospect.crawl", "Targeted Crawl",
		func(state *State) bool {
			if state.GetString(KeyRole) != "admin" {
				return true // skip with message handled by ShouldSkip
			}
			return false
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
			spin.Success(fmt.Sprintf("Crawl complete — %d leads created", result.LeadsCreated))
			state.Set(KeyLeadCount, result.LeadsCreated)

			return StepResult{}
		},
	)
}

// Step 4: View Leads
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
			leads, err := FetchLeads(ctx, cfg, token, targetID, 20)
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

			fmt.Fprintf(w, "  %-8s  %-10s  %-30s  %s\n",
				tui.C(tui.Gray, "SEVERITY"),
				tui.C(tui.Gray, "SIGNAL"),
				tui.C(tui.Gray, "ENTITY"),
				tui.C(tui.Gray, "CVSS"))
			fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, strings.Repeat("─", 60)))

			labels := make([]string, len(leads))
			for i, l := range leads {
				sevColor := tui.Gray
				switch strings.ToLower(l.Severity) {
				case "critical":
					sevColor = tui.Red
				case "high":
					sevColor = tui.Yellow
				case "medium":
					sevColor = tui.Cyan
				}
				entity := l.Entity
				if len(entity) > 30 {
					entity = entity[:27] + "..."
				}
				fmt.Fprintf(w, "  %-8s  %-10s  %-30s  %.1f\n",
					tui.C(sevColor, l.Severity), l.SignalType, entity, l.CVSS)
				labels[i] = fmt.Sprintf("[%.1f] %s — %s", l.CVSS, l.Entity, l.Severity)
			}
			fmt.Fprintln(w)

			// Let user select a lead for investigation
			plan := state.GetString(KeyPlan)
			if plan == "free" {
				fmt.Fprintf(w, "  %s Upgrade to Pro to run investigations on these leads.\n",
					tui.C(tui.Gray, "ℹ"))
				return StepResult{}
			}

			selIdx, err := tui.Select("  Select a lead to investigate:", labels)
			if err != nil {
				return StepResult{BackToMenu: true}
			}

			// Store selected lead for the next step
			state.Set("selected_lead_id", leads[selIdx].LeadID)
			state.Set("selected_lead_entity", leads[selIdx].Entity)

			return StepResult{}
		},
	)
}

// Step 5: Run Investigation
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

			spin := tui.NewSpinner(fmt.Sprintf("Investigating %s...", leadEntity))
			result, err := TriggerAnalysis(ctx, cfg, token, leadID)
			if err != nil {
				spin.Fail("Investigation failed")
				return StepResult{Error: err}
			}
			spin.Success("Investigation complete")
			fmt.Fprintln(w)

			// Aggregate score
			scoreColor := tui.Green
			if result.Score >= 70 {
				scoreColor = tui.Red
			} else if result.Score >= 40 {
				scoreColor = tui.Yellow
			}
			tui.TableRow(w, "Aggregate Score", tui.C(scoreColor, fmt.Sprintf("%.1f / 100", result.Score)))

			// Service breakdown
			if len(result.Breakdown) > 0 {
				fmt.Fprintf(w, "\n  %s\n", tui.C(tui.Bold, "Service Breakdown:"))
				for _, s := range result.Breakdown {
					fmt.Fprintf(w, "    %-12s  %.1f (weight: %.0f%%)\n",
						s.Service, s.Score, s.Weight*100)
				}
			}

			// Synthesis summary
			if result.Summary != "" {
				fmt.Fprintf(w, "\n  %s\n", tui.C(tui.Bold, "Synthesis:"))
				fmt.Fprintf(w, "  %s\n", result.Summary)
			}

			// Data gaps
			if len(result.DataGaps) > 0 {
				fmt.Fprintf(w, "\n  %s\n", tui.C(tui.Bold, "Data Gaps:"))
				for _, g := range result.DataGaps {
					fmt.Fprintf(w, "    %s %s\n", tui.C(tui.Yellow, "•"), g)
				}
			}

			invCount := state.GetInt(KeyInvestigationCount)
			state.Set(KeyInvestigationCount, invCount+1)

			return StepResult{}
		},
	)
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
			fmt.Fprintf(w, "  %s Report saved to %s\n", tui.C(tui.Green, "✓"), absPath)

			compile, err := tui.Confirm("  Compile to PDF with pdflatex?", false)
			if err == nil && compile {
				spin := tui.NewSpinner("Compiling PDF...")
				if compileErr := compileLaTeX(filename); compileErr != nil {
					spin.Fail("Compilation failed")
					fmt.Fprintf(w, "  %s %v\n", tui.C(tui.Yellow, "!"), compileErr)
					fmt.Fprintf(w, "  %s Ensure pdflatex is installed (e.g. brew install mactex)\n",
						tui.C(tui.Gray, "ℹ"))
				} else {
					pdfFile := strings.TrimSuffix(filename, ".tex") + ".pdf"
					spin.Success(fmt.Sprintf("PDF: %s", pdfFile))
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

// Step 7: Draft Outreach
func stepProspectOutreach(cfg *config.Config, st store.Store) Step {
	return NewStep(
		"prospect.outreach", "Draft Outreach",
		func(state *State) bool {
			return state.GetString(KeyRole) != "admin"
		},
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			targetName := state.GetString(KeyTargetName)
			if targetName == "" {
				fmt.Fprintf(w, "  %s No target selected.\n", tui.C(tui.Yellow, "!"))
				return StepResult{Done: true}
			}

			ok, err := tui.Confirm(fmt.Sprintf("  Draft outreach email for %s?", targetName), true)
			if err != nil || !ok {
				return StepResult{Done: true}
			}

			token, err := loadToken(st)
			if err != nil {
				return StepResult{Error: err}
			}

			targetID := state.GetString(KeyTargetID)
			spin := tui.NewSpinner("Drafting outreach...")
			data, err := util.ServicePost(ctx, cfg.APIOrigin,
				"/v1/prospect/outreach/draft", token,
				map[string]string{"target_id": targetID})
			if err != nil {
				spin.Fail("Draft failed")
				return StepResult{Error: err}
			}
			spin.Stop()

			// Show preview
			fmt.Fprintf(w, "\n%s\n", string(data))
			fmt.Fprintln(w)

			approve, err := tui.Confirm("  Approve and queue for sending?", false)
			if err != nil || !approve {
				fmt.Fprintf(w, "  %s Draft saved but not sent.\n", tui.C(tui.Gray, "ℹ"))
				return StepResult{Done: true}
			}

			spin = tui.NewSpinner("Approving...")
			_, err = util.ServicePost(ctx, cfg.APIOrigin,
				"/v1/prospect/outreach/approve", token,
				map[string]string{"target_id": targetID})
			if err != nil {
				spin.Fail("Approval failed")
				return StepResult{Error: err}
			}
			spin.Success("Outreach approved and queued")

			return StepResult{Done: true}
		},
	)
}
