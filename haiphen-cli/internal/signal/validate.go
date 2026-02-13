package signal

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	kpiNameRe     = regexp.MustCompile(`^[\w\s.:/%()+-]{1,100}$`)
	validOperators = map[string]bool{
		">": true, "<": true, ">=": true, "<=": true,
		"==": true, "!=": true,
		"crosses_above": true, "crosses_below": true,
	}
	validSides      = map[string]bool{"buy": true, "sell": true}
	validOrderTypes = map[string]bool{"market": true, "limit": true, "stop": true, "stop_limit": true}
	validTIFs       = map[string]bool{"day": true, "gtc": true, "ioc": true, "fok": true}
	validStatuses   = map[string]bool{"active": true, "paused": true, "disabled": true}

	MaxActiveRules = 50
)

// ValidateRule checks a rule for correctness.
func ValidateRule(r *Rule, maxOrderQty int) error {
	if r.Name == "" {
		return fmt.Errorf("rule name is required")
	}
	if len(r.Name) > 100 {
		return fmt.Errorf("rule name exceeds 100 characters")
	}

	if r.Status == "" {
		r.Status = "active"
	}
	if !validStatuses[r.Status] {
		return fmt.Errorf("invalid status %q: must be one of: active, paused, disabled", r.Status)
	}

	if r.Entry == nil {
		return fmt.Errorf("entry conditions are required")
	}
	if err := validateConditionGroup(r.Entry, "entry"); err != nil {
		return err
	}
	if r.Exit != nil {
		if err := validateConditionGroup(r.Exit, "exit"); err != nil {
			return err
		}
	}

	// Order params
	side := strings.ToLower(r.Order.Side)
	if !validSides[side] {
		return fmt.Errorf("invalid order side %q: must be 'buy' or 'sell'", r.Order.Side)
	}

	otype := strings.ToLower(r.Order.Type)
	if otype == "" {
		otype = "market"
	}
	if !validOrderTypes[otype] {
		return fmt.Errorf("invalid order type %q: must be one of: market, limit, stop, stop_limit", r.Order.Type)
	}

	tif := strings.ToLower(r.Order.TIF)
	if tif == "" {
		tif = "day"
	}
	if !validTIFs[tif] {
		return fmt.Errorf("invalid time-in-force %q: must be one of: day, gtc, ioc, fok", r.Order.TIF)
	}

	if r.Order.Qty <= 0 {
		return fmt.Errorf("order qty must be positive")
	}
	if maxOrderQty > 0 && int(r.Order.Qty) > maxOrderQty {
		return fmt.Errorf("order qty %d exceeds max of %d", int(r.Order.Qty), maxOrderQty)
	}

	// Cooldown
	if r.Cooldown < 60 {
		return fmt.Errorf("cooldown must be at least 60 seconds (got %d)", r.Cooldown)
	}

	// Version
	if r.Version < 1 {
		r.Version = 1
	}

	return nil
}

func validateConditionGroup(g *ConditionGroup, label string) error {
	if len(g.AllOf) == 0 && len(g.AnyOf) == 0 {
		return fmt.Errorf("%s: condition group must have all_of or any_of", label)
	}
	if len(g.AllOf) > 0 && len(g.AnyOf) > 0 {
		return fmt.Errorf("%s: condition group cannot have both all_of and any_of at the same level", label)
	}

	items := g.AllOf
	if len(items) == 0 {
		items = g.AnyOf
	}
	for i, item := range items {
		if err := validateConditionOrGroup(&item, fmt.Sprintf("%s[%d]", label, i)); err != nil {
			return err
		}
	}
	return nil
}

func validateConditionOrGroup(c *ConditionOrGroup, label string) error {
	hasLeaf := c.KPI != ""
	hasNested := len(c.AllOf) > 0 || len(c.AnyOf) > 0

	if !hasLeaf && !hasNested {
		return fmt.Errorf("%s: condition must be a leaf (kpi+operator+value) or a nested group (all_of/any_of)", label)
	}

	if hasLeaf {
		if !kpiNameRe.MatchString(c.KPI) {
			return fmt.Errorf("%s: invalid KPI name %q (must match [\\w\\s.:/%%()+\\-]{1,100})", label, c.KPI)
		}
		if !validOperators[c.Operator] {
			return fmt.Errorf("%s: invalid operator %q", label, c.Operator)
		}
	}

	if hasNested {
		if len(c.AllOf) > 0 && len(c.AnyOf) > 0 {
			return fmt.Errorf("%s: nested group cannot have both all_of and any_of", label)
		}
		items := c.AllOf
		if len(items) == 0 {
			items = c.AnyOf
		}
		for i, sub := range items {
			if err := validateConditionOrGroup(&sub, fmt.Sprintf("%s.%d", label, i)); err != nil {
				return err
			}
		}
	}

	return nil
}
