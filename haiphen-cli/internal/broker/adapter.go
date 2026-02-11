package broker

import "fmt"

// BrokerFactory creates a Broker instance given API credentials.
type BrokerFactory func(apiKey, apiSecret string) Broker

// registry maps broker names to their factories.
var registry = map[string]BrokerFactory{}

// Register adds a broker factory to the registry.
func Register(name string, factory BrokerFactory) {
	registry[name] = factory
}

// New creates a broker by name, or returns an error if unregistered.
func New(name, apiKey, apiSecret string) (Broker, error) {
	factory, ok := registry[name]
	if !ok {
		return nil, fmt.Errorf("unknown broker %q", name)
	}
	return factory(apiKey, apiSecret), nil
}

// Available returns the names of all registered brokers.
func Available() []string {
	names := make([]string, 0, len(registry))
	for name := range registry {
		names = append(names, name)
	}
	return names
}

// IsRegistered checks if a broker name is registered.
func IsRegistered(name string) bool {
	_, ok := registry[name]
	return ok
}
