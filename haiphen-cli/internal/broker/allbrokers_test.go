package broker_test

import (
	"sort"
	"testing"

	"github.com/haiphen/haiphen-cli/internal/broker"

	// Import all broker stubs so they register via init().
	_ "github.com/haiphen/haiphen-cli/internal/broker/alpaca"
	_ "github.com/haiphen/haiphen-cli/internal/broker/blackstone"
	_ "github.com/haiphen/haiphen-cli/internal/broker/fidelity"
	_ "github.com/haiphen/haiphen-cli/internal/broker/ibkr"
	_ "github.com/haiphen/haiphen-cli/internal/broker/merrilllynch"
	_ "github.com/haiphen/haiphen-cli/internal/broker/robinhood"
	_ "github.com/haiphen/haiphen-cli/internal/broker/schwab"
	_ "github.com/haiphen/haiphen-cli/internal/broker/vanguard"
)

func TestAllBrokersRegistered(t *testing.T) {
	expected := []string{
		"alpaca", "blackstone", "fidelity", "ibkr",
		"merrilllynch", "robinhood", "schwab", "vanguard",
	}

	names := broker.Available()
	sort.Strings(names)

	if len(names) < len(expected) {
		t.Fatalf("Available() has %d brokers, want at least %d: got %v", len(names), len(expected), names)
	}

	for _, name := range expected {
		if !broker.IsRegistered(name) {
			t.Errorf("broker %q is not registered", name)
		}
	}
}
