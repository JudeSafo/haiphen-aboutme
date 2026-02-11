package broker

import (
	"context"
	"time"
)

// Broker defines the interface that all broker adapters must implement.
type Broker interface {
	// Name returns the broker identifier (e.g. "alpaca").
	Name() string

	// Connect validates credentials and establishes connection.
	Connect(ctx context.Context) error

	// GetAccount returns the current account details.
	GetAccount(ctx context.Context) (*Account, error)

	// GetPositions returns all open positions.
	GetPositions(ctx context.Context) ([]Position, error)

	// CreateOrder submits a new order.
	CreateOrder(ctx context.Context, req OrderRequest) (*Order, error)

	// CancelOrder cancels a single order by ID.
	CancelOrder(ctx context.Context, orderID string) error

	// CancelAllOrders cancels all open orders, returning the count.
	CancelAllOrders(ctx context.Context) (int, error)

	// GetOrders returns orders filtered by status.
	GetOrders(ctx context.Context, status string, limit int) ([]Order, error)

	// GetOrderByID returns a single order.
	GetOrderByID(ctx context.Context, orderID string) (*Order, error)

	// ProbeConstraints discovers account constraints (PDT, shorting, crypto, etc.).
	ProbeConstraints(ctx context.Context) (*AccountConstraints, error)

	// StreamUpdates opens a WebSocket stream and sends events to the channel.
	StreamUpdates(ctx context.Context, events chan<- StreamEvent) error

	// Close releases resources.
	Close() error
}

// Account represents a brokerage account.
type Account struct {
	AccountID     string  `json:"account_id"`
	Currency      string  `json:"currency"`
	Cash          float64 `json:"cash"`
	BuyingPower   float64 `json:"buying_power"`
	Equity        float64 `json:"equity"`
	PortfolioValue float64 `json:"portfolio_value"`
	DayTradeCount int     `json:"day_trade_count"`
	IsPaper       bool    `json:"is_paper"`
}

// Position represents an open position.
type Position struct {
	Symbol        string  `json:"symbol"`
	Qty           float64 `json:"qty"`
	Side          string  `json:"side"`
	EntryPrice    float64 `json:"entry_price"`
	CurrentPrice  float64 `json:"current_price"`
	MarketValue   float64 `json:"market_value"`
	UnrealizedPL  float64 `json:"unrealized_pl"`
	UnrealizedPLP float64 `json:"unrealized_plp"`
}

// OrderRequest defines the parameters for creating a new order.
type OrderRequest struct {
	Symbol     string  `json:"symbol"`
	Qty        float64 `json:"qty"`
	Side       string  `json:"side"`       // buy, sell
	Type       string  `json:"type"`       // market, limit, stop, stop_limit
	LimitPrice float64 `json:"limit_price,omitempty"`
	StopPrice  float64 `json:"stop_price,omitempty"`
	TIF        string  `json:"time_in_force"` // day, gtc, ioc, fok
}

// Order represents a submitted order.
type Order struct {
	OrderID     string    `json:"order_id"`
	Symbol      string    `json:"symbol"`
	Qty         float64   `json:"qty"`
	FilledQty   float64   `json:"filled_qty"`
	Side        string    `json:"side"`
	Type        string    `json:"type"`
	LimitPrice  float64   `json:"limit_price,omitempty"`
	StopPrice   float64   `json:"stop_price,omitempty"`
	TIF         string    `json:"time_in_force"`
	Status      string    `json:"status"`
	FilledAvgPrice float64 `json:"filled_avg_price,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	FilledAt    *time.Time `json:"filled_at,omitempty"`
}

// AccountConstraints describes what the account supports.
type AccountConstraints struct {
	PDTRestricted bool `json:"pdt_restricted"`
	DayTradeLimit int  `json:"day_trade_limit"`
	ShortingEnabled bool `json:"shorting_enabled"`
	CryptoEnabled bool `json:"crypto_enabled"`
	RateLimitRPM  int  `json:"rate_limit_rpm"`
}

// StreamEvent represents a real-time event from the broker.
type StreamEvent struct {
	Type      string    `json:"type"`     // trade_update, quote
	Symbol    string    `json:"symbol"`
	Side      string    `json:"side,omitempty"`
	Qty       float64   `json:"qty,omitempty"`
	Price     float64   `json:"price,omitempty"`
	Status    string    `json:"status,omitempty"`
	OrderID   string    `json:"order_id,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}
