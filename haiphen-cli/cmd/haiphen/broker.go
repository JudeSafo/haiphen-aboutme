package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/haiphen/haiphen-cli/internal/broker"
	_ "github.com/haiphen/haiphen-cli/internal/broker/alpaca"
	_ "github.com/haiphen/haiphen-cli/internal/broker/blackstone"
	"github.com/haiphen/haiphen-cli/internal/broker/credflow"
	_ "github.com/haiphen/haiphen-cli/internal/broker/fidelity"
	_ "github.com/haiphen/haiphen-cli/internal/broker/ibkr"
	_ "github.com/haiphen/haiphen-cli/internal/broker/merrilllynch"
	_ "github.com/haiphen/haiphen-cli/internal/broker/robinhood"
	_ "github.com/haiphen/haiphen-cli/internal/broker/schwab"
	brokertotp "github.com/haiphen/haiphen-cli/internal/broker/totp"
	_ "github.com/haiphen/haiphen-cli/internal/broker/vanguard"
	"github.com/haiphen/haiphen-cli/internal/brokerstore"
	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/pipeline"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/tui"
	"github.com/haiphen/haiphen-cli/internal/util"
)

func cmdBroker(cfg *config.Config, st store.Store) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "broker",
		Short: "Paper trading — connect to brokerage and manage orders",
	}

	cmd.AddCommand(
		cmdBrokerInit(cfg, st),
		cmdBrokerStatus(cfg, st),
		cmdBrokerTrade(cfg, st),
		cmdBrokerPositions(cfg, st),
		cmdBrokerOrders(cfg, st),
		cmdBrokerOrder(cfg, st),
		cmdBrokerCancel(cfg, st),
		cmdBrokerHalt(cfg, st),
		cmdBrokerWatch(cfg, st),
		cmdBrokerSync(cfg, st),
		cmdBrokerConfig(cfg, st),
		cmdBrokerDisconnect(cfg, st),
	)
	return cmd
}

// ---- helpers ----

