package broker

import (
	"fmt"
	"strings"
)

// PaperBaseURL is the only Alpaca API base URL permitted.
// This is a compile-time constant — no config override, no env var, no flag.
const PaperBaseURL = "https://paper-api.alpaca.markets"

// PaperStreamURL is the only WebSocket URL permitted for streaming.
const PaperStreamURL = "wss://paper-api.alpaca.markets/stream"

// Default safety limits.
const (
	DefaultMaxOrderQty   = 1000
	DefaultMaxOrderValue = 50000.0
	DefaultDailyLossLimit = 10000.0
)

// SafetyConfig holds configurable safety limits.
type SafetyConfig struct {
	MaxOrderQty    int     `json:"max_order_qty"`
	MaxOrderValue  float64 `json:"max_order_value"`
	DailyLossLimit float64 `json:"daily_loss_limit"`
	ConfirmOrders  bool    `json:"confirm_orders"`
}

// DefaultSafetyConfig returns conservative defaults.
func DefaultSafetyConfig() SafetyConfig {
	return SafetyConfig{
		MaxOrderQty:    DefaultMaxOrderQty,
		MaxOrderValue:  DefaultMaxOrderValue,
		DailyLossLimit: DefaultDailyLossLimit,
		ConfirmOrders:  true,
	}
}

// ValidateURL rejects any URL that does not contain "paper-api".
// Defense-in-depth: even if someone modifies the binary, this check
// prevents any live trading endpoint from being reached.
func ValidateURL(url string) error {
	if !strings.Contains(url, "paper-api") {
		return fmt.Errorf("SAFETY VIOLATION: URL %q does not contain 'paper-api'; live trading is permanently disabled", url)
	}
	return nil
}

// ValidateAccountPaper rejects non-paper accounts.
func ValidateAccountPaper(acct *Account) error {
	if acct == nil {
		return fmt.Errorf("account is nil")
	}
	if !acct.IsPaper {
		return fmt.Errorf("SAFETY VIOLATION: account %s is not a paper trading account; live trading is permanently disabled", acct.AccountID)
	}
	return nil
}

// ValidateOrderLimits checks order against safety limits.
func ValidateOrderLimits(req OrderRequest, cfg SafetyConfig) error {
	if req.Qty <= 0 {
		return fmt.Errorf("quantity must be positive")
	}
	if int(req.Qty) > cfg.MaxOrderQty {
		return fmt.Errorf("quantity %d exceeds max order quantity of %d (change with: haiphen broker config --max-order-qty)", int(req.Qty), cfg.MaxOrderQty)
	}

	// Estimate order value for limit/stop orders.
	var estValue float64
	switch req.Type {
	case "limit", "stop_limit":
		if req.LimitPrice > 0 {
			estValue = req.Qty * req.LimitPrice
		}
	case "stop":
		if req.StopPrice > 0 {
			estValue = req.Qty * req.StopPrice
		}
	}

	if estValue > 0 && estValue > cfg.MaxOrderValue {
		return fmt.Errorf("estimated order value $%.2f exceeds max of $%.2f (change with: haiphen broker config --max-order-value)", estValue, cfg.MaxOrderValue)
	}

	return nil
}

// ValidateDailyLoss checks if unrealized P&L exceeds the daily loss limit.
func ValidateDailyLoss(unrealizedPL float64, cfg SafetyConfig) error {
	if unrealizedPL < 0 && (-unrealizedPL) >= cfg.DailyLossLimit {
		return fmt.Errorf("daily loss limit reached: unrealized P&L $%.2f exceeds -$%.2f limit; new orders blocked (change with: haiphen broker config --daily-loss-limit)", unrealizedPL, cfg.DailyLossLimit)
	}
	return nil
}

// ValidateSide checks the order side is valid.
func ValidateSide(side string) error {
	switch strings.ToLower(side) {
	case "buy", "sell":
		return nil
	default:
		return fmt.Errorf("invalid side %q: must be 'buy' or 'sell'", side)
	}
}

// ValidateOrderType checks the order type is valid.
func ValidateOrderType(orderType string) error {
	switch strings.ToLower(orderType) {
	case "market", "limit", "stop", "stop_limit":
		return nil
	default:
		return fmt.Errorf("invalid order type %q: must be one of: market, limit, stop, stop_limit", orderType)
	}
}

// ValidateTIF checks the time-in-force is valid.
func ValidateTIF(tif string) error {
	switch strings.ToLower(tif) {
	case "day", "gtc", "ioc", "fok":
		return nil
	default:
		return fmt.Errorf("invalid time-in-force %q: must be one of: day, gtc, ioc, fok", tif)
	}
}
