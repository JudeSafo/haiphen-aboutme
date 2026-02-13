package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/report"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/util"
)

func cmdProspect(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "prospect",
		Short: "Prospect engine — discover, analyze, and outreach",
	}

	cmd.AddCommand(
		cmdProspectList(cfg, st),
		cmdProspectGet(cfg, st),
		cmdProspectAnalyze(cfg, st),
		cmdProspectOutreach(cfg, st),
		cmdProspectSources(cfg, st),
		cmdProspectCrawl(cfg, st),
		cmdProspectSetKey(cfg, st),
		cmdProspectListKeys(cfg, st),
		cmdProspectDeleteKey(cfg, st),
		cmdProspectRules(cfg, st),
		cmdProspectRegressions(cfg, st),
		cmdProspectApprove(cfg, st),
		cmdProspectSend(cfg, st),
		cmdProspectInvestigate(cfg, st),
		cmdProspectInvestigation(cfg, st),
		cmdProspectInvestigations(cfg, st),
		cmdProspectSolve(cfg, st),
		cmdProspectReInvestigate(cfg, st),
		cmdProspectPipeline(cfg, st),
		cmdProspectTarget(cfg, st),
		cmdProspectReport(cfg, st),
	)
	return cmd
}

// ---- prospect list ----

func cmdProspectList(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON     bool
		status     string
		source     string
		severity   string
		signalType string
		limit      int
	)

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List prospect leads with optional filters",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			params := url.Values{}
			if status != "" {
				params.Set("status", status)
			}
			if source != "" {
				params.Set("source", source)
			}
			if severity != "" {
				params.Set("severity", severity)
			}
			if signalType != "" {
				params.Set("signal_type", signalType)
			}
			if limit > 0 {
				params.Set("limit", fmt.Sprintf("%d", limit))
			}

			path := "/v1/prospect/leads"
			if len(params) > 0 {
				path += "?" + params.Encode()
			}

			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, path, token)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					Items []struct {
						LeadID              string  `json:"lead_id"`
						EntityName          string  `json:"entity_name"`
						EntityType          string  `json:"entity_type"`
						VulnerabilityID     string  `json:"vulnerability_id"`
						Severity            string  `json:"severity"`
						CvssScore           float64 `json:"cvss_score"`
						ImpactScore         float64 `json:"impact_score"`
						SignalType          string  `json:"signal_type"`
						Status              string  `json:"status"`
						InvestigationStatus string  `json:"investigation_status"`
						SourceID            string  `json:"source_id"`
						CreatedAt           string  `json:"created_at"`
					} `json:"items"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("%-10s %-12s %-8s %-20s %-18s %-6s %-10s %-14s %s\n",
						"SEVERITY", "SIGNAL", "SOURCE", "ENTITY", "SIGNAL ID", "SCORE", "STATUS", "INVESTIGATED", "CREATED")
					fmt.Println(strings.Repeat("-", 120))
					for _, item := range out.Items {
						name := item.EntityName
						if len(name) > 20 {
							name = name[:17] + "..."
						}
						sigID := item.VulnerabilityID
						if len(sigID) > 18 {
							sigID = sigID[:15] + "..."
						}
						invStatus := item.InvestigationStatus
						if invStatus == "" {
							invStatus = "-"
						}
						signal := item.SignalType
						if signal == "" {
							signal = "vuln"
						}
						// Show CVSS for vulnerability, impact_score for others
						score := item.CvssScore
						if item.SignalType != "" && item.SignalType != "vulnerability" {
							score = item.ImpactScore
						}
						scoreStr := "-"
						if score > 0 {
							scoreStr = fmt.Sprintf("%.1f", score)
						}
						fmt.Printf("%-10s %-12s %-8s %-20s %-18s %-6s %-10s %-14s %s\n",
							item.Severity, signal, item.SourceID, name, sigID, scoreStr, item.Status, invStatus, item.CreatedAt[:10])
					}
					fmt.Printf("\n%d leads\n", len(out.Items))
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&status, "status", "", "Filter by status (new, analyzing, analyzed, etc.)")
	cmd.Flags().StringVar(&source, "source", "", "Filter by source (nvd, osv, github-advisory, shodan, sec-edgar, infra-scan)")
	cmd.Flags().StringVar(&severity, "severity", "", "Filter by severity (critical, high, medium, low)")
	cmd.Flags().StringVar(&signalType, "signal-type", "", "Filter by signal type (vulnerability, regulatory, performance, incident)")
	cmd.Flags().IntVar(&limit, "limit", 0, "Max results")
	return cmd
}

// ---- prospect get ----

func cmdProspectGet(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "get <lead_id>",
		Short: "Get full detail for a prospect lead",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			path := "/v1/prospect/leads/" + args[0]
			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, path, token)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- prospect analyze ----

func cmdProspectAnalyze(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON  bool
		service string
	)

	cmd := &cobra.Command{
		Use:   "analyze <lead_id>",
		Short: "Trigger Haiphen analysis on a prospect lead",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			body := map[string]string{}
			if service != "" {
				body["service"] = service
			}

			path := "/v1/prospect/leads/" + args[0] + "/analyze"
			data, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, path, token, body)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&service, "service", "", "Specific service to run (secure, network, graph, risk, causal, supply)")
	return cmd
}

// ---- prospect outreach ----

func cmdProspectOutreach(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "outreach <lead_id>",
		Short: "Draft infrastructure advisory outreach for a lead",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			path := "/v1/prospect/leads/" + args[0] + "/outreach"
			data, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, path, token, nil)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- prospect sources ----

func cmdProspectSources(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "sources",
		Short: "List crawl sources and their stats",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, "/v1/prospect/sources", token)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					Items []struct {
						SourceID      string `json:"source_id"`
						Name          string `json:"name"`
						Enabled       int    `json:"enabled"`
						LastCrawledAt string `json:"last_crawled_at"`
						RateLimitRPM  int    `json:"rate_limit_rpm"`
					} `json:"items"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("%-18s %-30s %-8s %-8s %s\n",
						"SOURCE", "NAME", "ENABLED", "RPM", "LAST CRAWLED")
					fmt.Println(strings.Repeat("-", 80))
					for _, s := range out.Items {
						enabled := "yes"
						if s.Enabled == 0 {
							enabled = "no"
						}
						lastCrawled := "never"
						if s.LastCrawledAt != "" {
							lastCrawled = s.LastCrawledAt[:19]
						}
						fmt.Printf("%-18s %-30s %-8s %-8d %s\n",
							s.SourceID, s.Name, enabled, s.RateLimitRPM, lastCrawled)
					}
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- prospect crawl ----

