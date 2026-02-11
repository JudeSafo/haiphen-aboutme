package alpaca

import (
	"context"
	"fmt"
	"net/url"
	"strconv"

	"github.com/haiphen/haiphen-cli/internal/broker"
)

func (c *Client) CreateOrder(ctx context.Context, req broker.OrderRequest) (*broker.Order, error) {
	body := brokerOrderRequest(req)
	var resp alpacaOrder
	if err := c.doJSON(ctx, "POST", "/v2/orders", body, &resp); err != nil {
		return nil, err
	}
	order := resp.toBroker()
	return &order, nil
}

func (c *Client) CancelOrder(ctx context.Context, orderID string) error {
	return c.doJSON(ctx, "DELETE", "/v2/orders/"+orderID, nil, nil)
}

func (c *Client) CancelAllOrders(ctx context.Context) (int, error) {
	var cancelled []struct {
		ID     string `json:"id"`
		Status int    `json:"status"`
	}
	if err := c.doJSON(ctx, "DELETE", "/v2/orders", nil, &cancelled); err != nil {
		return 0, err
	}
	return len(cancelled), nil
}

func (c *Client) GetOrders(ctx context.Context, status string, limit int) ([]broker.Order, error) {
	params := url.Values{}
	if status != "" {
		params.Set("status", status)
	}
	if limit > 0 {
		params.Set("limit", strconv.Itoa(limit))
	}

	path := "/v2/orders"
	if len(params) > 0 {
		path += "?" + params.Encode()
	}

	var orders []alpacaOrder
	if err := c.doJSON(ctx, "GET", path, nil, &orders); err != nil {
		return nil, err
	}

	result := make([]broker.Order, len(orders))
	for i, o := range orders {
		result[i] = o.toBroker()
	}
	return result, nil
}

func (c *Client) GetOrderByID(ctx context.Context, orderID string) (*broker.Order, error) {
	if orderID == "" {
		return nil, fmt.Errorf("order ID is required")
	}
	var o alpacaOrder
	if err := c.doJSON(ctx, "GET", "/v2/orders/"+orderID, nil, &o); err != nil {
		return nil, err
	}
	order := o.toBroker()
	return &order, nil
}
