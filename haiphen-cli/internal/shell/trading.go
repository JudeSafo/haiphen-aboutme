package shell

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"

	"github.com/haiphen/haiphen-cli/internal/broker"
	brokertotp "github.com/haiphen/haiphen-cli/internal/broker/totp"
	"github.com/haiphen/haiphen-cli/internal/brokerstore"
	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/signal"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/tui"
)

// brokerOption maps a UI label to a broker registry name.
type brokerOption struct {
	Label    string
	Registry string
	Active   bool
}

var brokerOptions = []brokerOption{
	{"Alpaca (Paper Trading)", "alpaca", true},
	{"Charles Schwab", "schwab", false},
	{"Interactive Brokers", "ibkr", false},
	{"Fidelity", "fidelity", false},
	{"Robinhood", "robinhood", false},
	{"Merrill Lynch", "merrilllynch", false},
	{"Vanguard", "vanguard", false},
	{"Blackstone", "blackstone", false},
}

// NewTradingWorkflow creates the 8-step trading workflow.
func NewTradingWorkflow(cfg *config.Config, st store.Store) *Workflow {
	return &Workflow{
		ID:          "trading",
		Label:       "Trading",
		Description: "Broker, signals, and trades",
		EntryGuard: func(state *State) string {
			if !state.GetBool(KeyLoggedIn) {
				return "You must be logged in. Select Onboarding to get started."
			}
			if !state.GetBool(KeyEntitled) {
				return "Trading requires a Pro or Enterprise plan. Upgrade at https://haiphen.io/#pricing"
			}
			return ""
		},
		Steps: []Step{
			stepTradingBroker(cfg, st),
			stepTradingAccount(cfg),
			stepTradingSafety(cfg),
			stepTradingTrade(cfg),
			stepTradingHistory(cfg),
			stepTradingWatch(cfg),
			stepTradingSignals(cfg),
			stepTradingDaemon(cfg, st),
		},
	}
}

// Step 1: Broker Connection
func stepTradingBroker(cfg *config.Config, st store.Store) Step {
	return NewStep(
		"trading.broker", "Broker Connection",
		func(state *State) bool { return state.GetBool(KeyBrokerOK) },
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			tui.DisclaimerBanner(w)

			// Select broker
			labels := make([]string, len(brokerOptions))
			for i, opt := range brokerOptions {
				if opt.Active {
					labels[i] = opt.Label
				} else {
					labels[i] = opt.Label + " (Coming Soon)"
				}
			}
			idx, err := tui.Select("  Select broker:", labels)
			if err != nil {
				return StepResult{BackToMenu: true}
			}

			selected := brokerOptions[idx]
			if !selected.Active {
				fmt.Fprintf(w, "\n  %s %s integration is coming soon.\n", tui.C(tui.Yellow, "!"), selected.Label)
				fmt.Fprintf(w, "  Use Alpaca for paper trading in the meantime.\n")
				return StepResult{Error: fmt.Errorf("%s not yet available", selected.Label)}
			}

			// Collect credentials via terminal (interactive shell context)
			fmt.Fprintln(w)
			apiKey, err := tui.SecretInput("  Enter your Alpaca API key ID: ")
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			if apiKey == "" {
				return StepResult{Error: fmt.Errorf("API key cannot be empty")}
			}

			apiSecret, err := tui.SecretInput("  Enter your Alpaca secret key:  ")
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			if apiSecret == "" {
				return StepResult{Error: fmt.Errorf("API secret cannot be empty")}
			}

			// Connect and verify
			spin := tui.NewSpinner(fmt.Sprintf("Connecting to %s paper trading...", selected.Label))

			b, err := broker.New(selected.Registry, apiKey, apiSecret)
			if err != nil {
				spin.Fail("Failed to create broker")
				return StepResult{Error: err}
			}

			if err := b.Connect(ctx); err != nil {
				spin.Fail("Connection failed")
				return StepResult{Error: err}
			}

			acct, err := b.GetAccount(ctx)
			if err != nil {
				spin.Fail("Failed to fetch account")
				b.Close()
				return StepResult{Error: err}
			}

			spin.Success(fmt.Sprintf("Connected to %s", selected.Label))
			fmt.Fprintln(w)

			tui.TableRow(w, "Account ID", acct.AccountID)
			tui.TableRow(w, "Buying Power", tui.FormatMoneyPlain(acct.BuyingPower))
			tui.TableRow(w, "Equity", tui.FormatMoneyPlain(acct.Equity))

			b.Close()

			// Save credentials
			bs, err := brokerstore.New(cfg.Profile)
			if err != nil {
				return StepResult{Error: err}
			}
			creds := &brokerstore.Credentials{
				APIKey:    apiKey,
				APISecret: apiSecret,
				AccountID: acct.AccountID,
			}
			if err := bs.Save(selected.Registry, creds); err != nil {
				return StepResult{Error: fmt.Errorf("save credentials: %w", err)}
			}
			fmt.Fprintf(w, "\n  %s Credentials encrypted and saved\n", tui.C(tui.Green, "✓"))

			// Offer TOTP enrollment
			ok, err := tui.Confirm("  Enable 2FA (TOTP) for broker operations?", false)
			if err == nil && ok {
				accountName := fmt.Sprintf("haiphen:%s", selected.Registry)
				secret, err := brokertotp.EnrollTOTP(accountName)
				if err != nil {
					fmt.Fprintf(w, "  %s TOTP setup failed: %v\n", tui.C(tui.Red, "x"), err)
				} else {
					code, err := tui.TOTPInput("  Enter the 6-digit code from your app: ")
					if err == nil && brokertotp.ValidateTOTP(code, secret) {
						creds.TOTPSecret = secret
						if err := bs.Save(selected.Registry, creds); err != nil {
							fmt.Fprintf(w, "  %s Failed to save TOTP: %v\n", tui.C(tui.Red, "x"), err)
						} else {
							fmt.Fprintf(w, "  %s 2FA enrolled\n", tui.C(tui.Green, "✓"))
						}
					} else {
						fmt.Fprintf(w, "  %s Invalid code — 2FA not enrolled\n", tui.C(tui.Red, "x"))
					}
				}
			}

			state.Set(KeyBrokerOK, true)
			state.Set(KeyBrokerName, selected.Registry)
			state.Set(KeyAccountID, acct.AccountID)
			state.Set(KeyEquity, acct.Equity)
			state.Set(KeyBuyingPower, acct.BuyingPower)

			return StepResult{}
		},
	)
}