func cmdProspectCrawl(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON bool
		source string
	)

	cmd := &cobra.Command{
		Use:   "crawl",
		Short: "Manually trigger a prospect crawl job (admin)",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			body := map[string]string{}
			if source != "" {
				body["source"] = source
			}

			data, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, "/v1/prospect/crawl", token, body)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&source, "source", "", "Crawl specific source only")
	return cmd
}

// ---- prospect set-key ----

func cmdProspectSetKey(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		usePrompt bool
		label     string
	)

	cmd := &cobra.Command{
		Use:   "set-key <provider>",
		Short: "Store an API key for a prospect data source (nvd, github, shodan)",
		Long: `Opens your browser to the Haiphen profile credentials page where you can
securely enter your API key. Use --prompt to enter the key directly in the
terminal (input is masked). Keys are never passed as CLI arguments to avoid
leaking them into shell history.`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			provider := args[0]
			valid := map[string]bool{"nvd": true, "github": true, "shodan": true}
			if !valid[provider] {
				return fmt.Errorf("invalid provider %q; must be one of: nvd, github, shodan", provider)
			}

			// Default: open browser to profile credentials tab
			if !usePrompt {
				profileURL := "https://haiphen.io/#profile/credentials"
				fmt.Printf("Opening browser to manage %s credential...\n", provider)
				if err := util.OpenBrowser(profileURL); err != nil {
					fmt.Printf("Could not open browser: %v\n", err)
					fmt.Println("Falling back to terminal prompt.")
				} else {
					fmt.Println("Enter your API key in the browser form.")
					fmt.Println("Use --prompt to enter it directly in the terminal instead.")
					return nil
				}
			}

			// Secure stdin prompt (--prompt flag or browser fallback)
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			fmt.Printf("Enter %s API key (input hidden): ", provider)
			keyBytes, err := term.ReadPassword(int(os.Stdin.Fd()))
			fmt.Println() // newline after hidden input
			if err != nil {
				return fmt.Errorf("failed to read key: %w", err)
			}

			key := strings.TrimSpace(string(keyBytes))
			if key == "" {
				return fmt.Errorf("API key cannot be empty")
			}

			body := map[string]string{"api_key": key}
			if label != "" {
				body["label"] = label
			}

			path := "/v1/prospect/credentials/" + provider
			_, err = util.ServicePut(cmd.Context(), cfg.APIOrigin, path, token, body)
			if err != nil {
				return err
			}

			fmt.Printf("Credential stored for %s\n", provider)
			return nil
		},
	}

	cmd.Flags().BoolVar(&usePrompt, "prompt", false, "Enter key via secure terminal prompt instead of browser")
	cmd.Flags().StringVar(&label, "label", "", "Optional label for this key")
	return cmd
}

// ---- prospect list-keys ----

