package alpaca

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/time/rate"

	"github.com/haiphen/haiphen-cli/internal/broker"
)

func init() {
	broker.Register("alpaca", func(apiKey, apiSecret string) broker.Broker {
		return NewClient(apiKey, apiSecret)
	})
}

// Client implements broker.Broker for Alpaca paper trading.
type Client struct {
	apiKey    string
	apiSecret string
	baseURL   string
	http      *http.Client
	limiter   *rate.Limiter
	account   *alpacaAccount // cached after Connect
}

// NewClient creates a new Alpaca paper trading client.
func NewClient(apiKey, apiSecret string) *Client {
	return &Client{
		apiKey:    apiKey,
		apiSecret: apiSecret,
		baseURL:   broker.PaperBaseURL,
		http:      &http.Client{Timeout: 30 * time.Second},
		limiter:   rate.NewLimiter(rate.Limit(3.33), 10), // 200 req/min
	}
}

func (c *Client) Name() string { return "alpaca" }

// Connect validates credentials by fetching the account.
func (c *Client) Connect(ctx context.Context) error {
	if err := broker.ValidateURL(c.baseURL); err != nil {
		return err
	}

	acct, err := c.fetchAccount(ctx)
	if err != nil {
		return fmt.Errorf("alpaca connect: %w", err)
	}

	// Verify this is a paper account.
	brokerAcct := acct.toBroker()
	if err := broker.ValidateAccountPaper(brokerAcct); err != nil {
		return err
	}

	c.account = acct
	return nil
}

func (c *Client) GetAccount(ctx context.Context) (*broker.Account, error) {
	acct, err := c.fetchAccount(ctx)
	if err != nil {
		return nil, err
	}
	return acct.toBroker(), nil
}

func (c *Client) ProbeConstraints(ctx context.Context) (*broker.AccountConstraints, error) {
	if c.account == nil {
		acct, err := c.fetchAccount(ctx)
		if err != nil {
			return nil, err
		}
		c.account = acct
	}
	return c.account.toConstraints(), nil
}

func (c *Client) GetPositions(ctx context.Context) ([]broker.Position, error) {
	var positions []alpacaPosition
	if err := c.doJSON(ctx, "GET", "/v2/positions", nil, &positions); err != nil {
		return nil, err
	}
	result := make([]broker.Position, len(positions))
	for i, p := range positions {
		result[i] = p.toBroker()
	}
	return result, nil
}

func (c *Client) Close() error {
	return nil
}

func (c *Client) fetchAccount(ctx context.Context) (*alpacaAccount, error) {
	var acct alpacaAccount
	if err := c.doJSON(ctx, "GET", "/v2/account", nil, &acct); err != nil {
		return nil, err
	}
	return &acct, nil
}

// doJSON executes an authenticated request to the Alpaca API.
func (c *Client) doJSON(ctx context.Context, method, path string, body any, result any) error {
	url := c.baseURL + path

	// Defense-in-depth: validate every outgoing URL.
	if err := broker.ValidateURL(url); err != nil {
		return err
	}

	// Rate limiting.
	if err := c.limiter.Wait(ctx); err != nil {
		return fmt.Errorf("rate limit: %w", err)
	}

	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return err
	}

	req.Header.Set("APCA-API-KEY-ID", c.apiKey)
	req.Header.Set("APCA-API-SECRET-KEY", c.apiSecret)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("alpaca %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("alpaca auth failed (%d): check your API key and secret", resp.StatusCode)
	}
	if resp.StatusCode == http.StatusUnprocessableEntity {
		// Alpaca returns 422 for validation errors.
		var apiErr struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(respBody, &apiErr) == nil && apiErr.Message != "" {
			return fmt.Errorf("alpaca: %s", apiErr.Message)
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(respBody))
		if len(msg) > 200 {
			msg = msg[:200]
		}
		return fmt.Errorf("alpaca %s %s (%d): %s", method, path, resp.StatusCode, msg)
	}

	if result != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, result); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}

	return nil
}