// Step 2: Account Summary
func stepTradingAccount(cfg *config.Config) Step {
	return NewStep(
		"trading.account", "Account Summary",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			spin := tui.NewSpinner("Fetching account details...")

			b, err := ConnectBroker(ctx, cfg)
			if err != nil {
				spin.Fail("Connection failed")
				return StepResult{Error: err}
			}
			defer b.Close()

			acct, err := b.GetAccount(ctx)
			if err != nil {
				spin.Fail("Failed to fetch account")
				return StepResult{Error: err}
			}

			positions, err := b.GetPositions(ctx)
			if err != nil {
				spin.Fail("Failed to fetch positions")
				return StepResult{Error: err}
			}
			spin.Stop()

			tui.TableRow(w, "Account ID", acct.AccountID)
			tui.TableRow(w, "Equity", tui.FormatMoney(acct.Equity))
			tui.TableRow(w, "Cash", tui.FormatMoney(acct.Cash))
			tui.TableRow(w, "Buying Power", tui.FormatMoney(acct.BuyingPower))
			tui.TableRow(w, "Open Positions", fmt.Sprintf("%d", len(positions)))

			state.Set(KeyEquity, acct.Equity)
			state.Set(KeyBuyingPower, acct.BuyingPower)

			return StepResult{}
		},
	)
}