func cmdProspectListKeys(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "list-keys",
		Short: "List stored prospect API keys (metadata only, no secrets)",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, "/v1/prospect/credentials", token)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					Items []struct {
						Provider  string `json:"provider"`
						Label     string `json:"label"`
						UpdatedAt string `json:"updated_at"`
					} `json:"items"`
				}
				if json.Unmarshal(b, &out) == nil {
					if len(out.Items) == 0 {
						fmt.Println("No stored credentials")
						return
					}
					fmt.Printf("%-12s %-30s %s\n", "PROVIDER", "LABEL", "UPDATED")
					fmt.Println(strings.Repeat("-", 60))
					for _, item := range out.Items {
						lbl := item.Label
						if lbl == "" {
							lbl = "-"
						}
						fmt.Printf("%-12s %-30s %s\n", item.Provider, lbl, item.UpdatedAt[:19])
					}
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- prospect delete-key ----

func cmdProspectDeleteKey(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "delete-key <provider>",
		Short: "Delete a stored prospect API key (nvd, github, shodan)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			provider := args[0]
			valid := map[string]bool{"nvd": true, "github": true, "shodan": true}
			if !valid[provider] {
				return fmt.Errorf("invalid provider %q; must be one of: nvd, github, shodan", provider)
			}

			token, err := requireToken(st)
			if err != nil {
				return err
			}

			path := "/v1/prospect/credentials/" + provider
			_, err = util.ServiceDelete(cmd.Context(), cfg.APIOrigin, path, token)
			if err != nil {
				return err
			}

			fmt.Printf("Credential deleted for %s\n", provider)
			return nil
		},
	}

	return cmd
}

// ---- prospect rules ----

func cmdProspectRules(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "rules",
		Short: "List use case rules (ordered by priority)",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, "/v1/prospect/rules", token)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					Items []struct {
						RuleID       string  `json:"rule_id"`
						Name         string  `json:"name"`
						Priority     int     `json:"priority"`
						Enabled      int     `json:"enabled"`
						MatchKeywords string `json:"match_keywords"`
						ServicesJSON string  `json:"services_json"`
					} `json:"items"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("%-26s %-30s %-6s %-8s %-30s %s\n",
						"RULE ID", "NAME", "PRI", "ENABLED", "KEYWORDS", "SERVICES")
					fmt.Println(strings.Repeat("-", 130))
					for _, r := range out.Items {
						name := r.Name
						if len(name) > 30 {
							name = name[:27] + "..."
						}
						kw := r.MatchKeywords
						if len(kw) > 30 {
							kw = kw[:27] + "..."
						}
						enabled := "yes"
						if r.Enabled == 0 {
							enabled = "no"
						}
						fmt.Printf("%-26s %-30s %-6d %-8s %-30s %s\n",
							r.RuleID, name, r.Priority, enabled, kw, r.ServicesJSON)
					}
					fmt.Printf("\n%d rules\n", len(out.Items))
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- prospect regressions ----

func cmdProspectRegressions(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON    bool
		dimension string
		minCount  int
		limit     int
	)

	cmd := &cobra.Command{
		Use:   "regressions",
		Short: "List prospect regressions (entity recurrence + vuln class spread)",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			params := url.Values{}
			if dimension != "" {
				params.Set("dimension", dimension)
			}
			if minCount > 0 {
				params.Set("min_count", fmt.Sprintf("%d", minCount))
			}
			if limit > 0 {
				params.Set("limit", fmt.Sprintf("%d", limit))
			}

			path := "/v1/prospect/regressions"
			if len(params) > 0 {
				path += "?" + params.Encode()
			}

			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, path, token)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					Items []struct {
						Dimension      string `json:"dimension"`
						Key            string `json:"key"`
						OccurrenceCount int   `json:"occurrence_count"`
						SeverityTrend  string `json:"severity_trend"`
						FirstSeenAt    string `json:"first_seen_at"`
						LastSeenAt     string `json:"last_seen_at"`
					} `json:"items"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("%-12s %-30s %-6s %-12s %-20s %s\n",
						"DIMENSION", "KEY", "COUNT", "TREND", "FIRST SEEN", "LAST SEEN")
					fmt.Println(strings.Repeat("-", 100))
					for _, r := range out.Items {
						key := r.Key
						if len(key) > 30 {
							key = key[:27] + "..."
						}
						trend := r.SeverityTrend
						if trend == "" {
							trend = "-"
						}
						first := r.FirstSeenAt
						if len(first) > 19 {
							first = first[:19]
						}
						last := r.LastSeenAt
						if len(last) > 19 {
							last = last[:19]
						}
						fmt.Printf("%-12s %-30s %-6d %-12s %-20s %s\n",
							r.Dimension, key, r.OccurrenceCount, trend, first, last)
					}
					fmt.Printf("\n%d regressions\n", len(out.Items))
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&dimension, "dimension", "", "Filter by dimension (entity, vuln_class)")
	cmd.Flags().IntVar(&minCount, "min-count", 0, "Minimum occurrence count")
	cmd.Flags().IntVar(&limit, "limit", 0, "Max results")
	return cmd
}

// ---- prospect approve ----

