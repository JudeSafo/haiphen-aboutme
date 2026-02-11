package broker

import (
	"context"
	"sort"
	"testing"
)

// mockBroker is a minimal Broker implementation for registry testing.
type mockBroker struct{ name string }

func (m *mockBroker) Name() string                                                  { return m.name }
func (m *mockBroker) Connect(ctx context.Context) error                             { return nil }
func (m *mockBroker) GetAccount(ctx context.Context) (*Account, error)              { return nil, nil }
func (m *mockBroker) GetPositions(ctx context.Context) ([]Position, error)          { return nil, nil }
func (m *mockBroker) CreateOrder(ctx context.Context, req OrderRequest) (*Order, error) {
	return nil, nil
}
func (m *mockBroker) CancelOrder(ctx context.Context, orderID string) error { return nil }
func (m *mockBroker) CancelAllOrders(ctx context.Context) (int, error)     { return 0, nil }
func (m *mockBroker) GetOrders(ctx context.Context, status string, limit int) ([]Order, error) {
	return nil, nil
}
func (m *mockBroker) GetOrderByID(ctx context.Context, orderID string) (*Order, error) {
	return nil, nil
}
func (m *mockBroker) ProbeConstraints(ctx context.Context) (*AccountConstraints, error) {
	return nil, nil
}
func (m *mockBroker) StreamUpdates(ctx context.Context, events chan<- StreamEvent) error { return nil }
func (m *mockBroker) Close() error                                                      { return nil }

func TestRegistryRoundTrip(t *testing.T) {
	// Clean state — save and restore registry.
	origRegistry := registry
	registry = map[string]BrokerFactory{}
	defer func() { registry = origRegistry }()

	Register("test-broker", func(apiKey, apiSecret string) Broker {
		return &mockBroker{name: "test-broker"}
	})

	if !IsRegistered("test-broker") {
		t.Fatal("expected test-broker to be registered")
	}
	if IsRegistered("nonexistent") {
		t.Fatal("expected nonexistent to not be registered")
	}

	b, err := New("test-broker", "key", "secret")
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	if b.Name() != "test-broker" {
		t.Errorf("Name() = %q, want %q", b.Name(), "test-broker")
	}

	_, err = New("nonexistent", "key", "secret")
	if err == nil {
		t.Fatal("expected error for nonexistent broker")
	}
}

func TestAvailable(t *testing.T) {
	origRegistry := registry
	registry = map[string]BrokerFactory{}
	defer func() { registry = origRegistry }()

	Register("alpha", func(k, s string) Broker { return &mockBroker{name: "alpha"} })
	Register("beta", func(k, s string) Broker { return &mockBroker{name: "beta"} })

	names := Available()
	sort.Strings(names)
	if len(names) != 2 || names[0] != "alpha" || names[1] != "beta" {
		t.Errorf("Available() = %v, want [alpha, beta]", names)
	}
}
