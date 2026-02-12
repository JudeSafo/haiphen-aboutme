package signal

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"

	"github.com/haiphen/haiphen-cli/internal/broker"
	"gopkg.in/yaml.v3"
)

// PositionEvent represents a single position leg from the GKE trading engine.
type PositionEvent struct {
	ID              string  `json:"id"`
	TradeID         int     `json:"trade_id"`
	BuySellID       int     `json:"buy_sell_id"`
	Underlying      string  `json:"underlying"`
	ContractName    string  `json:"contract_name"`
	OptionType      string  `json:"option_type,omitempty"`
	StrikePrice     float64 `json:"strike_price,omitempty"`
	ExpirationDate  string  `json:"expiration_date,omitempty"`
	Strategy        string  `json:"strategy,omitempty"`
	EntrySide       string  `json:"entry_side,omitempty"`
	EntryOrderType  string  `json:"entry_order_type,omitempty"`
	EntryLimitPrice float64 `json:"entry_limit_price,omitempty"`
	EntryPremium    float64 `json:"entry_premium,omitempty"`
	EntryTime       string  `json:"entry_time,omitempty"`
	EntryCondition  string  `json:"entry_condition,omitempty"`
	ExitCondition   string  `json:"exit_condition,omitempty"`
	Delta           float64 `json:"delta,omitempty"`
	Gamma           float64 `json:"gamma,omitempty"`
	Theta           float64 `json:"theta,omitempty"`
	Vega            float64 `json:"vega,omitempty"`
	IV              float64 `json:"iv,omitempty"`
	BidPrice        float64 `json:"bid_price,omitempty"`
	AskPrice        float64 `json:"ask_price,omitempty"`
	LastPrice       float64 `json:"last_price,omitempty"`
	SpotPrice       float64 `json:"spot_price,omitempty"`
	DividendYield   float64 `json:"dividend_yield,omitempty"`
	ExitSide        string  `json:"exit_side,omitempty"`
	ExitOrderType   string  `json:"exit_order_type,omitempty"`
	ExitLimitPrice  float64 `json:"exit_limit_price,omitempty"`
	ExitTime        string  `json:"exit_time,omitempty"`
	PnlPerShare     float64 `json:"pnl_per_share,omitempty"`
	PnlTotal        float64 `json:"pnl_total,omitempty"`
	HoldSeconds     int     `json:"hold_seconds,omitempty"`
	TradeStatus     string  `json:"trade_status"`
	CloseReason     string  `json:"close_reason,omitempty"`
}

// PositionFilter defines per-user filtering for copy-trade positions.
type PositionFilter struct {
	Enabled           bool     `yaml:"enabled"                     json:"enabled"`
	Underlyings       []string `yaml:"underlyings,omitempty"       json:"underlyings,omitempty"`
	Strategies        []string `yaml:"strategies,omitempty"        json:"strategies,omitempty"`
	OptionTypes       []string `yaml:"option_types,omitempty"      json:"option_types,omitempty"`
	MinDelta          float64  `yaml:"min_delta,omitempty"         json:"min_delta,omitempty"`
	MaxDelta          float64  `yaml:"max_delta,omitempty"         json:"max_delta,omitempty"`
	MaxQty            int      `yaml:"max_qty,omitempty"           json:"max_qty,omitempty"`
	OrderTypeOverride string   `yaml:"order_type_override,omitempty" json:"order_type_override,omitempty"`
	ScaleFactor       float64  `yaml:"scale_factor,omitempty"      json:"scale_factor,omitempty"`
}

// DefaultPositionFilter returns a disabled filter (passes nothing until configured).
func DefaultPositionFilter() *PositionFilter {
	return &PositionFilter{
		Enabled:     false,
		ScaleFactor: 1.0,
	}
}

