package signal

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/haiphen/haiphen-cli/internal/util"
)

// PushRules bulk-upserts local rules to D1 via the API.
func PushRules(ctx context.Context, apiOrigin, token string, rules []*Rule) (int, error) {
	var payloads []map[string]interface{}
	for _, r := range rules {
		p, err := r.ToAPIPayload()
		if err != nil {
			return 0, fmt.Errorf("rule %q: %w", r.Name, err)
		}
		payloads = append(payloads, p)
	}

	body := map[string]interface{}{
		"rules": payloads,
	}

	data, err := util.ServicePost(ctx, apiOrigin, "/v1/signal/rules/sync", token, body)
	if err != nil {
		return 0, err
	}

	var result struct {
		OK       bool `json:"ok"`
		Upserted int  `json:"upserted"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return 0, fmt.Errorf("parse response: %w", err)
	}
	return result.Upserted, nil
}

// PullEvents fetches signal events from the API since a given timestamp.
func PullEvents(ctx context.Context, apiOrigin, token, since string) ([]Event, error) {
	path := "/v1/signal/events"
	if since != "" {
		path += "?since=" + since
	}

	data, err := util.ServiceGet(ctx, apiOrigin, path, token)
	if err != nil {
		return nil, err
	}

	var result struct {
		Items []Event `json:"items"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse events: %w", err)
	}
	return result.Items, nil
}
