package alpaca

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/gorilla/websocket"

	"github.com/haiphen/haiphen-cli/internal/broker"
)

// StreamUpdates connects to the Alpaca WebSocket and streams trade updates.
func (c *Client) StreamUpdates(ctx context.Context, events chan<- broker.StreamEvent) error {
	if err := broker.ValidateURL(broker.PaperStreamURL); err != nil {
		return err
	}

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, _, err := dialer.DialContext(ctx, broker.PaperStreamURL, nil)
	if err != nil {
		return fmt.Errorf("websocket connect: %w", err)
	}
	defer conn.Close()

	// Authenticate.
	authMsg := map[string]any{
		"action": "auth",
		"key":    c.apiKey,
		"secret": c.apiSecret,
	}
	if err := conn.WriteJSON(authMsg); err != nil {
		return fmt.Errorf("websocket auth: %w", err)
	}

	// Read auth response.
	_, msg, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("websocket auth response: %w", err)
	}

	var authResp []struct {
		T   string `json:"T"`
		Msg string `json:"msg"`
	}
	if err := json.Unmarshal(msg, &authResp); err == nil {
		for _, r := range authResp {
			if r.T == "error" {
				return fmt.Errorf("websocket auth error: %s", r.Msg)
			}
		}
	}

	// Subscribe to trade updates.
	subMsg := map[string]any{
		"action": "listen",
		"data": map[string]any{
			"streams": []string{"trade_updates"},
		},
	}
	if err := conn.WriteJSON(subMsg); err != nil {
		return fmt.Errorf("websocket subscribe: %w", err)
	}

	// Read messages until context cancellation.
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return fmt.Errorf("websocket read: %w", err)
		}

		var envelope struct {
			Stream string          `json:"stream"`
			Data   json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(msg, &envelope); err != nil {
			continue // skip malformed messages
		}

		if envelope.Stream == "trade_updates" {
			event, err := parseTradeUpdate(envelope.Data)
			if err == nil {
				select {
				case events <- event:
				case <-ctx.Done():
					return ctx.Err()
				}
			}
		}
	}
}

func parseTradeUpdate(data json.RawMessage) (broker.StreamEvent, error) {
	var update struct {
		Event     string `json:"event"`
		Timestamp string `json:"timestamp"`
		Order     struct {
			ID     string `json:"id"`
			Symbol string `json:"symbol"`
			Side   string `json:"side"`
			Qty    string `json:"qty"`
			Type   string `json:"type"`
			Status string `json:"status"`
		} `json:"order"`
		Price string `json:"price"`
		Qty   string `json:"qty"`
	}
	if err := json.Unmarshal(data, &update); err != nil {
		return broker.StreamEvent{}, err
	}

	event := broker.StreamEvent{
		Type:      update.Event,
		Symbol:    update.Order.Symbol,
		Side:      update.Order.Side,
		Qty:       parseFloat(update.Order.Qty),
		Price:     parseFloat(update.Price),
		Status:    update.Order.Status,
		OrderID:   update.Order.ID,
		Timestamp: time.Now(),
	}

	if t, err := time.Parse(time.RFC3339Nano, update.Timestamp); err == nil {
		event.Timestamp = t
	}

	return event, nil
}
