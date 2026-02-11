package pipeline

import (
	"time"

	"github.com/haiphen/haiphen-cli/internal/broker"
)

// KPI maps paper trading data to the existing 26-KPI schema.
type KPI struct {
	Name   string  `json:"name"`
	Value  float64 `json:"value"`
	Unit   string  `json:"unit"`
	Source string  `json:"source"`
}

// SyncPayload is the data sent to POST /v1/broker/sync.
type SyncPayload struct {
	Broker    string     `json:"broker"`
	Source    string     `json:"source"`
	Date      string     `json:"date"`
	KPIs      []KPI      `json:"kpis"`
	Positions []PosEntry `json:"positions"`
}

// PosEntry maps a position for the sync payload.
type PosEntry struct {
	Symbol       string  `json:"symbol"`
	Qty          float64 `json:"qty"`
	Side         string  `json:"side"`
	EntryPrice   float64 `json:"entry_price"`
	CurrentPrice float64 `json:"current_price"`
	MarketValue  float64 `json:"market_value"`
	UnrealizedPL float64 `json:"unrealized_pl"`
}

// BuildSyncPayload maps Alpaca account/positions/orders into KPIs.
func BuildSyncPayload(
	brokerName string,
	acct *broker.Account,
	positions []broker.Position,
	filledToday int,
) *SyncPayload {
	now := time.Now().UTC().Format("2006-01-02")

	var totalUnrealizedPL float64
	posEntries := make([]PosEntry, len(positions))
	for i, p := range positions {
		totalUnrealizedPL += p.UnrealizedPL
		posEntries[i] = PosEntry{
			Symbol:       p.Symbol,
			Qty:          p.Qty,
			Side:         p.Side,
			EntryPrice:   p.EntryPrice,
			CurrentPrice: p.CurrentPrice,
			MarketValue:  p.MarketValue,
			UnrealizedPL: p.UnrealizedPL,
		}
	}

	kpis := []KPI{
		{Name: "Portfolio Value", Value: acct.Equity, Unit: "USD", Source: "paper:" + brokerName},
		{Name: "Cash", Value: acct.Cash, Unit: "USD", Source: "paper:" + brokerName},
		{Name: "Buying Power", Value: acct.BuyingPower, Unit: "USD", Source: "paper:" + brokerName},
		{Name: "Unrealized P&L", Value: totalUnrealizedPL, Unit: "USD", Source: "paper:" + brokerName},
		{Name: "Open Positions", Value: float64(len(positions)), Unit: "count", Source: "paper:" + brokerName},
		{Name: "Exits Closed", Value: float64(filledToday), Unit: "count", Source: "paper:" + brokerName},
		{Name: "Day Trade Count", Value: float64(acct.DayTradeCount), Unit: "count", Source: "paper:" + brokerName},
	}

	return &SyncPayload{
		Broker:    brokerName,
		Source:    "paper:" + brokerName,
		Date:      now,
		KPIs:      kpis,
		Positions: posEntries,
	}
}