// Step 3: Safety Config
func stepTradingSafety(cfg *config.Config) Step {
	return NewStep(
		"trading.safety", "Safety Config",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			fmt.Fprintf(w, "  Current safety limits:\n")
			tui.TableRow(w, "Max Order Qty", fmt.Sprintf("%d", cfg.BrokerMaxOrderQty))
			tui.TableRow(w, "Max Order Value", tui.FormatMoneyPlain(cfg.BrokerMaxOrderValue))
			tui.TableRow(w, "Daily Loss Limit", tui.FormatMoneyPlain(cfg.BrokerDailyLossLimit))
			confirm := "No"
			if cfg.BrokerConfirmOrders {
				confirm = "Yes"
			}
			tui.TableRow(w, "Confirm Orders", confirm)
			fmt.Fprintln(w)

			adjust, err := tui.Confirm("  Adjust limits?", false)
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			if !adjust {
				return StepResult{}
			}

			qty, err := tui.NumberInput("  Max order quantity", cfg.BrokerMaxOrderQty)
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			cfg.BrokerMaxOrderQty = qty

			valStr, err := tui.TextInput(fmt.Sprintf("  Max order value [%.0f]: ", cfg.BrokerMaxOrderValue))
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			if valStr != "" {
				if v, parseErr := strconv.ParseFloat(valStr, 64); parseErr == nil {
					cfg.BrokerMaxOrderValue = v
				}
			}

			lossStr, err := tui.TextInput(fmt.Sprintf("  Daily loss limit [%.0f]: ", cfg.BrokerDailyLossLimit))
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			if lossStr != "" {
				if v, parseErr := strconv.ParseFloat(lossStr, 64); parseErr == nil {
					cfg.BrokerDailyLossLimit = v
				}
			}

			if err := cfg.Save(); err != nil {
				fmt.Fprintf(w, "  %s Failed to persist config: %v\n", tui.C(tui.Yellow, "!"), err)
			}

			fmt.Fprintf(w, "\n  %s Safety limits updated and saved\n", tui.C(tui.Green, "✓"))
			return StepResult{}
		},
	)
}

// Step 4: Place a Trade
func stepTradingTrade(cfg *config.Config) Step {
	return NewStep(
		"trading.trade", "Place a Trade",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			skip, err := tui.Confirm("  Place a trade now?", true)
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			if !skip {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "Skipped."))
				return StepResult{}
			}

			symbol, err := tui.TextInput("  Symbol (e.g. AAPL): ")
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			symbol = strings.ToUpper(strings.TrimSpace(symbol))
			if symbol == "" {
				return StepResult{Error: fmt.Errorf("symbol cannot be empty")}
			}

			sideIdx, err := tui.Select("  Side:", []string{"Buy", "Sell"})
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			side := "buy"
			if sideIdx == 1 {
				side = "sell"
			}

			qty, err := tui.NumberInput("  Quantity", 1)
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			if qty <= 0 {
				return StepResult{Error: fmt.Errorf("quantity must be positive")}
			}

			typeIdx, err := tui.Select("  Order type:", []string{"Market", "Limit", "Stop"})
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			orderTypes := []string{"market", "limit", "stop"}
			orderType := orderTypes[typeIdx]

			var limitPrice, stopPrice float64
			if orderType == "limit" {
				priceStr, err := tui.TextInput("  Limit price: ")
				if err != nil {
					return StepResult{BackToMenu: true}
				}
				p, parseErr := strconv.ParseFloat(priceStr, 64)
				if parseErr != nil || p <= 0 {
					return StepResult{Error: fmt.Errorf("invalid limit price")}
				}
				limitPrice = p
			}
			if orderType == "stop" {
				priceStr, err := tui.TextInput("  Stop price: ")
				if err != nil {
					return StepResult{BackToMenu: true}
				}
				p, parseErr := strconv.ParseFloat(priceStr, 64)
				if parseErr != nil || p <= 0 {
					return StepResult{Error: fmt.Errorf("invalid stop price")}
				}
				stopPrice = p
			}

			// Large-order guard
			estimatedValue := float64(qty) * limitPrice
			if limitPrice == 0 && stopPrice > 0 {
				estimatedValue = float64(qty) * stopPrice
			}
			if estimatedValue > 0 && estimatedValue > cfg.BrokerMaxOrderValue*0.5 {
				fmt.Fprintf(w, "\n  %s Estimated value $%.0f exceeds 50%% of max order value ($%.0f)\n",
					tui.C(tui.Yellow, "!"), estimatedValue, cfg.BrokerMaxOrderValue)
				lgOk, lgErr := tui.Confirm("  Confirm large order?", false)
				if lgErr != nil || !lgOk {
					fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "Order cancelled."))
					return StepResult{}
				}
			}

			// Order summary
			fmt.Fprintln(w)
			tui.TableRow(w, "Symbol", symbol)
			tui.TableRow(w, "Side", side)
			tui.TableRow(w, "Qty", fmt.Sprintf("%d", qty))
			tui.TableRow(w, "Type", orderType)
			if limitPrice > 0 {
				tui.TableRow(w, "Limit Price", fmt.Sprintf("$%.2f", limitPrice))
			}
			if stopPrice > 0 {
				tui.TableRow(w, "Stop Price", fmt.Sprintf("$%.2f", stopPrice))
			}
			fmt.Fprintln(w)

			ok, err := tui.Confirm("  Submit order?", false)
			if err != nil || !ok {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "Order cancelled."))
				return StepResult{}
			}

			spin := tui.NewSpinner("Submitting order...")
			b, err := ConnectBroker(ctx, cfg)
			if err != nil {
				spin.Fail("Connection failed")
				return StepResult{Error: err}
			}
			defer b.Close()

			order, err := b.CreateOrder(ctx, broker.OrderRequest{
				Symbol:     symbol,
				Qty:        float64(qty),
				Side:       side,
				Type:       orderType,
				LimitPrice: limitPrice,
				StopPrice:  stopPrice,
				TIF:        "day",
			})
			if err != nil {
				spin.Fail("Order failed")
				return StepResult{Error: err}
			}

			spin.Success(fmt.Sprintf("Order %s submitted", order.OrderID))
			tui.TableRow(w, "Order ID", order.OrderID)
			tui.TableRow(w, "Status", order.Status)

			return StepResult{}
		},
	)
}

