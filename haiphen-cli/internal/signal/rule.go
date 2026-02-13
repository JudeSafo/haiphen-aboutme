package signal

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
)

// Rule defines a signal rule with entry/exit conditions and order parameters.
type Rule struct {
	Version     int              `yaml:"version"     json:"version"`
	RuleID      string           `yaml:"rule_id,omitempty" json:"rule_id"`
	Name        string           `yaml:"name"        json:"name"`
	Description string           `yaml:"description,omitempty" json:"description,omitempty"`
	Status      string           `yaml:"status"      json:"status"`
	Symbols     []string         `yaml:"symbols,omitempty" json:"symbols,omitempty"`
	Entry       *ConditionGroup  `yaml:"entry"       json:"entry"`
	Exit        *ConditionGroup  `yaml:"exit,omitempty" json:"exit,omitempty"`
	Order       OrderParams      `yaml:"order"       json:"order"`
	Cooldown    int              `yaml:"cooldown"    json:"cooldown"`
	Temporal    *TemporalConfig  `yaml:"temporal,omitempty" json:"temporal,omitempty"`
}

// ConditionGroup is an AND/OR tree of conditions.
type ConditionGroup struct {
	AllOf []ConditionOrGroup `yaml:"all_of,omitempty" json:"all_of,omitempty"`
	AnyOf []ConditionOrGroup `yaml:"any_of,omitempty" json:"any_of,omitempty"`
}

// ConditionOrGroup is either a leaf condition or a nested group.
type ConditionOrGroup struct {
	// Leaf fields
	KPI      string  `yaml:"kpi,omitempty"      json:"kpi,omitempty"`
	Operator string  `yaml:"operator,omitempty" json:"operator,omitempty"`
	Value    float64 `yaml:"value,omitempty"    json:"value,omitempty"`

	// Nested groups
	AllOf []ConditionOrGroup `yaml:"all_of,omitempty" json:"all_of,omitempty"`
	AnyOf []ConditionOrGroup `yaml:"any_of,omitempty" json:"any_of,omitempty"`
}

// OrderParams defines the order to place when a rule triggers.
type OrderParams struct {
	Side string  `yaml:"side" json:"side"`
	Type string  `yaml:"type" json:"type"`
	Qty  float64 `yaml:"qty"  json:"qty"`
	TIF  string  `yaml:"tif"  json:"tif"`
}

// TemporalConfig is a placeholder for per-contract time windows.
type TemporalConfig struct {
	Enabled bool `yaml:"enabled" json:"enabled"`
}

// IsLeaf returns true if this node is a leaf condition (has a KPI).
func (c *ConditionOrGroup) IsLeaf() bool {
	return c.KPI != ""
}

// DeterministicID generates a rule ID from user + name.
func DeterministicID(user, name string) string {
	h := sha256.Sum256([]byte(user + ":" + name))
	return fmt.Sprintf("%x", h[:8])
}

// ToAPIPayload converts a Rule to the JSON structure expected by the API.
func (r *Rule) ToAPIPayload() (map[string]interface{}, error) {
	entryJSON, err := json.Marshal(r.Entry)
	if err != nil {
		return nil, fmt.Errorf("marshal entry: %w", err)
	}

	payload := map[string]interface{}{
		"rule_id":              r.RuleID,
		"name":                 r.Name,
		"status":               r.Status,
		"entry_conditions_json": string(entryJSON),
		"order_side":           r.Order.Side,
		"order_type":           r.Order.Type,
		"order_qty":            r.Order.Qty,
		"order_tif":            r.Order.TIF,
		"cooldown_seconds":     r.Cooldown,
		"version":              r.Version,
	}

	if len(r.Symbols) > 0 {
		syms, _ := json.Marshal(r.Symbols)
		payload["symbols_json"] = string(syms)
	}

	if r.Exit != nil {
		exitJSON, err := json.Marshal(r.Exit)
		if err != nil {
			return nil, fmt.Errorf("marshal exit: %w", err)
		}
		payload["exit_conditions_json"] = string(exitJSON)
	}

	if r.Temporal != nil {
		tj, _ := json.Marshal(r.Temporal)
		payload["temporal_json"] = string(tj)
	}

	return payload, nil
}