func cmdProspectApprove(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "approve <lead_id>",
		Short: "Approve an outreach draft for sending",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			path := "/v1/prospect/leads/" + args[0] + "/outreach/approve"
			data, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, path, token, nil)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					OK         bool   `json:"ok"`
					OutreachID string `json:"outreach_id"`
					Status     string `json:"status"`
				}
				if json.Unmarshal(b, &out) == nil && out.OK {
					fmt.Printf("Outreach %s approved for sending\n", out.OutreachID)
				} else {
					printJSON(b)
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- prospect send ----

func cmdProspectSend(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON         bool
		recipientEmail string
		recipientName  string
	)

	cmd := &cobra.Command{
		Use:   "send <lead_id>",
		Short: "Send approved outreach email for a lead",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			body := map[string]string{}
			if recipientEmail != "" {
				body["recipient_email"] = recipientEmail
			}
			if recipientName != "" {
				body["recipient_name"] = recipientName
			}

			path := "/v1/prospect/leads/" + args[0] + "/outreach/send"
			data, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, path, token, body)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					OK             bool   `json:"ok"`
					MessageID      string `json:"message_id"`
					OutreachID     string `json:"outreach_id"`
					RecipientEmail string `json:"recipient_email"`
					Status         string `json:"status"`
				}
				if json.Unmarshal(b, &out) == nil && out.OK {
					fmt.Printf("Outreach %s sent to %s (message: %s)\n", out.OutreachID, out.RecipientEmail, out.MessageID)
				} else {
					printJSON(b)
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&recipientEmail, "email", "", "Override recipient email address")
	cmd.Flags().StringVar(&recipientName, "name", "", "Override recipient name")
	return cmd
}

// ---- prospect investigate ----

func cmdProspectInvestigate(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "investigate <lead_id>",
		Short: "Run closed-loop investigation pipeline on a lead",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			path := "/v1/prospect/leads/" + args[0] + "/investigate"
			data, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, path, token, nil)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					InvestigationID string  `json:"investigation_id"`
					AggregateScore  float64 `json:"aggregate_score"`
					BudgetLevel     string  `json:"budget_level"`
					ClaudeUsed      int     `json:"claude_used"`
					ClaudeSummary   *struct {
						Summary         string   `json:"summary"`
						Impact          string   `json:"impact"`
						Recommendations []string `json:"recommendations"`
					} `json:"claude_summary"`
					Steps []struct {
						Service        string   `json:"service"`
						Score          *float64 `json:"score"`
						Findings       []string `json:"findings"`
						Recommendation string   `json:"recommendation"`
						DurationMs     int      `json:"duration_ms"`
						Status         string   `json:"status"`
					} `json:"steps"`
					Requirements []struct {
						Category    string `json:"category"`
						Description string `json:"description"`
					} `json:"requirements"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("Investigation: %s\n", out.InvestigationID)
					fmt.Printf("Aggregate Score: %.1f  Budget: %s  Synthesis: deterministic\n\n", out.AggregateScore, out.BudgetLevel)

					fmt.Printf("%-10s %-8s %-6s %s\n", "SERVICE", "STATUS", "SCORE", "FINDINGS")
					fmt.Println(strings.Repeat("-", 80))
					for _, s := range out.Steps {
						scoreStr := "-"
						if s.Score != nil {
							scoreStr = fmt.Sprintf("%.0f", *s.Score)
						}
						findingsStr := strings.Join(s.Findings, "; ")
						if len(findingsStr) > 50 {
							findingsStr = findingsStr[:47] + "..."
						}
						fmt.Printf("%-10s %-8s %-6s %s\n", s.Service, s.Status, scoreStr, findingsStr)
					}

					if len(out.Requirements) > 0 {
						fmt.Printf("\nRequirements (%d):\n", len(out.Requirements))
						for _, r := range out.Requirements {
							fmt.Printf("  [%s] %s\n", r.Category, r.Description)
						}
					}

					if out.ClaudeSummary != nil {
						fmt.Printf("\nSynthesis:\n  %s\n", out.ClaudeSummary.Summary)
						fmt.Printf("  Impact: %s\n", out.ClaudeSummary.Impact)
						for _, r := range out.ClaudeSummary.Recommendations {
							fmt.Printf("  - %s\n", r)
						}
					}
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- prospect investigation ----

func cmdProspectInvestigation(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "investigation <investigation_id>",
		Short: "Get full details of an investigation",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			path := "/v1/prospect/investigations/" + args[0]
			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, path, token)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- prospect investigations ----

func cmdProspectInvestigations(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON bool
		leadID string
		status string
	)

	cmd := &cobra.Command{
		Use:   "investigations",
		Short: "List investigations with optional filters",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			params := url.Values{}
			if leadID != "" {
				params.Set("lead_id", leadID)
			}
			if status != "" {
				params.Set("status", status)
			}

			path := "/v1/prospect/investigations"
			if len(params) > 0 {
				path += "?" + params.Encode()
			}

			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, path, token)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					Items []struct {
						InvestigationID string  `json:"investigation_id"`
						LeadID          string  `json:"lead_id"`
						EntityName      string  `json:"entity_name"`
						VulnerabilityID string  `json:"vulnerability_id"`
						Severity        string  `json:"severity"`
						Status          string  `json:"status"`
						AggregateScore  float64 `json:"aggregate_score"`
						BudgetLevel     string  `json:"budget_level"`
						CreatedAt       string  `json:"created_at"`
					} `json:"items"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("%-38s %-20s %-18s %-10s %-12s %-8s %s\n",
						"INVESTIGATION", "ENTITY", "SIGNAL ID", "SEVERITY", "STATUS", "SCORE", "CREATED")
					fmt.Println(strings.Repeat("-", 120))
					for _, item := range out.Items {
						created := item.CreatedAt
						if len(created) > 10 {
							created = created[:10]
						}
						name := item.EntityName
						if len(name) > 20 {
							name = name[:17] + "..."
						}
						sigID := item.VulnerabilityID
						if len(sigID) > 18 {
							sigID = sigID[:15] + "..."
						}
						fmt.Printf("%-38s %-20s %-18s %-10s %-12s %-8.1f %s\n",
							item.InvestigationID, name, sigID, item.Severity,
							item.Status, item.AggregateScore, created)
					}
					fmt.Printf("\n%d investigations\n", len(out.Items))
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&leadID, "lead", "", "Filter by lead ID")
	cmd.Flags().StringVar(&status, "status", "", "Filter by status")
	return cmd
}