// Step 5: Order History
func stepTradingHistory(cfg *config.Config) Step {
	return NewStep(
		"trading.history", "Order History",
		func(state *State) bool { return !state.GetBool(KeyBrokerOK) },
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			spin := tui.NewSpinner("Fetching recent orders...")

			b, err := ConnectBroker(ctx, cfg)
			if err != nil {
				spin.Fail("Connection failed")
				return StepResult{Error: err}
			}
			defer b.Close()

			orders, err := b.GetOrders(ctx, "all", 10)
			if err != nil {
				spin.Fail("Failed to fetch orders")
				return StepResult{Error: err}
			}
			spin.Stop()

			if len(orders) == 0 {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "No orders found."))
				return StepResult{}
			}

			fmt.Fprintf(w, "  %-19s  %-6s  %-4s  %5s  %10s  %s\n",
				tui.C(tui.Gray, "TIME"),
				tui.C(tui.Gray, "SYMBOL"),
				tui.C(tui.Gray, "SIDE"),
				tui.C(tui.Gray, "QTY"),
				tui.C(tui.Gray, "PRICE"),
				tui.C(tui.Gray, "STATUS"))
			fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "──────────────────────────────────────────────────────────"))

			for _, o := range orders {
				price := o.FilledAvgPrice
				if price == 0 && o.LimitPrice > 0 {
					price = o.LimitPrice
				}
				if price == 0 && o.StopPrice > 0 {
					price = o.StopPrice
				}
				ts := o.CreatedAt.Format("2006-01-02 15:04")
				fmt.Fprintf(w, "  %s  %-19s  %-6s  %-4s  %5.0f  %10s  %s\n",
					tui.StatusIcon(o.Status), ts, o.Symbol, o.Side, o.Qty,
					fmt.Sprintf("$%.2f", price), o.Status)
			}

			return StepResult{}
		},
	)
}

// Step 6: Live Updates
func stepTradingWatch(cfg *config.Config) Step {
	return NewStep(
		"trading.watch", "Live Updates",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			ok, err := tui.Confirm("  Watch live trade updates?", false)
			if err != nil || !ok {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "Skipped."))
				return StepResult{}
			}

			b, err := ConnectBroker(ctx, cfg)
			if err != nil {
				return StepResult{Error: err}
			}
			defer b.Close()

			fmt.Fprintf(w, "  %s Press Ctrl+C to stop watching.\n\n", tui.C(tui.Gray, "Streaming..."))

			events := make(chan broker.StreamEvent, 64)

			// Stream in a goroutine; cancel via context
			streamCtx, streamCancel := context.WithCancel(ctx)
			defer streamCancel()

			go func() {
				_ = b.StreamUpdates(streamCtx, events)
				close(events)
			}()

			for ev := range events {
				fmt.Fprintf(w, "  %s  %-6s  %-5s  qty:%.0f  $%.2f  %s\n",
					tui.StatusIcon(ev.Status),
					ev.Symbol, ev.Side, ev.Qty, ev.Price, ev.Status)
			}

			return StepResult{}
		},
	)
}

