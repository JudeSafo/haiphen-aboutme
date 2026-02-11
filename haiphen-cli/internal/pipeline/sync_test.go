package pipeline

import (
	"testing"

	"github.com/haiphen/haiphen-cli/internal/broker"
)

func TestBuildSyncPayload(t *testing.T) {
	acct := &broker.Account{
		AccountID:     "test-123",
		Equity:        100000.0,
		Cash:          50000.0,
		BuyingPower:   200000.0,
		DayTradeCount: 2,
		IsPaper:       true,
	}

	positions := []broker.Position{
		{
			Symbol:       "AAPL",
			Qty:          10,
			Side:         "long",
			EntryPrice:   150.0,
			CurrentPrice: 155.0,
			MarketValue:  1550.0,
			UnrealizedPL: 50.0,
		},
		{
			Symbol:       "MSFT",
			Qty:          5,
			Side:         "long",
			EntryPrice:   300.0,
			CurrentPrice: 290.0,
			MarketValue:  1450.0,
			UnrealizedPL: -50.0,
		},
	}

	payload := BuildSyncPayload("alpaca", acct, positions, 3)

	if payload.Broker != "alpaca" {
		t.Errorf("Broker = %q, want %q", payload.Broker, "alpaca")
	}
	if payload.Source != "paper:alpaca" {
		t.Errorf("Source = %q, want %q", payload.Source, "paper:alpaca")
	}
	if payload.Date == "" {
		t.Error("Date should not be empty")
	}

	// Check 7 KPIs
	if len(payload.KPIs) != 7 {
		t.Fatalf("KPIs count = %d, want 7", len(payload.KPIs))
	}

	kpiMap := make(map[string]KPI)
	for _, k := range payload.KPIs {
		kpiMap[k.Name] = k
	}

	// Portfolio Value = acct.Equity
	if kpi, ok := kpiMap["Portfolio Value"]; !ok || kpi.Value != 100000.0 {
		t.Errorf("Portfolio Value = %v", kpiMap["Portfolio Value"])
	}
	// Cash
	if kpi, ok := kpiMap["Cash"]; !ok || kpi.Value != 50000.0 {
		t.Errorf("Cash = %v", kpiMap["Cash"])
	}
	// Buying Power
	if kpi, ok := kpiMap["Buying Power"]; !ok || kpi.Value != 200000.0 {
		t.Errorf("Buying Power = %v", kpiMap["Buying Power"])
	}
	// Unrealized P&L = 50 + (-50) = 0
	if kpi, ok := kpiMap["Unrealized P&L"]; !ok || kpi.Value != 0.0 {
		t.Errorf("Unrealized P&L = %v, want 0", kpiMap["Unrealized P&L"])
	}
	// Open Positions = 2
	if kpi, ok := kpiMap["Open Positions"]; !ok || kpi.Value != 2.0 {
		t.Errorf("Open Positions = %v", kpiMap["Open Positions"])
	}
	// Exits Closed = filledToday = 3
	if kpi, ok := kpiMap["Exits Closed"]; !ok || kpi.Value != 3.0 {
		t.Errorf("Exits Closed = %v", kpiMap["Exits Closed"])
	}
	// Day Trade Count = 2
	if kpi, ok := kpiMap["Day Trade Count"]; !ok || kpi.Value != 2.0 {
		t.Errorf("Day Trade Count = %v", kpiMap["Day Trade Count"])
	}

	// Check all KPIs have correct source
	for _, kpi := range payload.KPIs {
		if kpi.Source != "paper:alpaca" {
			t.Errorf("KPI %q source = %q, want paper:alpaca", kpi.Name, kpi.Source)
		}
	}

	// Check positions mapping
	if len(payload.Positions) != 2 {
		t.Fatalf("Positions count = %d, want 2", len(payload.Positions))
	}
	if payload.Positions[0].Symbol != "AAPL" {
		t.Errorf("Position[0].Symbol = %q, want AAPL", payload.Positions[0].Symbol)
	}
	if payload.Positions[1].UnrealizedPL != -50.0 {
		t.Errorf("Position[1].UnrealizedPL = %f, want -50", payload.Positions[1].UnrealizedPL)
	}
}

func TestBuildSyncPayloadNoPositions(t *testing.T) {
	acct := &broker.Account{
		Equity:      100000.0,
		Cash:        100000.0,
		BuyingPower: 200000.0,
		IsPaper:     true,
	}

	payload := BuildSyncPayload("alpaca", acct, nil, 0)

	if len(payload.KPIs) != 7 {
		t.Fatalf("KPIs count = %d, want 7", len(payload.KPIs))
	}

	kpiMap := make(map[string]KPI)
	for _, k := range payload.KPIs {
		kpiMap[k.Name] = k
	}

	if kpiMap["Open Positions"].Value != 0 {
		t.Errorf("Open Positions = %f, want 0", kpiMap["Open Positions"].Value)
	}
	if kpiMap["Unrealized P&L"].Value != 0 {
		t.Errorf("Unrealized P&L = %f, want 0", kpiMap["Unrealized P&L"].Value)
	}

	if len(payload.Positions) != 0 {
		t.Errorf("Positions count = %d, want 0", len(payload.Positions))
	}
}
