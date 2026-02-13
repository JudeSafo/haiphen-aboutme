package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/haiphen/haiphen-cli/internal/broker"
	_ "github.com/haiphen/haiphen-cli/internal/broker/alpaca"
	brokertotp "github.com/haiphen/haiphen-cli/internal/broker/totp"
	"github.com/haiphen/haiphen-cli/internal/brokerstore"
	"github.com/haiphen/haiphen-cli/internal/config"
	sig "github.com/haiphen/haiphen-cli/internal/signal"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/tui"
	"github.com/haiphen/haiphen-cli/internal/util"
)

func cmdSignal(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "signal",
		Short: "Automated signal daemon — real-time arbitrage engine",
	}

	cmd.AddCommand(
		cmdSignalDaemon(cfg, st),
		cmdSignalStop(cfg),
		cmdSignalStatus(cfg),
		cmdSignalAdd(cfg, st),
		cmdSignalList(cfg),
		cmdSignalRemove(cfg),
		cmdSignalEnable(cfg),
		cmdSignalPause(cfg),
		cmdSignalTest(cfg, st),
		cmdSignalLog(cfg),
		cmdSignalSync(cfg, st),
		cmdSignalPositions(cfg, st),
		cmdSignalFilter(cfg),
	)
	return cmd
}

// ---- signal daemon ----

func cmdSignalDaemon(cfg *config.Config, st store.Store) *cobra.Command {
	var (
		foreground bool
		dryRun     bool
	)

	cmd := &cobra.Command{
		Use:   "daemon",
		Short: "Start the signal daemon (background by default)",
		Long:  "Start the signal daemon (background by default)\n\nRequires: Pro plan or higher\nUpgrade: https://haiphen.io/#pricing",
		Annotations: map[string]string{"tier": "pro", "audit": "1"},
		RunE: func(cmd *cobra.Command, args []string) error {
			// TOTP gate if enrolled
			if err := requireSignalTOTP(cfg); err != nil {
				return err
			}

			token, err := requireToken(st)
			if err != nil {
				return err
			}

			rulesDir, err := sig.SignalsDir(cfg.Profile)
			if err != nil {
				return err
			}

			// Check if already running
			if pid, running := sig.IsRunning(cfg.Profile); running {
				return fmt.Errorf("daemon already running (PID %d); stop with: haiphen signal stop", pid)
			}

			if !foreground {
				// Fork a background process
				exe, err := os.Executable()
				if err != nil {
					return err
				}

				forkArgs := []string{"signal", "daemon", "--foreground",
					"--api-origin", cfg.APIOrigin,
					"--profile", cfg.Profile}
				if dryRun {
					forkArgs = append(forkArgs, "--dry-run")
				}

				proc := exec.Command(exe, forkArgs...)
				proc.Env = append(os.Environ(), "HAIPHEN_SIGNAL_TOKEN="+token)
				proc.Stdout = nil
				proc.Stderr = nil
				proc.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

				if err := proc.Start(); err != nil {
					return fmt.Errorf("fork: %w", err)
				}

				fmt.Printf("%s Signal daemon started (PID %d)\n", tui.C(tui.Green, "✓"), proc.Process.Pid)
				if dryRun {
					fmt.Printf("  %s\n", tui.C(tui.Yellow, "DRY-RUN mode: rules evaluated but no orders placed"))
				}
				fmt.Printf("  %s haiphen signal status\n", tui.C(tui.Gray, "Check:"))
				fmt.Printf("  %s haiphen signal log\n", tui.C(tui.Gray, "Logs: "))
				fmt.Printf("  %s haiphen signal stop\n", tui.C(tui.Gray, "Stop: "))
				return nil
			}

			// Foreground mode — inherited token from env or from store
			envToken := os.Getenv("HAIPHEN_SIGNAL_TOKEN")
			if envToken != "" {
				token = envToken
			}

			// Setup logging
			logFile, err := sig.SetupLogger(cfg.Profile)
			if err != nil {
				return fmt.Errorf("setup logger: %w", err)
			}
			defer logFile.Close()

			// Write PID
			if err := sig.WritePID(cfg.Profile); err != nil {
				return fmt.Errorf("write pid: %w", err)
			}
			defer sig.RemovePID(cfg.Profile)

			// Load broker
			var b broker.Broker
			if !dryRun {
				b, err = loadBroker(cfg)
				if err != nil {
					sig.LogJSON("warn", "broker not available, orders disabled", map[string]interface{}{
						"error": err.Error(),
					})
				} else {
					if err := b.Connect(cmd.Context()); err != nil {
						sig.LogJSON("warn", "broker connect failed, orders disabled", map[string]interface{}{
							"error": err.Error(),
						})
						b = nil
					} else {
						defer b.Close()
					}
				}
			}

			// Engine config
			ecfg := sig.DefaultEngineConfig()
			ecfg.DryRun = dryRun
			ecfg.DaemonID = fmt.Sprintf("cli-%d", os.Getpid())
			ecfg.Safety = safetyConfig(cfg)
			ecfg.Safety.ConfirmOrders = false // Non-interactive

			events := make(chan sig.Event, 100)

			engine := sig.NewEngine(b, ecfg, events)

			ctx, cancel := context.WithCancel(cmd.Context())
			defer cancel()

			// Start event logger
			go sig.EventLogger(ctx, events, cfg.APIOrigin, token)

			// Signal handler
			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
			go func() {
				<-sigCh
				sig.LogJSON("info", "received shutdown signal", nil)
				cancel()
			}()

			dcfg := sig.DaemonConfig{
				Profile:     cfg.Profile,
				APIOrigin:   cfg.APIOrigin,
				Token:       token,
				RulesDir:    rulesDir,
				MaxOrderQty: cfg.BrokerMaxOrderQty,
			}

			return sig.RunDaemon(ctx, engine, dcfg)
		},
	}

	cmd.Flags().BoolVar(&foreground, "foreground", false, "Run in foreground (for debugging)")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Evaluate rules but never place orders")
	return cmd
}