// ---- prospect solve ----

func cmdProspectSolve(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "solve <investigation_id>",
		Short: "Auto-resolve investigation requirements (add keywords, monitors, etc.)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			path := "/v1/prospect/investigations/" + args[0] + "/solve"
			data, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, path, token, nil)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					OK              bool     `json:"ok"`
					InvestigationID string   `json:"investigation_id"`
					ResolvedCount   int      `json:"resolved_count"`
					UnresolvedCount int      `json:"unresolved_count"`
					ActionsTaken    []string `json:"actions_taken"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("Investigation: %s\n", out.InvestigationID)
					fmt.Printf("Resolved: %d  Unresolved: %d\n\n", out.ResolvedCount, out.UnresolvedCount)
					if len(out.ActionsTaken) > 0 {
						fmt.Println("Actions taken:")
						for _, a := range out.ActionsTaken {
							fmt.Printf("  - %s\n", a)
						}
					}
					if out.UnresolvedCount > 0 {
						fmt.Printf("\n%d requirement(s) need manual resolution\n", out.UnresolvedCount)
					}
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- prospect re-investigate ----

func cmdProspectReInvestigate(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "re-investigate <lead_id>",
		Short: "Re-run investigation pipeline and compare risk scores",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			path := "/v1/prospect/leads/" + args[0] + "/re-investigate"
			data, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, path, token, nil)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					InvestigationID string   `json:"investigation_id"`
					RiskScoreBefore *float64 `json:"risk_score_before"`
					RiskScoreAfter  float64  `json:"risk_score_after"`
					RiskReduction   *float64 `json:"risk_reduction"`
					BudgetLevel     string   `json:"budget_level"`
					Steps           []struct {
						Service    string   `json:"service"`
						Score      *float64 `json:"score"`
						Findings   []string `json:"findings"`
						DurationMs int      `json:"duration_ms"`
						Status     string   `json:"status"`
					} `json:"steps"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("Re-investigation: %s\n", out.InvestigationID)
					if out.RiskScoreBefore != nil {
						fmt.Printf("Risk Before: %.1f  After: %.1f", *out.RiskScoreBefore, out.RiskScoreAfter)
						if out.RiskReduction != nil {
							delta := *out.RiskReduction
							if delta > 0 {
								fmt.Printf("  Reduction: %.1f (improved)\n", delta)
							} else if delta < 0 {
								fmt.Printf("  Change: +%.1f (worsened)\n", -delta)
							} else {
								fmt.Printf("  Change: 0 (unchanged)\n")
							}
						} else {
							fmt.Println()
						}
					} else {
						fmt.Printf("Risk Score: %.1f (no prior baseline)\n", out.RiskScoreAfter)
					}

					fmt.Printf("\n%-10s %-8s %-6s %s\n", "SERVICE", "STATUS", "SCORE", "FINDINGS")
					fmt.Println(strings.Repeat("-", 70))
					for _, s := range out.Steps {
						scoreStr := "-"
						if s.Score != nil {
							scoreStr = fmt.Sprintf("%.0f", *s.Score)
						}
						findingsStr := strings.Join(s.Findings, "; ")
						if len(findingsStr) > 45 {
							findingsStr = findingsStr[:42] + "..."
						}
						fmt.Printf("%-10s %-8s %-6s %s\n", s.Service, s.Status, scoreStr, findingsStr)
					}
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- prospect pipeline ----

