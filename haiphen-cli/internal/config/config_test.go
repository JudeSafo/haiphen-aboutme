package config

import "testing"

func TestDefault(t *testing.T) {
	cfg := Default()

	if cfg.AuthOrigin != "https://auth.haiphen.io" {
		t.Errorf("AuthOrigin = %q, want %q", cfg.AuthOrigin, "https://auth.haiphen.io")
	}
	if cfg.APIOrigin != "https://api.haiphen.io" {
		t.Errorf("APIOrigin = %q, want %q", cfg.APIOrigin, "https://api.haiphen.io")
	}
	if cfg.Port != 8787 {
		t.Errorf("Port = %d, want %d", cfg.Port, 8787)
	}
	if cfg.Profile != "default" {
		t.Errorf("Profile = %q, want %q", cfg.Profile, "default")
	}
	if cfg.EntitlementRefreshMinutes != 10 {
		t.Errorf("EntitlementRefreshMinutes = %d, want %d", cfg.EntitlementRefreshMinutes, 10)
	}
	if cfg.RateLimitPerMin != 120 {
		t.Errorf("RateLimitPerMin = %d, want %d", cfg.RateLimitPerMin, 120)
	}
	if cfg.Burst != 30 {
		t.Errorf("Burst = %d, want %d", cfg.Burst, 30)
	}
	if cfg.SecureOrigin != "https://secure.haiphen.io" {
		t.Errorf("SecureOrigin = %q, want %q", cfg.SecureOrigin, "https://secure.haiphen.io")
	}
	if cfg.NetworkOrigin != "https://network.haiphen.io" {
		t.Errorf("NetworkOrigin = %q, want %q", cfg.NetworkOrigin, "https://network.haiphen.io")
	}
	if cfg.GraphOrigin != "https://graph.haiphen.io" {
		t.Errorf("GraphOrigin = %q, want %q", cfg.GraphOrigin, "https://graph.haiphen.io")
	}
	if cfg.RiskOrigin != "https://risk.haiphen.io" {
		t.Errorf("RiskOrigin = %q, want %q", cfg.RiskOrigin, "https://risk.haiphen.io")
	}
	if cfg.CausalOrigin != "https://causal.haiphen.io" {
		t.Errorf("CausalOrigin = %q, want %q", cfg.CausalOrigin, "https://causal.haiphen.io")
	}
	if cfg.SupplyOrigin != "https://supply.haiphen.io" {
		t.Errorf("SupplyOrigin = %q, want %q", cfg.SupplyOrigin, "https://supply.haiphen.io")
	}
}
