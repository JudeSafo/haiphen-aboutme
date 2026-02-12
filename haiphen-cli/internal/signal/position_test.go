package signal

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/haiphen/haiphen-cli/internal/broker"
)

func TestParsePositionEvents(t *testing.T) {
	msg := `{
		"type": "position_events",
		"positions": [
			{
				"id": "100_200",
				"trade_id": 100,
				"buy_sell_id": 200,
				"underlying": "AAPL",
				"contract_name": "AAPL260220C00230000",
				"option_type": "call",
				"strike_price": 230.0,
				"strategy": "Vertical Arbitrage",
				"entry_side": "buy",
				"entry_order_type": "limit",
				"entry_limit_price": 2.50,
				"delta": 0.45,
				"trade_status": "active"
			}
		]
	}`

	events, err := ParsePositionEvents([]byte(msg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	ev := events[0]
	if ev.ID != "100_200" {
		t.Errorf("ID = %q, want %q", ev.ID, "100_200")
	}
	if ev.Underlying != "AAPL" {
		t.Errorf("Underlying = %q, want %q", ev.Underlying, "AAPL")
	}
	if ev.ContractName != "AAPL260220C00230000" {
		t.Errorf("ContractName = %q, want %q", ev.ContractName, "AAPL260220C00230000")
	}
	if ev.TradeStatus != "active" {
		t.Errorf("TradeStatus = %q, want %q", ev.TradeStatus, "active")
	}
	if ev.Delta != 0.45 {
		t.Errorf("Delta = %f, want 0.45", ev.Delta)
	}
}

func TestParsePositionEvents_WrongType(t *testing.T) {
	msg := `{"type": "snapshot", "positions": []}`
	_, err := ParsePositionEvents([]byte(msg))
	if err == nil {
		t.Fatal("expected error for wrong type")
	}
}

func TestPositionFilter_Match(t *testing.T) {
	f := &PositionFilter{
		Enabled:     true,
		Underlyings: []string{"AAPL", "SPY"},
		Strategies:  []string{"Vertical Arbitrage"},
		OptionTypes: []string{"call"},
		MinDelta:    0.2,
		MaxDelta:    0.8,
	}

	tests := []struct {
		name  string
		event PositionEvent
		want  bool
	}{
		{
			name: "matching event",
			event: PositionEvent{
				Underlying:   "AAPL",
				Strategy:     "Vertical Arbitrage",
				OptionType:   "call",
				Delta:        0.45,
				TradeStatus:  "active",
			},
			want: true,
		},
		{
			name: "wrong underlying",
			event: PositionEvent{
				Underlying:   "TSLA",
				Strategy:     "Vertical Arbitrage",
				OptionType:   "call",
				Delta:        0.45,
				TradeStatus:  "active",
			},
			want: false,
		},
		{
			name: "wrong strategy",
			event: PositionEvent{
				Underlying:   "AAPL",
				Strategy:     "Iron Condor",
				OptionType:   "call",
				Delta:        0.45,
				TradeStatus:  "active",
			},
			want: false,
		},
		{
			name: "wrong option type",
			event: PositionEvent{
				Underlying:   "AAPL",
				Strategy:     "Vertical Arbitrage",
				OptionType:   "put",
				Delta:        0.45,
				TradeStatus:  "active",
			},
			want: false,
		},
		{
			name: "delta too low",
			event: PositionEvent{
				Underlying:   "AAPL",
				Strategy:     "Vertical Arbitrage",
				OptionType:   "call",
				Delta:        0.1,
				TradeStatus:  "active",
			},
			want: false,
		},
		{
			name: "delta too high",
			event: PositionEvent{
				Underlying:   "SPY",
				Strategy:     "Vertical Arbitrage",
				OptionType:   "call",
				Delta:        0.95,
				TradeStatus:  "active",
			},
			want: false,
		},
		{
			name: "case insensitive underlying",
			event: PositionEvent{
				Underlying:   "aapl",
				Strategy:     "Vertical Arbitrage",
				OptionType:   "call",
				Delta:        0.5,
				TradeStatus:  "active",
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := f.Match(tt.event)
			if got != tt.want {
				t.Errorf("Match() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestPositionFilter_Disabled(t *testing.T) {
	f := DefaultPositionFilter()
	ev := PositionEvent{
		Underlying:  "AAPL",
		TradeStatus: "active",
	}
	if f.Match(ev) {
		t.Error("disabled filter should not match anything")
	}
}

func TestPositionFilter_NoConstraints(t *testing.T) {
	f := &PositionFilter{Enabled: true, ScaleFactor: 1.0}
	ev := PositionEvent{
		Underlying:  "ANYTHING",
		Strategy:    "Any Strategy",
		OptionType:  "call",
		Delta:       0.5,
		TradeStatus: "active",
	}
	if !f.Match(ev) {
		t.Error("filter with no constraints should match everything when enabled")
	}
}

func TestToEntryOrder(t *testing.T) {
	ev := PositionEvent{
		ContractName:    "AAPL260220C00230000",
		EntrySide:       "buy",
		EntryOrderType:  "limit",
		EntryLimitPrice: 2.50,
	}
	f := &PositionFilter{ScaleFactor: 1.0}

	req := ev.ToEntryOrder(f)
	if req.Symbol != "AAPL260220C00230000" {
		t.Errorf("Symbol = %q, want AAPL260220C00230000", req.Symbol)
	}
	if req.Side != "buy" {
		t.Errorf("Side = %q, want buy", req.Side)
	}
	if req.Type != "limit" {
		t.Errorf("Type = %q, want limit", req.Type)
	}
	if req.LimitPrice != 2.50 {
		t.Errorf("LimitPrice = %f, want 2.50", req.LimitPrice)
	}
	if req.Qty != 1.0 {
		t.Errorf("Qty = %f, want 1.0", req.Qty)
	}
}

func TestToEntryOrder_Override(t *testing.T) {
	ev := PositionEvent{
		ContractName:   "SPY260315P00500000",
		EntrySide:      "buy",
		EntryOrderType: "limit",
	}
	f := &PositionFilter{
		ScaleFactor:       2.0,
		OrderTypeOverride: "market",
		MaxQty:            5,
	}

	req := ev.ToEntryOrder(f)
	if req.Type != "market" {
		t.Errorf("Type = %q, want market (override)", req.Type)
	}
	if req.Qty != 2.0 {
		t.Errorf("Qty = %f, want 2.0 (scale factor)", req.Qty)
	}
}

func TestToExitOrder(t *testing.T) {
	ev := PositionEvent{
		ContractName:    "AAPL260220C00230000",
		EntrySide:       "buy",
		ExitOrderType:   "market",
		ExitLimitPrice:  3.00,
	}
	f := &PositionFilter{ScaleFactor: 1.0}

	req := ev.ToExitOrder(f)
	if req.Side != "sell" {
		t.Errorf("Side = %q, want sell (reverse of buy)", req.Side)
	}
	if req.Type != "market" {
		t.Errorf("Type = %q, want market", req.Type)
	}
}

func TestToExitOrder_ReverseSell(t *testing.T) {
	ev := PositionEvent{
		ContractName: "QQQ260220P00400000",
		EntrySide:    "sell",
	}
	f := &PositionFilter{ScaleFactor: 1.0}

	req := ev.ToExitOrder(f)
	if req.Side != "buy" {
		t.Errorf("Side = %q, want buy (reverse of sell)", req.Side)
	}
}

// mockBroker for testing position processing
type mockBroker struct {
	mu     sync.Mutex
	orders []broker.OrderRequest
}

func (m *mockBroker) Name() string { return "mock" }
func (m *mockBroker) Connect(_ context.Context) error { return nil }
func (m *mockBroker) GetAccount(_ context.Context) (*broker.Account, error) {
	return &broker.Account{IsPaper: true}, nil
}
func (m *mockBroker) GetPositions(_ context.Context) ([]broker.Position, error) {
	return nil, nil
}
func (m *mockBroker) CreateOrder(_ context.Context, req broker.OrderRequest) (*broker.Order, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.orders = append(m.orders, req)
	return &broker.Order{
		OrderID: "mock-" + req.Symbol,
		Symbol:  req.Symbol,
		Qty:     req.Qty,
		Side:    req.Side,
		Type:    req.Type,
		Status:  "accepted",
	}, nil
}
func (m *mockBroker) CancelOrder(_ context.Context, _ string) error { return nil }
func (m *mockBroker) CancelAllOrders(_ context.Context) (int, error) { return 0, nil }
func (m *mockBroker) GetOrders(_ context.Context, _ string, _ int) ([]broker.Order, error) {
	return nil, nil
}
func (m *mockBroker) GetOrderByID(_ context.Context, _ string) (*broker.Order, error) {
	return nil, nil
}
func (m *mockBroker) ProbeConstraints(_ context.Context) (*broker.AccountConstraints, error) {
	return nil, nil
}
func (m *mockBroker) StreamUpdates(_ context.Context, _ chan<- broker.StreamEvent) error {
	return nil
}
func (m *mockBroker) Close() error { return nil }

func TestDeduplication(t *testing.T) {
	mb := &mockBroker{}
	events := make(chan Event, 100)
	cfg := DefaultEngineConfig()
	cfg.DaemonID = "test"
	engine := NewEngine(mb, cfg, events)
	engine.SetPositionFilter(&PositionFilter{Enabled: true, ScaleFactor: 1.0})

	ev := PositionEvent{
		ID:             "1_1",
		Underlying:     "AAPL",
		ContractName:   "AAPL260220C00230000",
		EntrySide:      "buy",
		EntryOrderType: "market",
		Delta:          0.5,
		TradeStatus:    "active",
	}

	ctx := context.Background()

	// First call → should create order
	engine.ProcessPositionEvents(ctx, []PositionEvent{ev})
	mb.mu.Lock()
	if len(mb.orders) != 1 {
		t.Fatalf("expected 1 order after first call, got %d", len(mb.orders))
	}
	mb.mu.Unlock()

	// Second call with same ID → should NOT create another order (dedup)
	engine.ProcessPositionEvents(ctx, []PositionEvent{ev})
	mb.mu.Lock()
	if len(mb.orders) != 1 {
		t.Fatalf("expected still 1 order after dedup, got %d", len(mb.orders))
	}
	mb.mu.Unlock()

	// Drain events
	close(events)
	for range events {
	}
}

func TestProcessPositionEvents_FullCycle(t *testing.T) {
	mb := &mockBroker{}
	events := make(chan Event, 100)
	cfg := DefaultEngineConfig()
	cfg.DaemonID = "test"
	engine := NewEngine(mb, cfg, events)
	engine.SetPositionFilter(&PositionFilter{Enabled: true, ScaleFactor: 1.0})

	ctx := context.Background()

	// Phase 1: active → entry order
	active := PositionEvent{
		ID:             "1_1",
		Underlying:     "AAPL",
		ContractName:   "AAPL260220C00230000",
		EntrySide:      "buy",
		EntryOrderType: "market",
		TradeStatus:    "active",
	}
	engine.ProcessPositionEvents(ctx, []PositionEvent{active})

	tracked := engine.TrackedPositions()
	if _, ok := tracked["1_1"]; !ok {
		t.Error("position 1_1 should be tracked after entry")
	}

	// Phase 2: closing → exit order
	closing := active
	closing.TradeStatus = "closing"
	engine.ProcessPositionEvents(ctx, []PositionEvent{closing})

	tracked = engine.TrackedPositions()
	if _, ok := tracked["1_1"]; ok {
		t.Error("position 1_1 should be untracked after closing")
	}

	mb.mu.Lock()
	if len(mb.orders) != 2 {
		t.Fatalf("expected 2 orders (entry + exit), got %d", len(mb.orders))
	}
	// Entry order should be "buy"
	if mb.orders[0].Side != "buy" {
		t.Errorf("entry order side = %q, want buy", mb.orders[0].Side)
	}
	// Exit order should be "sell" (reverse)
	if mb.orders[1].Side != "sell" {
		t.Errorf("exit order side = %q, want sell", mb.orders[1].Side)
	}
	mb.mu.Unlock()

	// Phase 3: closed → cleanup (nothing to close, just confirm no error)
	closed := active
	closed.TradeStatus = "closed"
	engine.ProcessPositionEvents(ctx, []PositionEvent{closed})

	tracked = engine.TrackedPositions()
	if len(tracked) != 0 {
		t.Errorf("expected 0 tracked positions, got %d", len(tracked))
	}

	close(events)
	for range events {
	}
}

func TestProcessPositionEvents_DryRun(t *testing.T) {
	events := make(chan Event, 100)
	cfg := DefaultEngineConfig()
	cfg.DryRun = true
	cfg.DaemonID = "test"
	engine := NewEngine(nil, cfg, events)
	engine.SetPositionFilter(&PositionFilter{Enabled: true, ScaleFactor: 1.0})

	ctx := context.Background()

	ev := PositionEvent{
		ID:             "1_1",
		Underlying:     "AAPL",
		ContractName:   "AAPL260220C00230000",
		EntrySide:      "buy",
		EntryOrderType: "market",
		TradeStatus:    "active",
	}
	engine.ProcessPositionEvents(ctx, []PositionEvent{ev})

	tracked := engine.TrackedPositions()
	if tracked["1_1"] != "dry-run" {
		t.Errorf("dry-run position should be tracked as 'dry-run', got %q", tracked["1_1"])
	}

	close(events)
	for range events {
	}
}

func TestPositionFilter_YAML(t *testing.T) {
	f := &PositionFilter{
		Enabled:           true,
		Underlyings:       []string{"AAPL", "SPY"},
		Strategies:        []string{"Vertical Arbitrage"},
		OptionTypes:       []string{"call", "put"},
		MinDelta:          0.1,
		MaxDelta:          0.9,
		MaxQty:            5,
		OrderTypeOverride: "market",
		ScaleFactor:       1.0,
	}

	data, err := json.Marshal(f)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var f2 PositionFilter
	if err := json.Unmarshal(data, &f2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if f2.Enabled != f.Enabled {
		t.Errorf("Enabled mismatch")
	}
	if len(f2.Underlyings) != 2 {
		t.Errorf("Underlyings = %v, want 2 items", f2.Underlyings)
	}
	if f2.ScaleFactor != 1.0 {
		t.Errorf("ScaleFactor = %f, want 1.0", f2.ScaleFactor)
	}
}

func TestSessionOrderCap(t *testing.T) {
	mb := &mockBroker{}
	events := make(chan Event, 100)
	cfg := DefaultEngineConfig()
	cfg.DaemonID = "test"
	cfg.MaxOrdersPerSession = 2
	engine := NewEngine(mb, cfg, events)
	engine.SetPositionFilter(&PositionFilter{Enabled: true, ScaleFactor: 1.0})

	ctx := context.Background()

	// Submit 3 unique positions — only 2 should succeed
	for i := 0; i < 3; i++ {
		ev := PositionEvent{
			ID:             fmt.Sprintf("%d_1", i),
			Underlying:     "AAPL",
			ContractName:   "AAPL260220C00230000",
			EntrySide:      "buy",
			EntryOrderType: "market",
			TradeStatus:    "active",
		}
		engine.ProcessPositionEvents(ctx, []PositionEvent{ev})
		// Small delay to avoid event ID collisions
		time.Sleep(time.Millisecond)
	}

	mb.mu.Lock()
	if len(mb.orders) != 2 {
		t.Errorf("expected 2 orders (session cap), got %d", len(mb.orders))
	}
	mb.mu.Unlock()

	close(events)
	for range events {
	}
}