// ---- signal stop ----

func cmdSignalStop(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "stop",
		Short: "Stop the running signal daemon",
		Long:  "Stop the running signal daemon\n\nRequires: Pro plan or higher\nUpgrade: https://haiphen.io/#pricing",
		Annotations: map[string]string{"tier": "pro", "audit": "1"},
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := sig.StopDaemon(cfg.Profile); err != nil {
				return err
			}
			fmt.Printf("%s Signal daemon stopped\n", tui.C(tui.Green, "✓"))
			return nil
		},
	}
}

// ---- signal status ----

func cmdSignalStatus(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show daemon status",
		Annotations: map[string]string{"tier": "free"},
		RunE: func(cmd *cobra.Command, args []string) error {
			pid, running := sig.IsRunning(cfg.Profile)
			if !running {
				fmt.Println("Signal daemon is not running")
				return nil
			}

			fmt.Printf("%s Signal daemon running\n", tui.C(tui.Green, "✓"))
			tui.TableRow(os.Stdout, "PID", fmt.Sprintf("%d", pid))
			tui.TableRow(os.Stdout, "Profile", cfg.Profile)

			// Show log tail
			logPath, _ := sig.LogPath(cfg.Profile)
			tui.TableRow(os.Stdout, "Log", logPath)

			// Count rules
			rulesDir, err := sig.SignalsDir(cfg.Profile)
			if err == nil {
				rules, _ := sig.LoadRulesFromDir(rulesDir)
				active := 0
				for _, r := range rules {
					if r.Status == "active" {
						active++
					}
				}
				tui.TableRow(os.Stdout, "Rules", fmt.Sprintf("%d active / %d total", active, len(rules)))
			}

			return nil
		},
	}
}

// ---- signal add ----

