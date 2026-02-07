package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"

	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/util"
)

// ---- helpers ----

func requireToken(st store.Store) (string, error) {
	tok, err := st.LoadToken()
	if err != nil {
		return "", err
	}
	if tok == nil || strings.TrimSpace(tok.AccessToken) == "" {
		return "", fmt.Errorf("not logged in; run `haiphen login`")
	}
	return tok.AccessToken, nil
}

func printJSON(data []byte) {
	var pretty any
	if err := json.Unmarshal(data, &pretty); err != nil {
		fmt.Println(string(data))
		return
	}
	out, _ := json.MarshalIndent(pretty, "", "  ")
	fmt.Println(string(out))
}

func printOrJSON(data []byte, asJSON bool, humanFn func([]byte)) {
	if asJSON {
		printJSON(data)
		return
	}
	humanFn(data)
}

// ---- haiphen services (aggregate health) ----

func cmdServices(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "services",
		Short: "Check health of all Haiphen services",
		RunE: func(cmd *cobra.Command, args []string) error {
			type result struct {
				Name   string `json:"name"`
				Origin string `json:"origin"`
				OK     bool   `json:"ok"`
				Ms     int64  `json:"ms"`
				Error  string `json:"error,omitempty"`
			}

			services := []struct {
				name   string
				origin string
			}{
				{"api", cfg.APIOrigin},
				{"secure", cfg.SecureOrigin},
				{"network", cfg.NetworkOrigin},
				{"graph", cfg.GraphOrigin},
				{"risk", cfg.RiskOrigin},
				{"causal", cfg.CausalOrigin},
				{"supply", cfg.SupplyOrigin},
			}

			results := make([]result, len(services))
			var wg sync.WaitGroup
			for i, svc := range services {
				wg.Add(1)
				go func(idx int, name, origin string) {
					defer wg.Done()
					start := time.Now()
					_, err := util.ServiceGet(cmd.Context(), origin, "/v1/health", "")
					ms := time.Since(start).Milliseconds()
					r := result{Name: name, Origin: origin, Ms: ms}
					if err != nil {
						r.OK = false
						r.Error = err.Error()
					} else {
						r.OK = true
					}
					results[idx] = r
				}(i, svc.name, svc.origin)
			}
			wg.Wait()

			if asJSON {
				out, _ := json.MarshalIndent(results, "", "  ")
				fmt.Println(string(out))
				return nil
			}

			fmt.Println("Haiphen Platform Status")
			fmt.Println(strings.Repeat("-", 50))
			for _, r := range results {
				status := "OK"
				if !r.OK {
					status = "FAIL"
				}
				fmt.Printf("  %-10s  %-6s  %4dms  %s\n", r.Name, status, r.Ms, r.Origin)
			}
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- haiphen metrics ----

func cmdMetrics(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "metrics",
		Short: "Query trading metrics from the API",
	}

	// metrics kpis
	var kpisJSON bool
	var kpisDate string
	kpis := &cobra.Command{
		Use:   "kpis",
		Short: "List KPI values",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			path := "/v1/metrics/kpis"
			if kpisDate != "" {
				path += "?date=" + kpisDate
			}
			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, path, token)
			if err != nil {
				return err
			}
			printOrJSON(data, kpisJSON, func(b []byte) {
				var out struct {
					Date  string `json:"date"`
					Items []struct {
						KPI   string `json:"kpi"`
						Value string `json:"value"`
					} `json:"items"`
				}
				if json.Unmarshal(b, &out) == nil {
					fmt.Printf("Date: %s\n\n", out.Date)
					for _, item := range out.Items {
						fmt.Printf("  %-40s %s\n", item.KPI, item.Value)
					}
				}
			})
			return nil
		},
	}
	kpis.Flags().BoolVar(&kpisJSON, "json", false, "Output as JSON")
	kpis.Flags().StringVar(&kpisDate, "date", "", "Date (YYYY-MM-DD)")

	// metrics series
	var seriesJSON bool
	var seriesKPI, seriesDate string
	var seriesLimit int
	series := &cobra.Command{
		Use:   "series",
		Short: "Get time series for a KPI",
		RunE: func(cmd *cobra.Command, args []string) error {
			if seriesKPI == "" {
				return fmt.Errorf("--kpi is required")
			}
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			path := fmt.Sprintf("/v1/metrics/series?kpi=%s&limit=%d", seriesKPI, seriesLimit)
			if seriesDate != "" {
				path += "&date=" + seriesDate
			}
			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, path, token)
			if err != nil {
				return err
			}
			printOrJSON(data, seriesJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	series.Flags().BoolVar(&seriesJSON, "json", false, "Output as JSON")
	series.Flags().StringVar(&seriesKPI, "kpi", "", "KPI name (required)")
	series.Flags().StringVar(&seriesDate, "date", "", "Date (YYYY-MM-DD)")
	series.Flags().IntVar(&seriesLimit, "limit", 100, "Max data points")

	// metrics assets
	var assetsJSON bool
	var assetsDate string
	assets := &cobra.Command{
		Use:   "assets",
		Short: "List portfolio assets",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			path := "/v1/metrics/portfolio-assets"
			if assetsDate != "" {
				path += "?date=" + assetsDate
			}
			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, path, token)
			if err != nil {
				return err
			}
			printOrJSON(data, assetsJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	assets.Flags().BoolVar(&assetsJSON, "json", false, "Output as JSON")
	assets.Flags().StringVar(&assetsDate, "date", "", "Date (YYYY-MM-DD)")

	cmd.AddCommand(kpis, series, assets)
	return cmd
}

// ---- haiphen secure ----

func cmdSecure(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "secure",
		Short: "Edge security scanning commands",
	}

	// secure scan
	var scanTarget, scanType string
	var scanJSON bool
	scan := &cobra.Command{
		Use:   "scan",
		Short: "Initiate a security scan",
		RunE: func(cmd *cobra.Command, args []string) error {
			if scanTarget == "" {
				return fmt.Errorf("--target is required")
			}
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			body := map[string]string{"target": scanTarget, "type": scanType}
			data, err := util.ServicePost(cmd.Context(), cfg.SecureOrigin, "/v1/secure/scan", token, body)
			if err != nil {
				return err
			}
			printOrJSON(data, scanJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	scan.Flags().StringVar(&scanTarget, "target", "", "Scan target (required)")
	scan.Flags().StringVar(&scanType, "type", "vulnerability", "Scan type: vulnerability, compliance, full")
	scan.Flags().BoolVar(&scanJSON, "json", false, "Output as JSON")

	// secure scans
	var scansJSON bool
	scans := &cobra.Command{
		Use:   "scans",
		Short: "List recent scans",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			data, err := util.ServiceGet(cmd.Context(), cfg.SecureOrigin, "/v1/secure/scans", token)
			if err != nil {
				return err
			}
			printOrJSON(data, scansJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	scans.Flags().BoolVar(&scansJSON, "json", false, "Output as JSON")

	// secure status
	var statusJSON bool
	status := &cobra.Command{
		Use:   "status",
		Short: "Show service status",
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := util.ServiceGet(cmd.Context(), cfg.SecureOrigin, "/v1/secure/status", "")
			if err != nil {
				return err
			}
			printOrJSON(data, statusJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	status.Flags().BoolVar(&statusJSON, "json", false, "Output as JSON")

	cmd.AddCommand(scan, scans, status)
	return cmd
}

// ---- haiphen network ----

func cmdNetwork(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "network",
		Short: "Network trace and protocol analysis",
	}

	// network trace
	var traceTarget, traceProtocol string
	var traceJSON bool
	trace := &cobra.Command{
		Use:   "trace",
		Short: "Start a network trace",
		RunE: func(cmd *cobra.Command, args []string) error {
			if traceTarget == "" {
				return fmt.Errorf("--target is required")
			}
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			body := map[string]string{"target": traceTarget, "protocol": traceProtocol}
			data, err := util.ServicePost(cmd.Context(), cfg.NetworkOrigin, "/v1/network/trace", token, body)
			if err != nil {
				return err
			}
			printOrJSON(data, traceJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	trace.Flags().StringVar(&traceTarget, "target", "", "Trace target (required)")
	trace.Flags().StringVar(&traceProtocol, "protocol", "modbus", "Protocol: modbus, opcua, mqtt")
	trace.Flags().BoolVar(&traceJSON, "json", false, "Output as JSON")

	// network traces
	var tracesJSON bool
	traces := &cobra.Command{
		Use:   "traces",
		Short: "List recent traces",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			data, err := util.ServiceGet(cmd.Context(), cfg.NetworkOrigin, "/v1/network/traces", token)
			if err != nil {
				return err
			}
			printOrJSON(data, tracesJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	traces.Flags().BoolVar(&tracesJSON, "json", false, "Output as JSON")

	// network protocols
	var protoJSON bool
	protocols := &cobra.Command{
		Use:   "protocols",
		Short: "List supported protocols",
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := util.ServiceGet(cmd.Context(), cfg.NetworkOrigin, "/v1/network/protocols", "")
			if err != nil {
				return err
			}
			printOrJSON(data, protoJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	protocols.Flags().BoolVar(&protoJSON, "json", false, "Output as JSON")

	cmd.AddCommand(trace, traces, protocols)
	return cmd
}

// ---- haiphen graph ----

func cmdGraph(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "graph",
		Short: "Knowledge graph queries and entity management",
	}

	// graph query
	var queryQ string
	var queryDepth int
	var queryJSON bool
	query := &cobra.Command{
		Use:   "query",
		Short: "Query the knowledge graph",
		RunE: func(cmd *cobra.Command, args []string) error {
			if queryQ == "" {
				return fmt.Errorf("--q is required")
			}
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			body := map[string]any{"q": queryQ, "depth": queryDepth}
			data, err := util.ServicePost(cmd.Context(), cfg.GraphOrigin, "/v1/graph/query", token, body)
			if err != nil {
				return err
			}
			printOrJSON(data, queryJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	query.Flags().StringVar(&queryQ, "q", "", "Graph query (required)")
	query.Flags().IntVar(&queryDepth, "depth", 2, "Traversal depth")
	query.Flags().BoolVar(&queryJSON, "json", false, "Output as JSON")

	// graph entities
	var entitiesJSON bool
	entities := &cobra.Command{
		Use:   "entities",
		Short: "List graph entities",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			data, err := util.ServiceGet(cmd.Context(), cfg.GraphOrigin, "/v1/graph/entities", token)
			if err != nil {
				return err
			}
			printOrJSON(data, entitiesJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	entities.Flags().BoolVar(&entitiesJSON, "json", false, "Output as JSON")

	// graph schema
	var schemaJSON bool
	schema := &cobra.Command{
		Use:   "schema",
		Short: "Show graph schema",
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := util.ServiceGet(cmd.Context(), cfg.GraphOrigin, "/v1/graph/schema", "")
			if err != nil {
				return err
			}
			printOrJSON(data, schemaJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	schema.Flags().BoolVar(&schemaJSON, "json", false, "Output as JSON")

	cmd.AddCommand(query, entities, schema)
	return cmd
}

// ---- haiphen risk ----

func cmdRisk(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "risk",
		Short: "Risk analysis and assessment",
	}

	// risk assess
	var assessScenario string
	var assessJSON bool
	assess := &cobra.Command{
		Use:   "assess",
		Short: "Run a risk assessment",
		RunE: func(cmd *cobra.Command, args []string) error {
			if assessScenario == "" {
				return fmt.Errorf("--scenario is required")
			}
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			body := map[string]string{"scenario": assessScenario}
			data, err := util.ServicePost(cmd.Context(), cfg.RiskOrigin, "/v1/risk/assess", token, body)
			if err != nil {
				return err
			}
			printOrJSON(data, assessJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	assess.Flags().StringVar(&assessScenario, "scenario", "", "Risk scenario (required)")
	assess.Flags().BoolVar(&assessJSON, "json", false, "Output as JSON")

	// risk models
	var modelsJSON bool
	models := &cobra.Command{
		Use:   "models",
		Short: "List available risk models",
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := util.ServiceGet(cmd.Context(), cfg.RiskOrigin, "/v1/risk/models", "")
			if err != nil {
				return err
			}
			printOrJSON(data, modelsJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	models.Flags().BoolVar(&modelsJSON, "json", false, "Output as JSON")

	// risk assessments
	var assessmentsJSON bool
	assessments := &cobra.Command{
		Use:   "assessments",
		Short: "List past assessments",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			data, err := util.ServiceGet(cmd.Context(), cfg.RiskOrigin, "/v1/risk/assessments", token)
			if err != nil {
				return err
			}
			printOrJSON(data, assessmentsJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	assessments.Flags().BoolVar(&assessmentsJSON, "json", false, "Output as JSON")

	cmd.AddCommand(assess, models, assessments)
	return cmd
}

// ---- haiphen causal ----

func cmdCausal(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "causal",
		Short: "Causal chain and root cause analysis",
	}

	// causal analyze
	var analyzeEvents string
	var analyzeJSON bool
	analyze := &cobra.Command{
		Use:   "analyze",
		Short: "Analyze causal chain from events",
		RunE: func(cmd *cobra.Command, args []string) error {
			if analyzeEvents == "" {
				return fmt.Errorf("--events is required (JSON array or file path)")
			}
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			// Parse events as inline JSON array
			var events []any
			if err := json.Unmarshal([]byte(analyzeEvents), &events); err != nil {
				return fmt.Errorf("--events must be a valid JSON array: %w", err)
			}

			body := map[string]any{"events": events}
			data, err := util.ServicePost(cmd.Context(), cfg.CausalOrigin, "/v1/causal/analyze", token, body)
			if err != nil {
				return err
			}
			printOrJSON(data, analyzeJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	analyze.Flags().StringVar(&analyzeEvents, "events", "", "Events JSON array (required)")
	analyze.Flags().BoolVar(&analyzeJSON, "json", false, "Output as JSON")

	// causal analyses
	var analysesJSON bool
	analyses := &cobra.Command{
		Use:   "analyses",
		Short: "List past analyses",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			data, err := util.ServiceGet(cmd.Context(), cfg.CausalOrigin, "/v1/causal/analyses", token)
			if err != nil {
				return err
			}
			printOrJSON(data, analysesJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	analyses.Flags().BoolVar(&analysesJSON, "json", false, "Output as JSON")

	cmd.AddCommand(analyze, analyses)
	return cmd
}

// ---- haiphen supply ----

func cmdSupply(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "supply",
		Short: "Supply chain intelligence",
	}

	// supply assess
	var supAssessSupplier string
	var supAssessJSON bool
	supAssess := &cobra.Command{
		Use:   "assess",
		Short: "Assess a supplier's risk profile",
		RunE: func(cmd *cobra.Command, args []string) error {
			if supAssessSupplier == "" {
				return fmt.Errorf("--supplier is required")
			}
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			body := map[string]string{"supplier": supAssessSupplier}
			data, err := util.ServicePost(cmd.Context(), cfg.SupplyOrigin, "/v1/supply/assess", token, body)
			if err != nil {
				return err
			}
			printOrJSON(data, supAssessJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	supAssess.Flags().StringVar(&supAssessSupplier, "supplier", "", "Supplier name (required)")
	supAssess.Flags().BoolVar(&supAssessJSON, "json", false, "Output as JSON")

	// supply suppliers
	var suppliersJSON bool
	suppliers := &cobra.Command{
		Use:   "suppliers",
		Short: "List tracked suppliers",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			data, err := util.ServiceGet(cmd.Context(), cfg.SupplyOrigin, "/v1/supply/suppliers", token)
			if err != nil {
				return err
			}
			printOrJSON(data, suppliersJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	suppliers.Flags().BoolVar(&suppliersJSON, "json", false, "Output as JSON")

	// supply alerts
	var alertsJSON bool
	alerts := &cobra.Command{
		Use:   "alerts",
		Short: "List supply chain alerts",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}
			data, err := util.ServiceGet(cmd.Context(), cfg.SupplyOrigin, "/v1/supply/alerts", token)
			if err != nil {
				return err
			}
			printOrJSON(data, alertsJSON, func(b []byte) { printJSON(b) })
			return nil
		},
	}
	alerts.Flags().BoolVar(&alertsJSON, "json", false, "Output as JSON")

	cmd.AddCommand(supAssess, suppliers, alerts)
	return cmd
}
