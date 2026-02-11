package alpaca

import (
	"strconv"
	"time"

	"github.com/haiphen/haiphen-cli/internal/broker"
)

// Alpaca API response types.

type alpacaAccount struct {
	ID                string `json:"id"`
	AccountNumber     string `json:"account_number"`
	Status            string `json:"status"`
	Currency          string `json:"currency"`
	Cash              string `json:"cash"`
	BuyingPower       string `json:"buying_power"`
	Equity            string `json:"equity"`
	PortfolioValue    string `json:"portfolio_value"`
	LongMarketValue   string `json:"long_market_value"`
	ShortMarketValue  string `json:"short_market_value"`
	DaytradeCount     int    `json:"daytrade_count"`
	DaytradingBuyingPower string `json:"daytrading_buying_power"`
	PatternDayTrader  bool   `json:"pattern_day_trader"`
	TradeSuspendedByUser bool `json:"trade_suspended_by_user"`
	ShortingEnabled   bool   `json:"shorting_enabled"`
	CryptoStatus      string `json:"crypto_status"`
}

type alpacaPosition struct {
	AssetID        string `json:"asset_id"`
	Symbol         string `json:"symbol"`
	Qty            string `json:"qty"`
	Side           string `json:"side"`
	AvgEntryPrice  string `json:"avg_entry_price"`
	CurrentPrice   string `json:"current_price"`
	MarketValue    string `json:"market_value"`
	UnrealizedPL   string `json:"unrealized_pl"`
	UnrealizedPLPC string `json:"unrealized_plpc"`
}

type alpacaOrder struct {
	ID             string  `json:"id"`
	ClientOrderID  string  `json:"client_order_id"`
	Symbol         string  `json:"symbol"`
	Qty            string  `json:"qty"`
	FilledQty      string  `json:"filled_qty"`
	Side           string  `json:"side"`
	Type           string  `json:"type"`
	TimeInForce    string  `json:"time_in_force"`
	LimitPrice     *string `json:"limit_price"`
	StopPrice      *string `json:"stop_price"`
	FilledAvgPrice *string `json:"filled_avg_price"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"created_at"`
	FilledAt       *string `json:"filled_at"`
}

type alpacaOrderRequest struct {
	Symbol      string `json:"symbol"`
	Qty         string `json:"qty"`
	Side        string `json:"side"`
	Type        string `json:"type"`
	TimeInForce string `json:"time_in_force"`
	LimitPrice  string `json:"limit_price,omitempty"`
	StopPrice   string `json:"stop_price,omitempty"`
}

// Conversion functions.

func parseFloat(s string) float64 {
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

func (a *alpacaAccount) toBroker() *broker.Account {
	return &broker.Account{
		AccountID:      a.ID,
		Currency:       a.Currency,
		Cash:           parseFloat(a.Cash),
		BuyingPower:    parseFloat(a.BuyingPower),
		Equity:         parseFloat(a.Equity),
		PortfolioValue: parseFloat(a.PortfolioValue),
		DayTradeCount:  a.DaytradeCount,
		IsPaper:        true, // we only connect to paper-api
	}
}

func (a *alpacaAccount) toConstraints() *broker.AccountConstraints {
	return &broker.AccountConstraints{
		PDTRestricted:   a.PatternDayTrader,
		DayTradeLimit:   3,
		ShortingEnabled: a.ShortingEnabled,
		CryptoEnabled:   a.CryptoStatus == "ACTIVE",
		RateLimitRPM:    200,
	}
}

func (p *alpacaPosition) toBroker() broker.Position {
	return broker.Position{
		Symbol:        p.Symbol,
		Qty:           parseFloat(p.Qty),
		Side:          p.Side,
		EntryPrice:    parseFloat(p.AvgEntryPrice),
		CurrentPrice:  parseFloat(p.CurrentPrice),
		MarketValue:   parseFloat(p.MarketValue),
		UnrealizedPL:  parseFloat(p.UnrealizedPL),
		UnrealizedPLP: parseFloat(p.UnrealizedPLPC) * 100, // convert to percent
	}
}

func (o *alpacaOrder) toBroker() broker.Order {
	order := broker.Order{
		OrderID:   o.ID,
		Symbol:    o.Symbol,
		Qty:       parseFloat(o.Qty),
		FilledQty: parseFloat(o.FilledQty),
		Side:      o.Side,
		Type:      o.Type,
		TIF:       o.TimeInForce,
		Status:    o.Status,
	}
	if o.LimitPrice != nil {
		order.LimitPrice = parseFloat(*o.LimitPrice)
	}
	if o.StopPrice != nil {
		order.StopPrice = parseFloat(*o.StopPrice)
	}
	if o.FilledAvgPrice != nil {
		order.FilledAvgPrice = parseFloat(*o.FilledAvgPrice)
	}
	if t, err := time.Parse(time.RFC3339Nano, o.CreatedAt); err == nil {
		order.CreatedAt = t
	}
	if o.FilledAt != nil {
		if t, err := time.Parse(time.RFC3339Nano, *o.FilledAt); err == nil {
			order.FilledAt = &t
		}
	}
	return order
}

func brokerOrderRequest(req broker.OrderRequest) alpacaOrderRequest {
	ar := alpacaOrderRequest{
		Symbol:      req.Symbol,
		Qty:         strconv.FormatFloat(req.Qty, 'f', -1, 64),
		Side:        req.Side,
		Type:        req.Type,
		TimeInForce: req.TIF,
	}
	if req.LimitPrice > 0 {
		ar.LimitPrice = strconv.FormatFloat(req.LimitPrice, 'f', 2, 64)
	}
	if req.StopPrice > 0 {
		ar.StopPrice = strconv.FormatFloat(req.StopPrice, 'f', 2, 64)
	}
	return ar
}