func cmdSignalAdd(cfg *config.Config, _ store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "add <file.yaml>",
		Short: "Import a signal rule from YAML",
		Long:  "Import a signal rule from YAML\n\nRequires: Pro plan or higher\nUpgrade: https://haiphen.io/#pricing",
		Annotations: map[string]string{"tier": "pro", "audit": "1"},
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			r, err := sig.LoadRuleFile(args[0])
			if err != nil {
				return fmt.Errorf("parse %s: %w", args[0], err)
			}

			if r.RuleID == "" {
				r.RuleID = sig.DeterministicID("", r.Name)
			}

			if err := sig.ValidateRule(r, cfg.BrokerMaxOrderQty); err != nil {
				return fmt.Errorf("validation failed: %w", err)
			}

			rulesDir, err := sig.SignalsDir(cfg.Profile)
			if err != nil {
				return err
			}

			if err := sig.SaveRule(rulesDir, r); err != nil {
				return err
			}

			fmt.Printf("%s Rule %q imported (id=%s)\n", tui.C(tui.Green, "✓"), r.Name, r.RuleID[:8])
			if len(r.Symbols) > 0 {
				fmt.Printf("  Symbols: %s\n", strings.Join(r.Symbols, ", "))
			}
			fmt.Printf("  Order:   %s %s %.0f (%s)\n", r.Order.Side, r.Order.Type, r.Order.Qty, r.Order.TIF)
			fmt.Printf("  Cooldown: %ds\n", r.Cooldown)
			return nil
		},
	}
	return cmd
}

// ---- signal list ----

func cmdSignalList(cfg *config.Config) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List all signal rules",
		Annotations: map[string]string{"tier": "free"},
		RunE: func(cmd *cobra.Command, args []string) error {
			rulesDir, err := sig.SignalsDir(cfg.Profile)
			if err != nil {
				return err
			}

			rules, err := sig.LoadRulesFromDir(rulesDir)
			if err != nil {
				return err
			}

			if len(rules) == 0 {
				fmt.Println("No signal rules configured")
				fmt.Println("  Import a rule: haiphen signal add <file.yaml>")
				return nil
			}

			if asJSON {
				out, _ := json.MarshalIndent(rules, "", "  ")
				fmt.Println(string(out))
				return nil
			}

			fmt.Printf("%-20s %-8s %-12s %-6s %-8s %-6s %s\n",
				"NAME", "STATUS", "SYMBOLS", "SIDE", "TYPE", "QTY", "COOLDOWN")
			fmt.Println(strings.Repeat("-", 75))

			for _, r := range rules {
				if r.RuleID == "" {
					r.RuleID = sig.DeterministicID("", r.Name)
				}

				syms := "-"
				if len(r.Symbols) > 0 {
					syms = strings.Join(r.Symbols, ",")
					if len(syms) > 12 {
						syms = syms[:10] + ".."
					}
				}

				statusColor := tui.Green
				if r.Status == "paused" {
					statusColor = tui.Yellow
				} else if r.Status == "disabled" {
					statusColor = tui.Red
				}

				name := r.Name
				if len(name) > 20 {
					name = name[:18] + ".."
				}

				fmt.Printf("%-20s %-8s %-12s %-6s %-8s %-6.0f %ds\n",
					name,
					tui.C(statusColor, r.Status),
					syms,
					r.Order.Side,
					r.Order.Type,
					r.Order.Qty,
					r.Cooldown)
			}

			fmt.Printf("\n%d rules\n", len(rules))
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- signal remove ----

func cmdSignalRemove(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "remove <name>",
		Short: "Delete a signal rule",
		Long:  "Delete a signal rule\n\nRequires: Pro plan or higher\nUpgrade: https://haiphen.io/#pricing",
		Annotations: map[string]string{"tier": "pro", "audit": "1"},
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			rulesDir, err := sig.SignalsDir(cfg.Profile)
			if err != nil {
				return err
			}

			if err := sig.DeleteRule(rulesDir, args[0]); err != nil {
				return err
			}

			fmt.Printf("%s Rule %q removed\n", tui.C(tui.Green, "✓"), args[0])
			return nil
		},
	}
}

// ---- signal enable ----

func cmdSignalEnable(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "enable <name>",
		Short: "Set a rule's status to active",
		Long:  "Set a rule's status to active\n\nRequires: Pro plan or higher\nUpgrade: https://haiphen.io/#pricing",
		Annotations: map[string]string{"tier": "pro", "audit": "1"},
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return setRuleStatus(cfg, args[0], "active")
		},
	}
}

// ---- signal pause ----

func cmdSignalPause(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "pause <name>",
		Short: "Pause a signal rule",
		Long:  "Pause a signal rule\n\nRequires: Pro plan or higher\nUpgrade: https://haiphen.io/#pricing",
		Annotations: map[string]string{"tier": "pro", "audit": "1"},
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return setRuleStatus(cfg, args[0], "paused")
		},
	}
}

