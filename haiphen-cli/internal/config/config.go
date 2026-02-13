package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	AuthOrigin string
	APIOrigin  string
	Port       int
	Profile    string

	// How frequently we re-check entitlement in background (minutes)
	EntitlementRefreshMinutes int

	// Local rate limiting defaults (per minute)
	RateLimitPerMin int
	Burst           int

	// Service origins
	SecureOrigin  string
	NetworkOrigin string
	GraphOrigin   string
	RiskOrigin    string
	CausalOrigin  string
	SupplyOrigin  string

	// Broker safety defaults
	BrokerMaxOrderQty    int     `json:"broker_max_order_qty"`
	BrokerMaxOrderValue  float64 `json:"broker_max_order_value"`
	BrokerDailyLossLimit float64 `json:"broker_daily_loss_limit"`
	BrokerConfirmOrders  bool    `json:"broker_confirm_orders"`

	// Signal daemon safety defaults
	SignalMaxTriggersPerHour  int `json:"signal_max_triggers_per_hour"`
	SignalMaxOrdersPerSession int `json:"signal_max_orders_per_session"`

	// Session timeout (hours). 0 = no timeout. Default: 168 (7 days).
	SessionMaxAgeHours int `json:"session_max_age_hours"`
}

// safetySnapshot holds only the persisted safety fields.
type safetySnapshot struct {
	BrokerMaxOrderQty         int     `json:"broker_max_order_qty"`
	BrokerMaxOrderValue       float64 `json:"broker_max_order_value"`
	BrokerDailyLossLimit      float64 `json:"broker_daily_loss_limit"`
	BrokerConfirmOrders       bool    `json:"broker_confirm_orders"`
	SignalMaxTriggersPerHour  int     `json:"signal_max_triggers_per_hour"`
	SignalMaxOrdersPerSession int     `json:"signal_max_orders_per_session"`
	SessionMaxAgeHours        int     `json:"session_max_age_hours"`
}

func configFilePath(profile string) string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	if profile == "" {
		profile = "default"
	}
	return filepath.Join(dir, "haiphen", "config."+profile+".json")
}

// Save persists the safety-related config fields to disk.
func (c *Config) Save() error {
	path := configFilePath(c.Profile)
	if path == "" {
		return nil
	}
	snap := safetySnapshot{
		BrokerMaxOrderQty:         c.BrokerMaxOrderQty,
		BrokerMaxOrderValue:       c.BrokerMaxOrderValue,
		BrokerDailyLossLimit:      c.BrokerDailyLossLimit,
		BrokerConfirmOrders:       c.BrokerConfirmOrders,
		SignalMaxTriggersPerHour:  c.SignalMaxTriggersPerHour,
		SignalMaxOrdersPerSession: c.SignalMaxOrdersPerSession,
		SessionMaxAgeHours:        c.SessionMaxAgeHours,
	}
	b, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o600)
}

// LoadFromDisk reads the persisted config file and overlays values onto cfg.
func LoadFromDisk(profile string) *Config {
	cfg := Default()
	path := configFilePath(profile)
	if path == "" {
		return cfg
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return cfg
	}
	var snap safetySnapshot
	if json.Unmarshal(b, &snap) != nil {
		return cfg
	}
	if snap.BrokerMaxOrderQty > 0 {
		cfg.BrokerMaxOrderQty = snap.BrokerMaxOrderQty
	}
	if snap.BrokerMaxOrderValue > 0 {
		cfg.BrokerMaxOrderValue = snap.BrokerMaxOrderValue
	}
	if snap.BrokerDailyLossLimit > 0 {
		cfg.BrokerDailyLossLimit = snap.BrokerDailyLossLimit
	}
	cfg.BrokerConfirmOrders = snap.BrokerConfirmOrders
	if snap.SignalMaxTriggersPerHour > 0 {
		cfg.SignalMaxTriggersPerHour = snap.SignalMaxTriggersPerHour
	}
	if snap.SignalMaxOrdersPerSession > 0 {
		cfg.SignalMaxOrdersPerSession = snap.SignalMaxOrdersPerSession
	}
	if snap.SessionMaxAgeHours > 0 {
		cfg.SessionMaxAgeHours = snap.SessionMaxAgeHours
	}
	return cfg
}

func Default() *Config {
	return &Config{
		AuthOrigin:                "https://auth.haiphen.io",
		APIOrigin:                 "https://api.haiphen.io",
		Port:                      8787,
		Profile:                   "default",
		EntitlementRefreshMinutes: 10,
		RateLimitPerMin:           120,
		Burst:                     30,
		SecureOrigin:              "https://secure.haiphen.io",
		NetworkOrigin:             "https://network.haiphen.io",
		GraphOrigin:               "https://graph.haiphen.io",
		RiskOrigin:                "https://risk.haiphen.io",
		CausalOrigin:              "https://causal.haiphen.io",
		SupplyOrigin:              "https://supply.haiphen.io",
		BrokerMaxOrderQty:         1000,
		BrokerMaxOrderValue:       50000.0,
		BrokerDailyLossLimit:      10000.0,
		BrokerConfirmOrders:       true,
		SignalMaxTriggersPerHour:  10,
		SignalMaxOrdersPerSession: 50,
		SessionMaxAgeHours:        168,
	}
}
