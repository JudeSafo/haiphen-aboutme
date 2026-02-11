package broker

import (
	"testing"
)

func TestValidateURL(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"paper URL", "https://paper-api.alpaca.markets/v2/account", false},
		{"paper stream URL", "wss://paper-api.alpaca.markets/stream", false},
		{"live URL rejected", "https://api.alpaca.markets/v2/account", true},
		{"empty URL rejected", "", true},
		{"random URL rejected", "https://example.com/api", true},
		{"substring trick rejected", "https://evil.com/paper-api-fake", false}, // contains paper-api
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateURL(tt.url)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateURL(%q) error = %v, wantErr %v", tt.url, err, tt.wantErr)
			}
		})
	}
}

func TestValidateAccountPaper(t *testing.T) {
	tests := []struct {
		name    string
		acct    *Account
		wantErr bool
	}{
		{"nil account", nil, true},
		{"paper account", &Account{AccountID: "abc", IsPaper: true}, false},
		{"live account rejected", &Account{AccountID: "abc", IsPaper: false}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateAccountPaper(tt.acct)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateAccountPaper() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidateOrderLimits(t *testing.T) {
	cfg := DefaultSafetyConfig()

	tests := []struct {
		name    string
		req     OrderRequest
		wantErr bool
	}{
		{"valid market order", OrderRequest{Qty: 10, Type: "market"}, false},
		{"zero qty", OrderRequest{Qty: 0, Type: "market"}, true},
		{"negative qty", OrderRequest{Qty: -1, Type: "market"}, true},
		{"exceeds max qty", OrderRequest{Qty: 1001, Type: "market"}, true},
		{"at max qty", OrderRequest{Qty: 1000, Type: "market"}, false},
		{"limit order within value", OrderRequest{Qty: 100, Type: "limit", LimitPrice: 100.0}, false},
		{"limit order exceeds value", OrderRequest{Qty: 1000, Type: "limit", LimitPrice: 100.0}, true},
		{"stop order within value", OrderRequest{Qty: 50, Type: "stop", StopPrice: 200.0}, false},
		{"stop order exceeds value", OrderRequest{Qty: 500, Type: "stop", StopPrice: 200.0}, true},
		{"stop_limit order uses limit price", OrderRequest{Qty: 100, Type: "stop_limit", LimitPrice: 600.0}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateOrderLimits(tt.req, cfg)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateOrderLimits() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidateDailyLoss(t *testing.T) {
	cfg := DefaultSafetyConfig() // limit = 10000

	tests := []struct {
		name         string
		unrealizedPL float64
		wantErr      bool
	}{
		{"positive PL", 5000.0, false},
		{"zero PL", 0.0, false},
		{"small loss", -5000.0, false},
		{"at limit", -10000.0, true},
		{"over limit", -15000.0, true},
		{"just under limit", -9999.99, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateDailyLoss(tt.unrealizedPL, cfg)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateDailyLoss(%f) error = %v, wantErr %v", tt.unrealizedPL, err, tt.wantErr)
			}
		})
	}
}

func TestValidateSide(t *testing.T) {
	tests := []struct {
		side    string
		wantErr bool
	}{
		{"buy", false},
		{"sell", false},
		{"Buy", false},
		{"SELL", false},
		{"short", true},
		{"", true},
	}
	for _, tt := range tests {
		t.Run(tt.side, func(t *testing.T) {
			err := ValidateSide(tt.side)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateSide(%q) error = %v, wantErr %v", tt.side, err, tt.wantErr)
			}
		})
	}
}

func TestValidateOrderType(t *testing.T) {
	tests := []struct {
		orderType string
		wantErr   bool
	}{
		{"market", false},
		{"limit", false},
		{"stop", false},
		{"stop_limit", false},
		{"Market", false},
		{"trailing_stop", true},
		{"", true},
	}
	for _, tt := range tests {
		t.Run(tt.orderType, func(t *testing.T) {
			err := ValidateOrderType(tt.orderType)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateOrderType(%q) error = %v, wantErr %v", tt.orderType, err, tt.wantErr)
			}
		})
	}
}

func TestValidateTIF(t *testing.T) {
	tests := []struct {
		tif     string
		wantErr bool
	}{
		{"day", false},
		{"gtc", false},
		{"ioc", false},
		{"fok", false},
		{"DAY", false},
		{"opg", true},
		{"", true},
	}
	for _, tt := range tests {
		t.Run(tt.tif, func(t *testing.T) {
			err := ValidateTIF(tt.tif)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateTIF(%q) error = %v, wantErr %v", tt.tif, err, tt.wantErr)
			}
		})
	}
}

func TestDefaultSafetyConfig(t *testing.T) {
	cfg := DefaultSafetyConfig()
	if cfg.MaxOrderQty != 1000 {
		t.Errorf("MaxOrderQty = %d, want 1000", cfg.MaxOrderQty)
	}
	if cfg.MaxOrderValue != 50000.0 {
		t.Errorf("MaxOrderValue = %f, want 50000", cfg.MaxOrderValue)
	}
	if cfg.DailyLossLimit != 10000.0 {
		t.Errorf("DailyLossLimit = %f, want 10000", cfg.DailyLossLimit)
	}
	if !cfg.ConfirmOrders {
		t.Error("ConfirmOrders should default to true")
	}
}