func cmdProspectPipeline(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON     bool
		maxLeads   int
		threshold  float64
		signalType string
		targetName string
	)

	cmd := &cobra.Command{
		Use:   "pipeline",
		Short: "Run full prospect pipeline: crawl, investigate, draft outreach",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			// If --target is set, resolve and run targeted pipeline
			if targetName != "" {
				return runTargetedPipeline(cmd, cfg, st, token, targetName, maxLeads, threshold, asJSON)
			}

			// Step 1: Trigger crawl
			fmt.Println("[1/3] Triggering crawl...")
			_, err = util.ServicePost(cmd.Context(), cfg.APIOrigin, "/v1/prospect/crawl", token, nil)
			if err != nil {
				fmt.Printf("  Crawl trigger: %v (continuing)\n", err)
			} else {
				fmt.Println("  Crawl triggered")
			}

			// Step 2: Auto-investigate
			fmt.Printf("[2/3] Auto-investigating top %d leads...\n", maxLeads)
			invPayload := map[string]interface{}{
				"max_leads": maxLeads,
			}
			if signalType != "" {
				invPayload["signal_type"] = signalType
			}
			invData, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, "/v1/prospect/auto-investigate", token, invPayload)
			if err != nil {
				return fmt.Errorf("auto-investigate failed: %w", err)
			}

			var invOut struct {
				OK           bool `json:"ok"`
				Investigated int  `json:"investigated"`
				Leads        []struct {
					LeadID         string   `json:"lead_id"`
					AggregateScore float64  `json:"aggregate_score"`
					Threats        []string `json:"threats"`
				} `json:"leads"`
			}
			if err := json.Unmarshal(invData, &invOut); err != nil {
				return fmt.Errorf("parse auto-investigate response: %w", err)
			}

			fmt.Printf("  Investigated %d leads (synthesis: deterministic)\n", invOut.Investigated)

			// Step 3: Draft outreach for leads above threshold
			drafted := 0
			for _, lead := range invOut.Leads {
				if lead.AggregateScore >= threshold {
					fmt.Printf("[3/3] Drafting outreach for %s (score %.1f)...\n", lead.LeadID, lead.AggregateScore)
					outreachPayload := map[string]interface{}{}
					_, oErr := util.ServicePost(cmd.Context(), cfg.APIOrigin,
						"/v1/prospect/leads/"+lead.LeadID+"/outreach", token, outreachPayload)
					if oErr != nil {
						fmt.Printf("  Outreach draft failed for %s: %v\n", lead.LeadID, oErr)
					} else {
						drafted++
						fmt.Printf("  Outreach drafted for %s\n", lead.LeadID)
					}
				}
			}

			if asJSON {
				summary := map[string]interface{}{
					"investigated": invOut.Investigated,
					"drafted":      drafted,
					"leads":        invOut.Leads,
				}
				b, _ := json.MarshalIndent(summary, "", "  ")
				fmt.Println(string(b))
			} else {
				fmt.Printf("\nPipeline complete: %d investigated, %d outreach drafted (threshold %.0f)\n",
					invOut.Investigated, drafted, threshold)
			}

			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().IntVar(&maxLeads, "max-leads", 5, "Max leads to investigate")
	cmd.Flags().Float64Var(&threshold, "threshold", 60.0, "Min aggregate score for outreach draft")
	cmd.Flags().StringVar(&signalType, "signal-type", "", "Filter by signal type (vulnerability, regulatory, performance, incident)")
	cmd.Flags().StringVar(&targetName, "target", "", "Target company name or ID for targeted pipeline")
	return cmd
}

// runTargetedPipeline executes crawl→investigate→outreach→report for a single target company.
func runTargetedPipeline(cmd *cobra.Command, cfg *config.Config, _ store.Store, token, targetName string, maxLeads int, threshold float64, asJSON bool) error {
	// Step 1: Resolve target
	fmt.Printf("[1/4] Resolving target %q...\n", targetName)
	params := url.Values{"q": {targetName}, "limit": {"1"}}
	tData, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, "/v1/prospect/targets?"+params.Encode(), token)
	if err != nil {
		return fmt.Errorf("target lookup failed: %w", err)
	}

	var tOut struct {
		Items []struct {
			TargetID string `json:"target_id"`
			Name     string `json:"name"`
			Ticker   string `json:"ticker"`
		} `json:"items"`
	}
	if err := json.Unmarshal(tData, &tOut); err != nil || len(tOut.Items) == 0 {
		return fmt.Errorf("target %q not found", targetName)
	}
	target := tOut.Items[0]
	fmt.Printf("  Target: %s (%s) [%s]\n", target.Name, target.Ticker, target.TargetID)

	// Step 2: Targeted crawl
	fmt.Printf("[2/4] Crawling sources for %s...\n", target.Name)
	crawlData, err := util.ServicePost(cmd.Context(), cfg.APIOrigin,
		"/v1/prospect/targets/"+target.TargetID+"/crawl", token, nil)
	if err != nil {
		fmt.Printf("  Crawl: %v (continuing)\n", err)
	} else {
		var crawlOut struct {
			TotalFound   int `json:"total_found"`
			TotalWritten int `json:"total_written"`
		}
		if json.Unmarshal(crawlData, &crawlOut) == nil {
			fmt.Printf("  Found %d signals, %d new leads written\n", crawlOut.TotalFound, crawlOut.TotalWritten)
		}
	}

	// Step 3: Auto-investigate targeted leads
	fmt.Printf("[3/4] Investigating top %d leads...\n", maxLeads)
	invPayload := map[string]interface{}{
		"max_leads": maxLeads,
		"target_id": target.TargetID,
	}
	invData, err := util.ServicePost(cmd.Context(), cfg.APIOrigin,
		"/v1/prospect/auto-investigate", token, invPayload)
	if err != nil {
		return fmt.Errorf("auto-investigate failed: %w", err)
	}

	var invOut struct {
		OK           bool `json:"ok"`
		Investigated int  `json:"investigated"`
		Leads        []struct {
			LeadID         string   `json:"lead_id"`
			AggregateScore float64  `json:"aggregate_score"`
			Threats        []string `json:"threats"`
		} `json:"leads"`
	}
	if err := json.Unmarshal(invData, &invOut); err != nil {
		return fmt.Errorf("parse investigate response: %w", err)
	}
	fmt.Printf("  Investigated %d leads\n", invOut.Investigated)

	// Step 4: Draft outreach for leads above threshold
	drafted := 0
	for _, lead := range invOut.Leads {
		if lead.AggregateScore >= threshold {
			fmt.Printf("[4/4] Drafting outreach for %s (score %.1f)...\n", lead.LeadID, lead.AggregateScore)
			_, oErr := util.ServicePost(cmd.Context(), cfg.APIOrigin,
				"/v1/prospect/leads/"+lead.LeadID+"/outreach", token, map[string]interface{}{})
			if oErr != nil {
				fmt.Printf("  Outreach draft failed for %s: %v\n", lead.LeadID, oErr)
			} else {
				drafted++
			}
		}
	}

	if asJSON {
		summary := map[string]interface{}{
			"target":       target,
			"investigated": invOut.Investigated,
			"drafted":      drafted,
			"leads":        invOut.Leads,
		}
		b, _ := json.MarshalIndent(summary, "", "  ")
		fmt.Println(string(b))
	} else {
		fmt.Printf("\nTargeted pipeline complete for %s: %d investigated, %d outreach drafted\n",
			target.Name, invOut.Investigated, drafted)
		fmt.Printf("Generate report: haiphen prospect report %q\n", target.Name)
	}

	return nil
}