func loadBroker(cfg *config.Config) (broker.Broker, error) {
	bs, err := brokerstore.New(cfg.Profile)
	if err != nil {
		return nil, err
	}
	// Try alpaca first (only supported broker).
	creds, err := bs.Load("alpaca")
	if err != nil {
		return nil, err
	}
	if creds == nil {
		return nil, fmt.Errorf("no broker configured; run `haiphen broker init`")
	}

	b, err := broker.New("alpaca", creds.APIKey, creds.APISecret)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func connectBroker(ctx context.Context, cfg *config.Config) (broker.Broker, error) {
	b, err := loadBroker(cfg)
	if err != nil {
		return nil, err
	}
	if err := b.Connect(ctx); err != nil {
		return nil, err
	}
	return b, nil
}

func safetyConfig(cfg *config.Config) broker.SafetyConfig {
	return broker.SafetyConfig{
		MaxOrderQty:    cfg.BrokerMaxOrderQty,
		MaxOrderValue:  cfg.BrokerMaxOrderValue,
		DailyLossLimit: cfg.BrokerDailyLossLimit,
		ConfirmOrders:  cfg.BrokerConfirmOrders,
	}
}

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

// requireTOTP prompts for a TOTP code if the broker has 2FA enrolled.
func requireTOTP(cfg *config.Config, brokerName string) error {
	bs, err := brokerstore.New(cfg.Profile)
	if err != nil {
		return err
	}
	creds, err := bs.Load(brokerName)
	if err != nil {
		return err
	}
	if creds == nil || creds.TOTPSecret == "" {
		return nil
	}
	code, err := tui.TOTPInput("Enter 2FA code: ")
	if err != nil {
		return err
	}
	if !brokertotp.ValidateTOTP(code, creds.TOTPSecret) {
		return fmt.Errorf("invalid 2FA code")
	}
	return nil
}

// ---- broker init ----

func cmdBrokerInit(cfg *config.Config, _ store.Store) *cobra.Command {
	var useTerminal bool

	cmd := &cobra.Command{
		Use:   "init",
		Short: "Interactive broker setup wizard",
		RunE: func(cmd *cobra.Command, args []string) error {
			tui.DisclaimerBanner(os.Stdout)

			fmt.Println("Select broker:")
			labels := make([]string, len(brokerOptions))
			for i, opt := range brokerOptions {
				if opt.Active {
					labels[i] = opt.Label
				} else {
					labels[i] = opt.Label + " (Coming Soon)"
				}
			}
			idx, err := tui.Select("", labels)
			if err != nil {
				return err
			}

			selected := brokerOptions[idx]
			if !selected.Active {
				fmt.Println()
				fmt.Printf("%s %s integration is coming soon.\n", tui.C(tui.Yellow, "⚠"), selected.Label)
				fmt.Println("Use Alpaca for paper trading in the meantime.")
				return nil
			}

			// Collect credentials via browser or terminal.
			var apiKey, apiSecret string
			if useTerminal {
				fmt.Println()
				apiKey, err = tui.SecretInput("Enter your Alpaca API key ID: ")
				if err != nil {
					return err
				}
				if apiKey == "" {
					return fmt.Errorf("API key cannot be empty")
				}
				apiSecret, err = tui.SecretInput("Enter your Alpaca secret key:  ")
				if err != nil {
					return err
				}
				if apiSecret == "" {
					return fmt.Errorf("API secret cannot be empty")
				}
			} else {
				fmt.Println()
				fmt.Println("Opening browser for secure credential entry...")
				result, err := credflow.Collect(cmd.Context(), selected.Registry, selected.Label)
				if err != nil {
					fmt.Printf("\n%s Browser flow failed: %v\n", tui.C(tui.Yellow, "⚠"), err)
					fmt.Println("Retry with --terminal for headless/SSH environments.")
					return err
				}
				apiKey = result.APIKey
				apiSecret = result.APISecret
			}

			sp := tui.NewSpinner(fmt.Sprintf("Connecting to %s paper trading...", selected.Label))

			b, err := broker.New(selected.Registry, apiKey, apiSecret)
			if err != nil {
				sp.Fail("Failed to create broker")
				return err
			}

			if err := b.Connect(cmd.Context()); err != nil {
				sp.Fail("Connection failed")
				return err
			}

			acct, err := b.GetAccount(cmd.Context())
			if err != nil {
				sp.Fail("Failed to fetch account")
				return err
			}

			constraints, _ := b.ProbeConstraints(cmd.Context())

			sp.Success(fmt.Sprintf("Connected to %s paper trading account", selected.Label))
			fmt.Println()

			tui.TableRow(os.Stdout, "Account ID", acct.AccountID)
			tui.TableRow(os.Stdout, "Buying Power", tui.FormatMoneyPlain(acct.BuyingPower))
			tui.TableRow(os.Stdout, "Currency", acct.Currency)
			tui.TableRow(os.Stdout, "Day Trades", fmt.Sprintf("%d / 3", acct.DayTradeCount))
			if constraints != nil {
				pdt := "No"
				if constraints.PDTRestricted {
					pdt = tui.C(tui.Red, "Yes")
				}
				tui.TableRow(os.Stdout, "PDT Restricted", pdt)
				shorting := "Disabled"
				if constraints.ShortingEnabled {
					shorting = "Enabled"
				}
				tui.TableRow(os.Stdout, "Shorting", shorting)
				crypto := "Disabled"
				if constraints.CryptoEnabled {
					crypto = "Enabled"
				}
				tui.TableRow(os.Stdout, "Crypto", crypto)
				tui.TableRow(os.Stdout, "Rate Limit", fmt.Sprintf("%d req/min", constraints.RateLimitRPM))
			}

			// Save credentials.
			bs, err := brokerstore.New(cfg.Profile)
			if err != nil {
				return err
			}
			storeCreds := &brokerstore.Credentials{
				APIKey:    apiKey,
				APISecret: apiSecret,
				AccountID: acct.AccountID,
			}
			if err := bs.Save(selected.Registry, storeCreds); err != nil {
				return fmt.Errorf("save credentials: %w", err)
			}

			fmt.Println()
			fmt.Println(tui.C(tui.Green, "✓") + " Credentials encrypted and saved")

			// Offer TOTP enrollment.
			ok, err := tui.Confirm("Enable 2FA (TOTP) for broker operations?", false)
			if err == nil && ok {
				accountName := fmt.Sprintf("haiphen:%s", selected.Registry)
				secret, err := brokertotp.EnrollTOTP(accountName)
				if err != nil {
					fmt.Printf("%s TOTP setup failed: %v\n", tui.C(tui.Red, "✗"), err)
				} else {
					// Verify one code before saving.
					code, err := tui.TOTPInput("Enter the 6-digit code from your app: ")
					if err == nil && brokertotp.ValidateTOTP(code, secret) {
						storeCreds.TOTPSecret = secret
						if err := bs.Save(selected.Registry, storeCreds); err != nil {
							fmt.Printf("%s Failed to save TOTP: %v\n", tui.C(tui.Red, "✗"), err)
						} else {
							fmt.Println(tui.C(tui.Green, "✓") + " 2FA enrolled — code verified")
						}
					} else {
						fmt.Println(tui.C(tui.Red, "✗") + " Invalid code — 2FA not enrolled")
					}
				}
			}

			b.Close()
			return nil
		},
	}

	cmd.Flags().BoolVar(&useTerminal, "terminal", false, "Use terminal input instead of browser for credentials")
	return cmd
}

// ---- broker status ----

func cmdBrokerStatus(cfg *config.Config, _ store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "status",
		Short: "Account dashboard (balance, buying power, P&L, positions)",
		RunE: func(cmd *cobra.Command, args []string) error {
			sp := tui.NewSpinner("Fetching account status...")
			b, err := connectBroker(cmd.Context(), cfg)
			if err != nil {
				sp.Fail("Connection failed")
				return err
			}
			defer b.Close()

			acct, err := b.GetAccount(cmd.Context())
			if err != nil {
				sp.Fail("Failed to fetch account")
				return err
			}

			positions, err := b.GetPositions(cmd.Context())
			if err != nil {
				sp.Fail("Failed to fetch positions")
				return err
			}

			sp.Stop()

			if asJSON {
				data := map[string]any{
					"account":   acct,
					"positions": positions,
				}
				out, _ := json.MarshalIndent(data, "", "  ")
				fmt.Println(string(out))
				return nil
			}

			tui.InlineDisclaimer(os.Stdout)

			var totalUnrealized float64
			for _, p := range positions {
				totalUnrealized += p.UnrealizedPL
			}

			tui.TableRow(os.Stdout, "Account", acct.AccountID)
			tui.TableRow(os.Stdout, "Equity", tui.FormatMoneyPlain(acct.Equity))
			tui.TableRow(os.Stdout, "Cash", tui.FormatMoneyPlain(acct.Cash))
			tui.TableRow(os.Stdout, "Buying Power", tui.FormatMoneyPlain(acct.BuyingPower))
			tui.TableRow(os.Stdout, "Unrealized P&L", tui.FormatMoneyPlain(totalUnrealized))
			tui.TableRow(os.Stdout, "Positions", fmt.Sprintf("%d", len(positions)))
			tui.TableRow(os.Stdout, "Day Trades", fmt.Sprintf("%d / 3", acct.DayTradeCount))

			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- broker trade ----

func cmdBrokerTrade(cfg *config.Config, _ store.Store) *cobra.Command {
	var (
		symbol     string
		qty        float64
		side       string
		orderType  string
		limitPrice float64
		stopPrice  float64
		tifFlag    string
		asJSON     bool
		skipConfirm bool
	)

	cmd := &cobra.Command{
		Use:   "trade",
		Short: "Submit a paper trade order",
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := requireTOTP(cfg, "alpaca"); err != nil {
				return err
			}

			if symbol == "" {
				return fmt.Errorf("--symbol is required")
			}
			if qty <= 0 {
				return fmt.Errorf("--qty must be positive")
			}
			if side == "" {
				return fmt.Errorf("--side is required (buy or sell)")
			}
			if orderType == "" {
				orderType = "market"
			}
			if tifFlag == "" {
				tifFlag = "day"
			}

			side = strings.ToLower(side)
			orderType = strings.ToLower(orderType)
			tifFlag = strings.ToLower(tifFlag)

			if err := broker.ValidateSide(side); err != nil {
				return err
			}
			if err := broker.ValidateOrderType(orderType); err != nil {
				return err
			}
			if err := broker.ValidateTIF(tifFlag); err != nil {
				return err
			}

			if (orderType == "limit" || orderType == "stop_limit") && limitPrice <= 0 {
				return fmt.Errorf("--limit-price is required for %s orders", orderType)
			}
			if (orderType == "stop" || orderType == "stop_limit") && stopPrice <= 0 {
				return fmt.Errorf("--stop-price is required for %s orders", orderType)
			}

			req := broker.OrderRequest{
				Symbol:     strings.ToUpper(symbol),
				Qty:        qty,
				Side:       side,
				Type:       orderType,
				LimitPrice: limitPrice,
				StopPrice:  stopPrice,
				TIF:        tifFlag,
			}

			sc := safetyConfig(cfg)

			// Safety checks.
			if err := broker.ValidateOrderLimits(req, sc); err != nil {
				return err
			}

			// Connect and check daily loss.
			b, err := connectBroker(cmd.Context(), cfg)
			if err != nil {
				return err
			}
			defer b.Close()

			if side == "buy" {
				positions, err := b.GetPositions(cmd.Context())
				if err == nil {
					var totalPL float64
					for _, p := range positions {
						totalPL += p.UnrealizedPL
					}
					if err := broker.ValidateDailyLoss(totalPL, sc); err != nil {
						return err
					}
				}
			}

			// Show order summary and confirm.
			if !skipConfirm && sc.ConfirmOrders {
				tui.InlineDisclaimer(os.Stdout)
				fmt.Println()
				tui.TableRow(os.Stdout, "Symbol", req.Symbol)
				tui.TableRow(os.Stdout, "Side", strings.ToUpper(req.Side))
				tui.TableRow(os.Stdout, "Type", strings.ToUpper(req.Type))
				tui.TableRow(os.Stdout, "Quantity", fmt.Sprintf("%.0f", req.Qty))
				if req.LimitPrice > 0 {
					tui.TableRow(os.Stdout, "Limit", tui.FormatMoneyPlain(req.LimitPrice))
				}
				if req.StopPrice > 0 {
					tui.TableRow(os.Stdout, "Stop", tui.FormatMoneyPlain(req.StopPrice))
				}
				if req.LimitPrice > 0 {
					tui.TableRow(os.Stdout, "Est. Value", tui.FormatMoneyPlain(req.Qty*req.LimitPrice))
				}
				tui.TableRow(os.Stdout, "TIF", strings.ToUpper(req.TIF))
				fmt.Println()

				ok, err := tui.Confirm("Confirm order?", false)
				if err != nil {
					return err
				}
				if !ok {
					fmt.Println("Order cancelled.")
					return nil
				}
			}

			sp := tui.NewSpinner("Submitting order...")

			order, err := b.CreateOrder(cmd.Context(), req)
			if err != nil {
				sp.Fail("Order failed")
				return err
			}

			sp.Success(fmt.Sprintf("Order submitted — ID: %s  Status: %s", truncID(order.OrderID), order.Status))

			if asJSON {
				out, _ := json.MarshalIndent(order, "", "  ")
				fmt.Println(string(out))
			}

			return nil
		},
	}

	cmd.Flags().StringVar(&symbol, "symbol", "", "Ticker symbol (e.g. AAPL)")
	cmd.Flags().Float64Var(&qty, "qty", 0, "Number of shares")
	cmd.Flags().StringVar(&side, "side", "", "Order side: buy or sell")
	cmd.Flags().StringVar(&orderType, "type", "market", "Order type: market, limit, stop, stop_limit")
	cmd.Flags().Float64Var(&limitPrice, "limit-price", 0, "Limit price (required for limit/stop_limit)")
	cmd.Flags().Float64Var(&stopPrice, "stop-price", 0, "Stop price (required for stop/stop_limit)")
	cmd.Flags().StringVar(&tifFlag, "tif", "day", "Time in force: day, gtc, ioc, fok")
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().BoolVar(&skipConfirm, "yes", false, "Skip confirmation prompt")
	return cmd
}

// ---- broker positions ----

func cmdBrokerPositions(cfg *config.Config, _ store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "positions",
		Short: "List current positions",
		RunE: func(cmd *cobra.Command, args []string) error {
			b, err := connectBroker(cmd.Context(), cfg)
			if err != nil {
				return err
			}
			defer b.Close()

			positions, err := b.GetPositions(cmd.Context())
			if err != nil {
				return err
			}

			if asJSON {
				out, _ := json.MarshalIndent(positions, "", "  ")
				fmt.Println(string(out))
				return nil
			}

			if len(positions) == 0 {
				fmt.Println("No open positions")
				return nil
			}

			tui.InlineDisclaimer(os.Stdout)

			fmt.Printf("%-8s %8s %10s %10s %12s %12s\n",
				"SYMBOL", "QTY", "ENTRY", "CURRENT", "MKT VALUE", "P&L")
			fmt.Println(strings.Repeat("-", 66))

			var totalPL float64
			for _, p := range positions {
				totalPL += p.UnrealizedPL
				plStr := tui.FormatMoneyPlain(p.UnrealizedPL)
				fmt.Printf("%-8s %8.0f %10.2f %10.2f %12.2f %12s\n",
					p.Symbol, p.Qty, p.EntryPrice, p.CurrentPrice, p.MarketValue, plStr)
			}

			fmt.Println(strings.Repeat("-", 66))
			fmt.Printf("%-8s %8s %10s %10s %12s %12s\n",
				"TOTAL", "", "", "", "", tui.FormatMoneyPlain(totalPL))
			fmt.Printf("\n%d positions\n", len(positions))
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- broker orders ----

func cmdBrokerOrders(cfg *config.Config, _ store.Store) *cobra.Command {
	var (
		asJSON bool
		status string
		limit  int
	)

	cmd := &cobra.Command{
		Use:   "orders",
		Short: "List orders",
		RunE: func(cmd *cobra.Command, args []string) error {
			b, err := connectBroker(cmd.Context(), cfg)
			if err != nil {
				return err
			}
			defer b.Close()

			orders, err := b.GetOrders(cmd.Context(), status, limit)
			if err != nil {
				return err
			}

			if asJSON {
				out, _ := json.MarshalIndent(orders, "", "  ")
				fmt.Println(string(out))
				return nil
			}

			if len(orders) == 0 {
				fmt.Println("No orders found")
				return nil
			}

			fmt.Printf("%-12s %-8s %-6s %-6s %-12s %10s %10s %s\n",
				"ID", "SYMBOL", "SIDE", "QTY", "TYPE", "PRICE", "STATUS", "CREATED")
			fmt.Println(strings.Repeat("-", 85))

			for _, o := range orders {
				priceStr := "-"
				if o.LimitPrice > 0 {
					priceStr = fmt.Sprintf("%.2f", o.LimitPrice)
				} else if o.FilledAvgPrice > 0 {
					priceStr = fmt.Sprintf("%.2f", o.FilledAvgPrice)
				}
				created := o.CreatedAt.Format("01/02 15:04")
				fmt.Printf("%-12s %-8s %-6s %-6.0f %-12s %10s %10s %s\n",
					truncID(o.OrderID), o.Symbol, strings.ToUpper(o.Side),
					o.Qty, o.Type, priceStr, o.Status, created)
			}

			fmt.Printf("\n%d orders\n", len(orders))
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&status, "status", "open", "Filter: open, closed, all")
	cmd.Flags().IntVar(&limit, "limit", 50, "Max results")
	return cmd
}

// ---- broker order <id> ----

func cmdBrokerOrder(cfg *config.Config, _ store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "order <id>",
		Short: "Get details of a single order",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			b, err := connectBroker(cmd.Context(), cfg)
			if err != nil {
				return err
			}
			defer b.Close()

			order, err := b.GetOrderByID(cmd.Context(), args[0])
			if err != nil {
				return err
			}

			if asJSON {
				out, _ := json.MarshalIndent(order, "", "  ")
				fmt.Println(string(out))
				return nil
			}

			tui.TableRow(os.Stdout, "Order ID", order.OrderID)
			tui.TableRow(os.Stdout, "Symbol", order.Symbol)
			tui.TableRow(os.Stdout, "Side", strings.ToUpper(order.Side))
			tui.TableRow(os.Stdout, "Type", order.Type)
			tui.TableRow(os.Stdout, "Qty", fmt.Sprintf("%.0f", order.Qty))
			tui.TableRow(os.Stdout, "Filled Qty", fmt.Sprintf("%.0f", order.FilledQty))
			tui.TableRow(os.Stdout, "Status", order.Status)
			tui.TableRow(os.Stdout, "TIF", order.TIF)
			if order.LimitPrice > 0 {
				tui.TableRow(os.Stdout, "Limit Price", tui.FormatMoneyPlain(order.LimitPrice))
			}
			if order.StopPrice > 0 {
				tui.TableRow(os.Stdout, "Stop Price", tui.FormatMoneyPlain(order.StopPrice))
			}
			if order.FilledAvgPrice > 0 {
				tui.TableRow(os.Stdout, "Fill Price", tui.FormatMoneyPlain(order.FilledAvgPrice))
			}
			tui.TableRow(os.Stdout, "Created", order.CreatedAt.Format(time.RFC3339))
			if order.FilledAt != nil {
				tui.TableRow(os.Stdout, "Filled", order.FilledAt.Format(time.RFC3339))
			}
			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// ---- broker cancel ----

func cmdBrokerCancel(cfg *config.Config, _ store.Store) *cobra.Command {
	return &cobra.Command{
		Use:   "cancel <id>",
		Short: "Cancel a specific order",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			b, err := connectBroker(cmd.Context(), cfg)
			if err != nil {
				return err
			}
			defer b.Close()

			if err := b.CancelOrder(cmd.Context(), args[0]); err != nil {
				return err
			}

			fmt.Printf("%s Order %s cancelled\n", tui.C(tui.Green, "✓"), truncID(args[0]))
			return nil
		},
	}
}

// ---- broker halt ----

func cmdBrokerHalt(cfg *config.Config, _ store.Store) *cobra.Command {
	var skipConfirm bool

	cmd := &cobra.Command{
		Use:   "halt",
		Short: "Kill switch — cancel ALL open orders immediately",
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := requireTOTP(cfg, "alpaca"); err != nil {
				return err
			}

			if !skipConfirm {
				fmt.Println(tui.C(tui.Red+tui.Bold, "⚠  This will cancel ALL open orders."))
				ok, err := tui.Confirm("Are you sure?", false)
				if err != nil {
					return err
				}
				if !ok {
					fmt.Println("Aborted.")
					return nil
				}
			}

			sp := tui.NewSpinner("Cancelling all open orders...")

			b, err := connectBroker(cmd.Context(), cfg)
			if err != nil {
				sp.Fail("Connection failed")
				return err
			}
			defer b.Close()

			count, err := b.CancelAllOrders(cmd.Context())
			if err != nil {
				sp.Fail("Failed to cancel orders")
				return err
			}

			sp.Success(fmt.Sprintf("Cancelled %d open orders", count))
			return nil
		},
	}

	cmd.Flags().BoolVar(&skipConfirm, "yes", false, "Skip confirmation")
	return cmd
}

// ---- broker watch ----

func cmdBrokerWatch(cfg *config.Config, _ store.Store) *cobra.Command {
	return &cobra.Command{
		Use:   "watch",
		Short: "Real-time WebSocket trade updates (Ctrl+C to stop)",
		RunE: func(cmd *cobra.Command, args []string) error {
			b, err := connectBroker(cmd.Context(), cfg)
			if err != nil {
				return err
			}
			defer b.Close()

			tui.InlineDisclaimer(os.Stdout)
			fmt.Println("Live Trade Updates (Ctrl+C to stop)")
			fmt.Println(tui.C(tui.Gray, strings.Repeat("━", 60)))

			ctx, cancel := context.WithCancel(cmd.Context())
			defer cancel()

			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, os.Interrupt)
			go func() {
				<-sigCh
				cancel()
			}()

			events := make(chan broker.StreamEvent, 32)

			go func() {
				if err := b.StreamUpdates(ctx, events); err != nil {
					if ctx.Err() == nil {
						fmt.Fprintf(os.Stderr, "\n%s Stream error: %v\n", tui.C(tui.Red, "✗"), err)
					}
				}
				close(events)
			}()

			for event := range events {
				ts := event.Timestamp.Format("15:04:05")
				switch event.Type {
				case "fill", "filled":
					fmt.Printf("  %s  %-6s %-4s %.0f %s @ %s\n",
						tui.C(tui.Gray, ts),
						tui.C(tui.Bold, event.Symbol),
						strings.ToUpper(event.Side),
						event.Qty,
						tui.C(tui.Green, "FILLED"),
						tui.FormatMoneyPlain(event.Price))
				case "partial_fill":
					fmt.Printf("  %s  %-6s %-4s %.0f %s @ %s\n",
						tui.C(tui.Gray, ts),
						tui.C(tui.Bold, event.Symbol),
						strings.ToUpper(event.Side),
						event.Qty,
						tui.C(tui.Cyan, "PARTIAL"),
						tui.FormatMoneyPlain(event.Price))
				case "canceled", "cancelled":
					fmt.Printf("  %s  %-6s %s\n",
						tui.C(tui.Gray, ts),
						tui.C(tui.Bold, event.Symbol),
						tui.C(tui.Red, "CANCELLED"))
				case "new", "accepted", "pending_new":
					fmt.Printf("  %s  %-6s %-4s %.0f %s  %s\n",
						tui.C(tui.Gray, ts),
						tui.C(tui.Bold, event.Symbol),
						strings.ToUpper(event.Side),
						event.Qty,
						event.Status,
						tui.FormatMoneyPlain(event.Price))
				default:
					fmt.Printf("  %s  %-6s %s %s\n",
						tui.C(tui.Gray, ts),
						event.Symbol,
						event.Type,
						event.Status)
				}
			}

			fmt.Println("\nStream closed.")
			return nil
		},
	}
}

// ---- broker sync ----

func cmdBrokerSync(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "sync",
		Short: "Push paper trading data to haiphen trades pipeline",
		RunE: func(cmd *cobra.Command, args []string) error {
			token, err := requireToken(st)
			if err != nil {
				return err
			}

			sp := tui.NewSpinner("Syncing paper trading data...")

			b, err := connectBroker(cmd.Context(), cfg)
			if err != nil {
				sp.Fail("Connection failed")
				return err
			}
			defer b.Close()

			acct, err := b.GetAccount(cmd.Context())
			if err != nil {
				sp.Fail("Failed to fetch account")
				return err
			}

			positions, err := b.GetPositions(cmd.Context())
			if err != nil {
				sp.Fail("Failed to fetch positions")
				return err
			}

			// Count filled orders today.
			orders, _ := b.GetOrders(cmd.Context(), "closed", 100)
			filledToday := 0
			today := time.Now().UTC().Format("2006-01-02")
			for _, o := range orders {
				if o.Status == "filled" && o.CreatedAt.Format("2006-01-02") == today {
					filledToday++
				}
			}

			payload := pipeline.BuildSyncPayload(b.Name(), acct, positions, filledToday)

			data, err := util.ServicePost(cmd.Context(), cfg.APIOrigin, "/v1/broker/sync", token, payload)
			if err != nil {
				sp.Fail("Sync failed")
				return err
			}

			sp.Success(fmt.Sprintf("Synced %d KPIs, %d positions", len(payload.KPIs), len(payload.Positions)))

			if asJSON {
				printJSON(data)
			}

			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Output sync response as JSON")
	return cmd
}

// ---- broker config ----

func cmdBrokerConfig(cfg *config.Config, _ store.Store) *cobra.Command {
	var (
		maxQty       int
		maxValue     float64
		dailyLoss    float64
		confirmFlag  string
		reset        bool
	)

	cmd := &cobra.Command{
		Use:   "config",
		Short: "Show or set broker safety configuration",
		RunE: func(cmd *cobra.Command, args []string) error {
			if reset {
				defaults := broker.DefaultSafetyConfig()
				cfg.BrokerMaxOrderQty = defaults.MaxOrderQty
				cfg.BrokerMaxOrderValue = defaults.MaxOrderValue
				cfg.BrokerDailyLossLimit = defaults.DailyLossLimit
				cfg.BrokerConfirmOrders = defaults.ConfirmOrders
				fmt.Println("Safety configuration reset to defaults")
			}

			if maxQty > 0 {
				cfg.BrokerMaxOrderQty = maxQty
			}
			if maxValue > 0 {
				cfg.BrokerMaxOrderValue = maxValue
			}
			if dailyLoss > 0 {
				cfg.BrokerDailyLossLimit = dailyLoss
			}
			if confirmFlag == "true" || confirmFlag == "yes" {
				cfg.BrokerConfirmOrders = true
			} else if confirmFlag == "false" || confirmFlag == "no" {
				cfg.BrokerConfirmOrders = false
			}

			fmt.Println(tui.C(tui.Bold, "Broker Safety Configuration"))
			fmt.Println()
			tui.TableRow(os.Stdout, "Max Order Qty", fmt.Sprintf("%d shares", cfg.BrokerMaxOrderQty))
			tui.TableRow(os.Stdout, "Max Order Value", tui.FormatMoneyPlain(cfg.BrokerMaxOrderValue))
			tui.TableRow(os.Stdout, "Daily Loss Limit", tui.FormatMoneyPlain(cfg.BrokerDailyLossLimit))
			confirm := "yes"
			if !cfg.BrokerConfirmOrders {
				confirm = "no"
			}
			tui.TableRow(os.Stdout, "Confirm Orders", confirm)

			return nil
		},
	}

	cmd.Flags().IntVar(&maxQty, "max-order-qty", 0, "Max shares per order")
	cmd.Flags().Float64Var(&maxValue, "max-order-value", 0, "Max dollar value per order")
	cmd.Flags().Float64Var(&dailyLoss, "daily-loss-limit", 0, "Daily loss limit (blocks new orders)")
	cmd.Flags().StringVar(&confirmFlag, "confirm", "", "Require order confirmation (true/false)")
	cmd.Flags().BoolVar(&reset, "reset", false, "Reset to default safety values")
	return cmd
}

// ---- broker disconnect ----

func cmdBrokerDisconnect(cfg *config.Config, _ store.Store) *cobra.Command {
	return &cobra.Command{
		Use:   "disconnect",
		Short: "Remove broker credentials",
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := requireTOTP(cfg, "alpaca"); err != nil {
				return err
			}

			bs, err := brokerstore.New(cfg.Profile)
			if err != nil {
				return err
			}

			if !bs.Exists("alpaca") {
				fmt.Println("No broker credentials stored.")
				return nil
			}

			ok, err := tui.Confirm("Remove stored Alpaca credentials?", false)
			if err != nil {
				return err
			}
			if !ok {
				fmt.Println("Aborted.")
				return nil
			}

			if err := bs.Delete("alpaca"); err != nil {
				return err
			}

			fmt.Printf("%s Broker credentials removed\n", tui.C(tui.Green, "✓"))
			return nil
		},
	}
}

// truncID shortens a UUID-style ID to the first 8 characters.
func truncID(id string) string {
	if len(id) > 8 {
		return id[:8] + "..."
	}
	return id
}
