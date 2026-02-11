package config

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
	BrokerMaxOrderQty    int
	BrokerMaxOrderValue  float64
	BrokerDailyLossLimit float64
	BrokerConfirmOrders  bool
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
	}
}
