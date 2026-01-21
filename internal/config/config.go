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
	}
}