// ---- prospect target ----

func cmdProspectTarget(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "target",
		Short: "Manage prospect targets (Fortune 500 companies)",
	}

	cmd.AddCommand(
		cmdProspectTargetList(cfg, st),
		cmdProspectTargetGet(cfg, st),
		cmdProspectTargetAdd(cfg, st),
		cmdProspectTargetRemove(cfg, st),
	)
	return cmd
}

func cmdProspectTargetList(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON bool
		sector string
		query  string
		limit  int
	)

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List prospect targets",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			params := url.Values{}
			if sector != "" {
				params.Set("sector", sector)
			}
			if query != "" {
				params.Set("q", query)
			}
			if limit > 0 {
				params.Set("limit", fmt.Sprintf("%d", limit))
			}

			path := "/v1/prospect/targets"
			if len(params) > 0 {
				path += "?" + params.Encode()
			}

			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, path, token)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					Items []struct {
						TargetID           string `json:"target_id"`
						Name               string `json:"name"`
						Ticker             string `json:"ticker"`
						Sector             string `json:"sector"`
						Status             string `json:"status"`
						LeadCount          int    `json:"lead_count"`
						InvestigationCount int    `json:"investigation_count"`
					} `json:"items"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("%-24s %-26s %-6s %-16s %-8s %-6s %s\n",
						"TARGET ID", "NAME", "TICK", "SECTOR", "STATUS", "LEADS", "INVEST")
					fmt.Println(strings.Repeat("-", 100))
					for _, t := range out.Items {
						name := t.Name
						if len(name) > 26 {
							name = name[:23] + "..."
						}
						sect := t.Sector
						if len(sect) > 16 {
							sect = sect[:13] + "..."
						}
						tick := t.Ticker
						if tick == "" {
							tick = "-"
						}
						fmt.Printf("%-24s %-26s %-6s %-16s %-8s %-6d %d\n",
							t.TargetID, name, tick, sect, t.Status, t.LeadCount, t.InvestigationCount)
					}
					fmt.Printf("\n%d targets\n", len(out.Items))
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&sector, "sector", "", "Filter by sector (Financials, Technology, etc.)")
	cmd.Flags().StringVar(&query, "q", "", "Search by name")
	cmd.Flags().IntVar(&limit, "limit", 0, "Max results")
	return cmd
}

func cmdProspectTargetGet(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "get <target_id_or_name>",
		Short: "Get full target profile with lead and investigation summary",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			targetID := args[0]
			// If it doesn't look like a target_id, resolve by name
			if !strings.HasPrefix(targetID, "t-") {
				targetID, err = resolveTargetID(cmd, cfg, token, args[0])
				if err != nil {
					return err
				}
			}

			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, "/v1/prospect/targets/"+targetID, token)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

func cmdProspectTargetAdd(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON   bool
		name     string
		ticker   string
		domain   string
		cik      string
		industry string
		sector   string
	)

	cmd := &cobra.Command{
		Use:   "add",
		Short: "Add a new prospect target",
		RunE: func(cmd *cobra.Command, args []string) error {
			if name == "" {
				return fmt.Errorf("--name is required")
			}

			token, err := requireToken(st)
			if err != nil {
				return err
			}

			body := map[string]interface{}{"name": name}
			if ticker != "" {
				body["ticker"] = ticker
			}
			if domain != "" {
				body["domains"] = fmt.Sprintf("[%q]", domain)
			}
			if cik != "" {
				body["cik"] = cik
			}
			if industry != "" {
				body["industry"] = industry
			}
			if sector != "" {
				body["sector"] = sector
			}

			data, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, "/v1/prospect/targets", token, body)
			if err != nil {
				return err
			}

			printOrJSON(data, asJSON, func(b []byte) {
				var out struct {
					OK       bool   `json:"ok"`
					TargetID string `json:"target_id"`
				}
				if json.Unmarshal(b, &out) == nil && out.OK {
					fmt.Printf("Target created: %s\n", out.TargetID)
				} else {
					printJSON(b)
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&name, "name", "", "Company name (required)")
	cmd.Flags().StringVar(&ticker, "ticker", "", "Stock ticker")
	cmd.Flags().StringVar(&domain, "domain", "", "Primary domain")
	cmd.Flags().StringVar(&cik, "cik", "", "SEC CIK number")
	cmd.Flags().StringVar(&industry, "industry", "", "Industry")
	cmd.Flags().StringVar(&sector, "sector", "", "Sector")
	return cmd
}

func cmdProspectTargetRemove(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "remove <target_id>",
		Short: "Archive a prospect target (soft delete)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			_, err = util.ServiceDelete(cmd.Context(), cfg.APIOrigin, "/v1/prospect/targets/"+args[0], token)
			if err != nil {
				return err
			}

			fmt.Printf("Target %s archived\n", args[0])
			return nil
		},
	}
	return cmd
}

// ---- prospect report ----

func cmdProspectReport(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON  bool
		output  string
		compile bool
	)

	cmd := &cobra.Command{
		Use:   "report <target_name_or_id>",
		Short: "Generate a LaTeX research report for a target company",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			targetID := args[0]
			if !strings.HasPrefix(targetID, "t-") {
				targetID, err = resolveTargetID(cmd, cfg, token, args[0])
				if err != nil {
					return err
				}
			}

			fmt.Printf("Generating report for %s...\n", targetID)

			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin,
				"/v1/prospect/targets/"+targetID+"/report?format=latex", token)
			if err != nil {
				return err
			}

			if asJSON {
				result := map[string]string{
					"target_id": targetID,
					"format":    "latex",
					"content":   string(data),
				}
				b, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(b))
				return nil
			}

			// Determine output path
			outPath := output
			if outPath == "" {
				slug := strings.ReplaceAll(targetID, "t-", "")
				date := time.Now().Format("2006-01-02")
				outPath = fmt.Sprintf("haiphen-report-%s-%s.tex", slug, date)
			}

			if err := os.WriteFile(outPath, data, 0644); err != nil {
				return fmt.Errorf("write report: %w", err)
			}
			fmt.Printf("Report saved: %s\n", outPath)

			// Optionally compile to PDF
			if compile {
				fmt.Println("Compiling LaTeX to PDF...")
				outDir := filepath.Dir(outPath)
				if outDir == "" || outDir == "." {
					outDir, _ = os.Getwd()
				}

				// Extract logo file alongside .tex for \includegraphics
				if err := report.WriteLogoFile(outDir); err != nil {
					fmt.Printf("  Warning: could not write logo: %v\n", err)
				}

				pdfPath := strings.TrimSuffix(outPath, filepath.Ext(outPath)) + ".pdf"
				// Run pdflatex twice for LastPage ref resolution.
				// pdflatex may exit non-zero on first run (e.g. font generation) but
				// still produce a valid PDF, so always attempt the second pass and
				// check for the output file rather than relying solely on exit code.
				_ = util.RunCommand("pdflatex", "-interaction=nonstopmode", "-output-directory="+outDir, outPath)
				_ = util.RunCommand("pdflatex", "-interaction=nonstopmode", "-output-directory="+outDir, outPath)

				if _, statErr := os.Stat(pdfPath); statErr != nil {
					fmt.Println("  pdflatex failed to produce PDF.")
					fmt.Println("  Install TeX Live (brew install --cask mactex) or compile manually.")
				} else {
					fmt.Printf("PDF generated: %s\n", pdfPath)
				}
			}

			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&output, "output", "", "Output file path (default: haiphen-report-{slug}-{date}.tex)")
	cmd.Flags().BoolVar(&compile, "compile", false, "Compile LaTeX to PDF using pdflatex")
	return cmd
}

// resolveTargetID looks up a target by name and returns its target_id.
func resolveTargetID(cmd *cobra.Command, cfg *config.Config, token, name string) (string, error) {
	params := url.Values{"q": {name}, "limit": {"1"}}
	data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, "/v1/prospect/targets?"+params.Encode(), token)
	if err != nil {
		return "", fmt.Errorf("target lookup failed: %w", err)
	}
	var out struct {
		Items []struct {
			TargetID string `json:"target_id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(data, &out); err != nil || len(out.Items) == 0 {
		return "", fmt.Errorf("target %q not found", name)
	}
	return out.Items[0].TargetID, nil
}