func setRuleStatus(cfg *config.Config, name, status string) error {
	rulesDir, err := sig.SignalsDir(cfg.Profile)
	if err != nil {
		return err
	}

	rules, err := sig.LoadRulesFromDir(rulesDir)
	if err != nil {
		return err
	}

	found := false
	for _, r := range rules {
		if strings.EqualFold(r.Name, name) {
			r.Status = status
			if err := sig.SaveRule(rulesDir, r); err != nil {
				return err
			}
			found = true
			fmt.Printf("%s Rule %q set to %s\n", tui.C(tui.Green, "✓"), r.Name, status)
			break
		}
	}

	if !found {
		return fmt.Errorf("rule %q not found", name)
	}
	return nil
}

// ---- signal test ----

func cmdSignalTest(cfg *config.Config, st store.Store) *cobra.Command {
	return &cobra.Command{
		Use:   "test <name>",
		Short: "Dry-run a single rule against the latest snapshot",
		Long:  "Dry-run a single rule against the latest snapshot\n\nRequires: Pro plan or higher\nUpgrade: https://haiphen.io/#pricing",
		Annotations: map[string]string{"tier": "pro"},
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			rulesDir, err := sig.SignalsDir(cfg.Profile)
			if err != nil {
				return err
			}

			rules, err := sig.LoadRulesFromDir(rulesDir)
			if err != nil {
				return err
			}

			var target *sig.Rule
			for _, r := range rules {
				if strings.EqualFold(r.Name, args[0]) {
					target = r
					break
				}
			}
			if target == nil {
				return fmt.Errorf("rule %q not found", args[0])
			}

			if target.RuleID == "" {
				target.RuleID = sig.DeterministicID("", target.Name)
			}

			// Fetch latest snapshot from API
			sp := tui.NewSpinner("Fetching latest snapshot...")
			data, err := fetchLatestSnapshot(cmd.Context(), cfg.APIOrigin, token)
			if err != nil {
				sp.Fail("Failed to fetch snapshot")
				return err
			}
			sp.Stop()

			snap, err := sig.ParseSnapshot(data)
			if err != nil {
				return fmt.Errorf("parse snapshot: %w", err)
			}

			// Create a dry-run engine
			events := make(chan sig.Event, 10)
			ecfg := sig.DefaultEngineConfig()
			ecfg.DryRun = true
			ecfg.DaemonID = "test"
			engine := sig.NewEngine(nil, ecfg, events)
			target.Status = "active"
			engine.SetRules([]*sig.Rule{target})

			// Drain events in background
			go func() {
				for range events {
				}
			}()

			// Evaluate
			engine.Evaluate(cmd.Context(), snap)
			close(events)

			fmt.Printf("\nRule: %s\n", target.Name)
			fmt.Printf("Snapshot: %s (%d KPIs)\n", snap.Date, len(snap.KPIs))

			// Show relevant KPIs
			relevantKPIs := collectKPIs(target)
			if len(relevantKPIs) > 0 {
				fmt.Println("\nRelevant KPIs:")
				for _, kpi := range relevantKPIs {
					if val, ok := snap.KPIs[kpi]; ok {
						fmt.Printf("  %s: %.4f\n", kpi, val)
					} else {
						fmt.Printf("  %s: %s\n", kpi, tui.C(tui.Yellow, "missing"))
					}
				}
			}

			fmt.Println()
			fmt.Println(tui.C(tui.Gray, "Note: crosses_above/crosses_below need two snapshots (prev + current)"))
			return nil
		},
	}
}

// ---- signal log ----

func cmdSignalLog(cfg *config.Config) *cobra.Command {
	var lines int

	cmd := &cobra.Command{
		Use:   "log",
		Short: "Show signal daemon log",
		Annotations: map[string]string{"tier": "free"},
		RunE: func(cmd *cobra.Command, args []string) error {
			logPath, err := sig.LogPath(cfg.Profile)
			if err != nil {
				return err
			}

			data, err := os.ReadFile(logPath)
			if err != nil {
				if os.IsNotExist(err) {
					fmt.Println("No log file found. Start daemon with: haiphen signal daemon")
					return nil
				}
				return err
			}

			allLines := strings.Split(strings.TrimSpace(string(data)), "\n")
			start := 0
			if lines > 0 && len(allLines) > lines {
				start = len(allLines) - lines
			}

			for _, line := range allLines[start:] {
				fmt.Println(line)
			}
			return nil
		},
	}

	cmd.Flags().IntVar(&lines, "lines", 50, "Number of lines to show (0=all)")
	return cmd
}