// Match returns true if the position event passes all filter criteria.
func (f *PositionFilter) Match(p PositionEvent) bool {
	if !f.Enabled {
		return false
	}

	// Underlying filter
	if len(f.Underlyings) > 0 {
		found := false
		for _, u := range f.Underlyings {
			if strings.EqualFold(u, p.Underlying) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Strategy filter
	if len(f.Strategies) > 0 {
		found := false
		for _, s := range f.Strategies {
			if strings.EqualFold(s, p.Strategy) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Option type filter
	if len(f.OptionTypes) > 0 {
		found := false
		for _, t := range f.OptionTypes {
			if strings.EqualFold(t, p.OptionType) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Delta range filter (uses absolute delta)
	absDelta := math.Abs(p.Delta)
	if f.MinDelta > 0 && absDelta < f.MinDelta {
		return false
	}
	if f.MaxDelta > 0 && absDelta > f.MaxDelta {
		return false
	}

	return true
}

// ToEntryOrder constructs a broker OrderRequest for an entry (active) position.
func (p *PositionEvent) ToEntryOrder(f *PositionFilter) broker.OrderRequest {
	qty := 1.0
	if f != nil && f.ScaleFactor > 0 {
		qty = f.ScaleFactor
	}
	if f != nil && f.MaxQty > 0 && qty > float64(f.MaxQty) {
		qty = float64(f.MaxQty)
	}

	orderType := p.EntryOrderType
	if f != nil && f.OrderTypeOverride != "" {
		orderType = f.OrderTypeOverride
	}
	if orderType == "" {
		orderType = "market"
	}

	side := p.EntrySide
	if side == "" {
		side = "buy"
	}

	req := broker.OrderRequest{
		Symbol: p.ContractName,
		Qty:    qty,
		Side:   side,
		Type:   orderType,
		TIF:    "day",
	}

	if orderType == "limit" && p.EntryLimitPrice > 0 {
		req.LimitPrice = p.EntryLimitPrice
	}

	return req
}

// ToExitOrder constructs a broker OrderRequest for an exit (closing) position.
func (p *PositionEvent) ToExitOrder(f *PositionFilter) broker.OrderRequest {
	qty := 1.0
	if f != nil && f.ScaleFactor > 0 {
		qty = f.ScaleFactor
	}
	if f != nil && f.MaxQty > 0 && qty > float64(f.MaxQty) {
		qty = float64(f.MaxQty)
	}

	orderType := p.ExitOrderType
	if f != nil && f.OrderTypeOverride != "" {
		orderType = f.OrderTypeOverride
	}
	if orderType == "" {
		orderType = "market"
	}

	// Reverse side for exit
	side := "sell"
	if strings.EqualFold(p.EntrySide, "sell") {
		side = "buy"
	}

	req := broker.OrderRequest{
		Symbol: p.ContractName,
		Qty:    qty,
		Side:   side,
		Type:   orderType,
		TIF:    "day",
	}

	if orderType == "limit" && p.ExitLimitPrice > 0 {
		req.LimitPrice = p.ExitLimitPrice
	}

	return req
}

// ParsePositionEvents extracts position events from a WebSocket message.
func ParsePositionEvents(data []byte) ([]PositionEvent, error) {
	var envelope struct {
		Type      string          `json:"type"`
		Positions []PositionEvent `json:"positions"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, fmt.Errorf("unmarshal position events: %w", err)
	}
	if envelope.Type != "position_events" {
		return nil, fmt.Errorf("unexpected message type: %q", envelope.Type)
	}
	return envelope.Positions, nil
}

// PositionFilterPath returns the path to the position filter YAML file.
func PositionFilterPath(profile string) (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(configDir, "haiphen", "signals", profile)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return filepath.Join(dir, "positions.yaml"), nil
}

// LoadPositionFilter reads the position filter from YAML config.
func LoadPositionFilter(profile string) (*PositionFilter, error) {
	path, err := PositionFilterPath(profile)
	if err != nil {
		return DefaultPositionFilter(), nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return DefaultPositionFilter(), nil
		}
		return nil, err
	}

	var f PositionFilter
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("parse position filter: %w", err)
	}

	if f.ScaleFactor <= 0 {
		f.ScaleFactor = 1.0
	}

	return &f, nil
}

// UnmarshalYAML is a convenience wrapper for YAML unmarshaling.
func UnmarshalYAML(data []byte, v interface{}) error {
	return yaml.Unmarshal(data, v)
}

// SavePositionFilter writes the position filter to YAML config.
func SavePositionFilter(profile string, f *PositionFilter) error {
	path, err := PositionFilterPath(profile)
	if err != nil {
		return err
	}

	data, err := yaml.Marshal(f)
	if err != nil {
		return fmt.Errorf("marshal filter: %w", err)
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
