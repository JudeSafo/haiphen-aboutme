package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/haiphen/haiphen-cli/internal/config"
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
	)
	return cmd
}

// ---- prospect list ----

func cmdProspectList(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		asJSON   bool
		status   string
		source   string
		severity string
		limit    int
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
						LeadID          string  `json:"lead_id"`
						EntityName      string  `json:"entity_name"`
						EntityType      string  `json:"entity_type"`
						VulnerabilityID string  `json:"vulnerability_id"`
						Severity        string  `json:"severity"`
						CvssScore       float64 `json:"cvss_score"`
						Status          string  `json:"status"`
						SourceID        string  `json:"source_id"`
						CreatedAt       string  `json:"created_at"`
					} `json:"items"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("%-12s %-8s %-20s %-18s %-10s %s\n",
						"SEVERITY", "SOURCE", "ENTITY", "VULN ID", "STATUS", "CREATED")
					fmt.Println(strings.Repeat("-", 90))
					for _, item := range out.Items {
						name := item.EntityName
						if len(name) > 20 {
							name = name[:17] + "..."
						}
						vulnID := item.VulnerabilityID
						if len(vulnID) > 18 {
							vulnID = vulnID[:15] + "..."
						}
						fmt.Printf("%-12s %-8s %-20s %-18s %-10s %s\n",
							item.Severity, item.SourceID, name, vulnID, item.Status, item.CreatedAt[:10])
					}
					fmt.Printf("\n%d leads\n", len(out.Items))
				}
			})
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&status, "status", "", "Filter by status (new, analyzing, analyzed, etc.)")
	cmd.Flags().StringVar(&source, "source", "", "Filter by source (nvd, osv, github-advisory, shodan)")
	cmd.Flags().StringVar(&severity, "severity", "", "Filter by severity (critical, high, medium, low)")
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
		Short: "Draft responsible-disclosure outreach for a lead",
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