// ---- signal sync ----

func cmdSignalSync(cfg *config.Config, st store.Store) *cobra.Command {
	return &cobra.Command{
		Use:   "sync",
		Short: "Push rules to D1 and pull events",
		Long:  "Push rules to D1 and pull events\n\nRequires: Pro plan or higher\nUpgrade: https://haiphen.io/#pricing",
		Annotations: map[string]string{"tier": "pro", "audit": "1"},
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			rulesDir, err := sig.SignalsDir(cfg.Profile)
			if err != nil {
				return err
			}

			rules, err := sig.LoadRulesFromDir(rulesDir)
			if err != nil {
				return err
			}

			// Assign IDs
			for _, r := range rules {
				if r.RuleID == "" {
					r.RuleID = sig.DeterministicID("", r.Name)
				}
			}

			sp := tui.NewSpinner("Syncing rules...")
			n, err := sig.PushRules(cmd.Context(), cfg.APIOrigin, token, rules)
			if err != nil {
				sp.Fail("Sync failed")
				return err
			}
			sp.Success(fmt.Sprintf("Synced %d rules to D1", n))

			// Pull recent events
			sp2 := tui.NewSpinner("Pulling events...")
			since := time.Now().Add(-24 * time.Hour).UTC().Format(time.RFC3339)
			events, err := sig.PullEvents(cmd.Context(), cfg.APIOrigin, token, since)
			if err != nil {
				sp2.Fail("Event pull failed")
				return err
			}
			sp2.Success(fmt.Sprintf("Pulled %d events (last 24h)", len(events)))

			return nil
		},
	}
}

// ---- signal positions ----

func cmdSignalPositions(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "positions",
		Short: "List recent position events from the API",
		Long:  "List recent position events from the API\n\nRequires: Pro plan or higher\nUpgrade: https://haiphen.io/#pricing",
		Annotations: map[string]string{"tier": "pro"},
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			sp := tui.NewSpinner("Fetching position events...")
			data, err := util.ServiceGet(cmd.Context(), cfg.APIOrigin, "/v1/position-events?status=active&limit=50", token)
			if err != nil {
				sp.Fail("Failed to fetch positions")
				return err
			}
			sp.Stop()

			var result struct {
				OK     bool                 `json:"ok"`
				Events []sig.PositionEvent  `json:"events"`
			}
			if err := json.Unmarshal(data, &result); err != nil {
				return fmt.Errorf("parse response: %w", err)
			}

			if len(result.Events) == 0 {
				fmt.Println("No active position events")
				return nil
			}

			if asJSON {
				out, _ := json.MarshalIndent(result.Events, "", "  ")
				fmt.Println(string(out))
				return nil
			}

			fmt.Printf("%-22s %-6s %-6s %-8s %-10s %-8s %-8s %s\n",
				"CONTRACT", "SIDE", "TYPE", "STATUS", "STRATEGY", "DELTA", "PREMIUM", "ENTRY TIME")
			fmt.Println(strings.Repeat("-", 90))

			for _, ev := range result.Events {
				contract := ev.ContractName
				if len(contract) > 22 {
					contract = contract[:20] + ".."
				}
				strategy := ev.Strategy
				if len(strategy) > 10 {
					strategy = strategy[:8] + ".."
				}

				statusColor := tui.Green
				if ev.TradeStatus == "closing" {
					statusColor = tui.Yellow
				} else if ev.TradeStatus == "closed" {
					statusColor = tui.Gray
				}

				fmt.Printf("%-22s %-6s %-6s %-8s %-10s %-8.3f %-8.2f %s\n",
					contract,
					ev.EntrySide,
					ev.EntryOrderType,
					tui.C(statusColor, ev.TradeStatus),
					strategy,
					ev.Delta,
					ev.EntryPremium,
					ev.EntryTime,
				)
			}

			fmt.Printf("\n%d positions\n", len(result.Events))
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- signal filter ----

func cmdSignalFilter(cfg *config.Config) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "filter",
		Short: "Show or import position copy-trade filter config",
		Annotations: map[string]string{"tier": "free"},
		RunE: func(cmd *cobra.Command, args []string) error {
			f, err := sig.LoadPositionFilter(cfg.Profile)
			if err != nil {
				return err
			}

			out, _ := json.MarshalIndent(f, "", "  ")
			fmt.Println(string(out))

			path, _ := sig.PositionFilterPath(cfg.Profile)
			fmt.Printf("\nConfig: %s\n", tui.C(tui.Gray, path))
			return nil
		},
	}

	cmd.AddCommand(cmdSignalFilterSet(cfg))
	return cmd
}

