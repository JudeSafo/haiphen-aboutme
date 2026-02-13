package signal

import (
	"strings"
	"testing"
)

func TestValidateRule_Valid(t *testing.T) {
	r := &Rule{
		Name:     "valid-rule",
		Status:   "active",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
		Version:  1,
	}
	if err := ValidateRule(r, 1000); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateRule_MissingName(t *testing.T) {
	r := &Rule{
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "name") {
		t.Fatalf("expected name error, got: %v", err)
	}
}

func TestValidateRule_MissingEntry(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "entry") {
		t.Fatalf("expected entry error, got: %v", err)
	}
}

func TestValidateRule_InvalidSide(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "hold", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "side") {
		t.Fatalf("expected side error, got: %v", err)
	}
}

func TestValidateRule_InvalidOrderType(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "trailing_stop", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "order type") {
		t.Fatalf("expected order type error, got: %v", err)
	}
}

func TestValidateRule_InvalidTIF(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "opg"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "time-in-force") {
		t.Fatalf("expected TIF error, got: %v", err)
	}
}

func TestValidateRule_ZeroQty(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 0, TIF: "day"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "qty") {
		t.Fatalf("expected qty error, got: %v", err)
	}
}

func TestValidateRule_ExceedsMaxQty(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 1500, TIF: "day"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "max") {
		t.Fatalf("expected max qty error, got: %v", err)
	}
}

func TestValidateRule_CooldownTooLow(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 30,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "cooldown") {
		t.Fatalf("expected cooldown error, got: %v", err)
	}
}

func TestValidateRule_InvalidOperator(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: "~=", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "operator") {
		t.Fatalf("expected operator error, got: %v", err)
	}
}

func TestValidateRule_InvalidKPIName(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X<script>alert(1)</script>", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "KPI name") {
		t.Fatalf("expected KPI name error, got: %v", err)
	}
}

func TestValidateRule_EmptyConditionGroup(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Entry:    &ConditionGroup{},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "all_of or any_of") {
		t.Fatalf("expected empty group error, got: %v", err)
	}
}

func TestValidateRule_BothAllOfAndAnyOf(t *testing.T) {
	r := &Rule{
		Name: "test",
		Entry: &ConditionGroup{
			AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}},
			AnyOf: []ConditionOrGroup{{KPI: "Y", Operator: "<", Value: 3}},
		},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	err := ValidateRule(r, 1000)
	if err == nil || !strings.Contains(err.Error(), "both all_of and any_of") {
		t.Fatalf("expected both error, got: %v", err)
	}
}

func TestValidateRule_DefaultStatus(t *testing.T) {
	r := &Rule{
		Name:     "test",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	if err := ValidateRule(r, 1000); err != nil {
		t.Fatal(err)
	}
	if r.Status != "active" {
		t.Fatalf("expected default status 'active', got %q", r.Status)
	}
}