// Step 6: Signal Rules
func stepTradingSignals(cfg *config.Config) Step {
	return NewStep(
		"trading.signals", "Signal Rules",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			dir, err := signal.SignalsDir(cfg.Profile)
			if err != nil {
				return StepResult{Error: err}
			}

			rules, err := signal.LoadRulesFromDir(dir)
			if err != nil {
				return StepResult{Error: err}
			}

			if len(rules) > 0 {
				fmt.Fprintf(w, "  Found %d signal rule(s):\n\n", len(rules))
				for _, r := range rules {
					status := tui.C(tui.Green, r.Status)
					if r.Status == "paused" {
						status = tui.C(tui.Yellow, r.Status)
					}
					fmt.Fprintf(w, "    %s  %s  %s\n", r.RuleID[:8], r.Name, status)
				}
				fmt.Fprintln(w)
				state.Set(KeyRuleCount, len(rules))

				more, err := tui.Confirm("  Add another rule?", false)
				if err != nil || !more {
					return StepResult{}
				}
			} else {
				fmt.Fprintf(w, "  No signal rules found.\n")
				fmt.Fprintf(w, "  %s\n\n", tui.C(tui.Gray, "Rules are YAML files in ~/.config/haiphen/signals/"))
			}

			path, err := tui.TextInput("  Path to YAML rule file: ")
			if err != nil {
				return StepResult{BackToMenu: true}
			}
			path = strings.TrimSpace(path)
			if path == "" {
				return StepResult{}
			}

			rule, err := signal.LoadRuleFile(path)
			if err != nil {
				return StepResult{Error: fmt.Errorf("load rule: %w", err)}
			}

			if err := signal.ValidateRule(rule, cfg.BrokerMaxOrderQty); err != nil {
				return StepResult{Error: fmt.Errorf("invalid rule: %w", err)}
			}

			if err := signal.SaveRule(dir, rule); err != nil {
				return StepResult{Error: fmt.Errorf("save rule: %w", err)}
			}

			fmt.Fprintf(w, "\n  %s Rule '%s' saved (%s)\n", tui.C(tui.Green, "✓"), rule.Name, rule.RuleID)
			state.Set(KeyRuleCount, len(rules)+1)

			return StepResult{}
		},
	)
}

// Step 7: Signal Daemon
func stepTradingDaemon(cfg *config.Config, st store.Store) Step {
	return NewStep(
		"trading.daemon", "Signal Daemon",
		func(state *State) bool { return state.GetInt(KeyDaemonPID) > 0 },
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			ok, err := tui.Confirm("  Start signal daemon?", true)
			if err != nil || !ok {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "Skipped."))
				return StepResult{Done: true}
			}

			// TOTP gate if enrolled
			bs, bsErr := brokerstore.New(cfg.Profile)
			if bsErr == nil {
				hasTOTP, _ := bs.HasTOTP("alpaca")
				if hasTOTP {
					code, err := tui.TOTPInput("  Enter TOTP code: ")
					if err != nil {
						return StepResult{BackToMenu: true}
					}
					creds, _ := bs.Load("alpaca")
					if creds != nil && !brokertotp.ValidateTOTP(code, creds.TOTPSecret) {
						return StepResult{Error: fmt.Errorf("invalid TOTP code")}
					}
				}
			}

			tok, err := st.LoadToken()
			if err != nil || tok == nil {
				return StepResult{Error: fmt.Errorf("no auth token; run login first")}
			}

			// Fork background daemon
			exe, err := os.Executable()
			if err != nil {
				return StepResult{Error: err}
			}

			forkArgs := []string{"signal", "daemon", "--foreground",
				"--api-origin", cfg.APIOrigin,
				"--profile", cfg.Profile}

			proc := exec.Command(exe, forkArgs...)
			proc.Env = append(os.Environ(), "HAIPHEN_SIGNAL_TOKEN="+tok.AccessToken)
			proc.Stdout = nil
			proc.Stderr = nil
			proc.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

			if err := proc.Start(); err != nil {
				return StepResult{Error: fmt.Errorf("fork daemon: %w", err)}
			}

			pid := proc.Process.Pid
			fmt.Fprintf(w, "  %s Signal daemon started (PID %d)\n", tui.C(tui.Green, "✓"), pid)
			state.Set(KeyDaemonPID, pid)

			return StepResult{Done: true}
		},
	)
}