func cmdSignalFilterSet(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "set <file.yaml>",
		Short: "Import a position filter config from YAML",
		Long:  "Import a position filter config from YAML\n\nRequires: Pro plan or higher\nUpgrade: https://haiphen.io/#pricing",
		Annotations: map[string]string{"tier": "pro", "audit": "1"},
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := os.ReadFile(args[0])
			if err != nil {
				return fmt.Errorf("read %s: %w", args[0], err)
			}

			var f sig.PositionFilter
			if err := sig.UnmarshalYAML(data, &f); err != nil {
				return fmt.Errorf("parse YAML: %w", err)
			}

			if f.ScaleFactor <= 0 {
				f.ScaleFactor = 1.0
			}

			if err := sig.SavePositionFilter(cfg.Profile, &f); err != nil {
				return err
			}

			fmt.Printf("%s Position filter imported\n", tui.C(tui.Green, "✓"))
			fmt.Printf("  Enabled: %v\n", f.Enabled)
			if len(f.Underlyings) > 0 {
				fmt.Printf("  Underlyings: %s\n", strings.Join(f.Underlyings, ", "))
			}
			if len(f.Strategies) > 0 {
				fmt.Printf("  Strategies: %s\n", strings.Join(f.Strategies, ", "))
			}
			if f.ScaleFactor != 1.0 {
				fmt.Printf("  Scale Factor: %.2f\n", f.ScaleFactor)
			}
			fmt.Printf("  Note: restart daemon for changes to take effect\n")
			return nil
		},
	}
}

// ---- helpers ----

func requireSignalTOTP(cfg *config.Config) error {
	bs, err := brokerstore.New(cfg.Profile)
	if err != nil {
		return nil // No broker store = no TOTP
	}
	creds, err := bs.Load("alpaca")
	if err != nil || creds == nil || creds.TOTPSecret == "" {
		return nil
	}
	code, err := tui.TOTPInput("Enter 2FA code to start signal daemon: ")
	if err != nil {
		return err
	}
	if !brokertotp.ValidateTOTP(code, creds.TOTPSecret) {
		return fmt.Errorf("invalid 2FA code")
	}
	return nil
}

func fetchLatestSnapshot(ctx context.Context, apiOrigin, token string) ([]byte, error) {
	data, err := util.ServiceGet(ctx, apiOrigin, "/v1/trades/latest", token)
	if err != nil {
		return nil, err
	}

	// The response is a TradesJson object; add type field for ParseSnapshot
	var obj map[string]interface{}
	if err := json.Unmarshal(data, &obj); err != nil {
		return nil, err
	}
	obj["type"] = "snapshot"
	return json.Marshal(obj)
}

func collectKPIs(r *sig.Rule) []string {
	var kpis []string
	seen := make(map[string]bool)

	var walk func(items []sig.ConditionOrGroup)
	walk = func(items []sig.ConditionOrGroup) {
		for _, c := range items {
			if c.KPI != "" && !seen[c.KPI] {
				kpis = append(kpis, c.KPI)
				seen[c.KPI] = true
			}
			walk(c.AllOf)
			walk(c.AnyOf)
		}
	}

	if r.Entry != nil {
		walk(r.Entry.AllOf)
		walk(r.Entry.AnyOf)
	}
	if r.Exit != nil {
		walk(r.Exit.AllOf)
		walk(r.Exit.AnyOf)
	}
	return kpis
}
