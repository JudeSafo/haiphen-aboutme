package schwab

import (
	"context"
	"fmt"

	"github.com/haiphen/haiphen-cli/internal/broker"
)

func init() {
	broker.Register("schwab", func(apiKey, apiSecret string) broker.Broker {
		return &Stub{}
	})
}

// Stub is a placeholder for future Charles Schwab integration.
type Stub struct{}

func (s *Stub) Name() string { return "schwab" }

var errComingSoon = fmt.Errorf("Charles Schwab integration is coming soon; Schwab's API currently lacks paper trading support. Use Alpaca for paper trading")

func (s *Stub) Connect(context.Context) error                                      { return errComingSoon }
func (s *Stub) GetAccount(context.Context) (*broker.Account, error)                 { return nil, errComingSoon }
func (s *Stub) GetPositions(context.Context) ([]broker.Position, error)             { return nil, errComingSoon }
func (s *Stub) CreateOrder(context.Context, broker.OrderRequest) (*broker.Order, error) { return nil, errComingSoon }
func (s *Stub) CancelOrder(context.Context, string) error                           { return errComingSoon }
func (s *Stub) CancelAllOrders(context.Context) (int, error)                        { return 0, errComingSoon }
func (s *Stub) GetOrders(context.Context, string, int) ([]broker.Order, error)      { return nil, errComingSoon }
func (s *Stub) GetOrderByID(context.Context, string) (*broker.Order, error)         { return nil, errComingSoon }
func (s *Stub) ProbeConstraints(context.Context) (*broker.AccountConstraints, error) { return nil, errComingSoon }
func (s *Stub) StreamUpdates(context.Context, chan<- broker.StreamEvent) error       { return errComingSoon }
func (s *Stub) Close() error                                                        { return nil }
