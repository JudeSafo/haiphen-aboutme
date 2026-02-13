package signal

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestDeterministicID(t *testing.T) {
	id1 := DeterministicID("user1", "delta-hedge")
	id2 := DeterministicID("user1", "delta-hedge")
	id3 := DeterministicID("user2", "delta-hedge")

	if id1 != id2 {
		t.Fatalf("same inputs should produce same ID: %s != %s", id1, id2)
	}
	if id1 == id3 {
		t.Fatal("different users should produce different IDs")
	}
	if len(id1) != 16 {
		t.Fatalf("expected 16-char hex ID, got %d chars: %s", len(id1), id1)
	}
}

func TestRuleYAMLRoundTrip(t *testing.T) {
	yamlData := `
version: 1
name: delta-hedge-entry
status: active
symbols: [AAPL, SPY]
entry:
  all_of:
    - kpi: Delta
      operator: ">"
      value: 0.5
    - kpi: Gamma
      operator: "<"
      value: 0.1
exit:
  all_of:
    - kpi: Delta
      operator: crosses_below
      value: 0.3
order:
  side: buy
  type: market
  qty: 10
  tif: day
cooldown: 300
`

	var r Rule
	if err := yaml.Unmarshal([]byte(yamlData), &r); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if r.Name != "delta-hedge-entry" {
		t.Fatalf("unexpected name: %s", r.Name)
	}
	if r.Status != "active" {
		t.Fatalf("unexpected status: %s", r.Status)
	}
	if len(r.Symbols) != 2 {
		t.Fatalf("expected 2 symbols, got %d", len(r.Symbols))
	}
	if r.Entry == nil || len(r.Entry.AllOf) != 2 {
		t.Fatal("expected entry with 2 all_of conditions")
	}
	if r.Entry.AllOf[0].KPI != "Delta" {
		t.Fatalf("unexpected KPI: %s", r.Entry.AllOf[0].KPI)
	}
	if r.Entry.AllOf[0].Operator != ">" {
		t.Fatalf("unexpected operator: %s", r.Entry.AllOf[0].Operator)
	}
	if r.Exit == nil || len(r.Exit.AllOf) != 1 {
		t.Fatal("expected exit with 1 all_of condition")
	}
	if r.Exit.AllOf[0].Operator != "crosses_below" {
		t.Fatalf("unexpected exit operator: %s", r.Exit.AllOf[0].Operator)
	}
	if r.Order.Side != "buy" || r.Order.Qty != 10 {
		t.Fatalf("unexpected order: %+v", r.Order)
	}
	if r.Cooldown != 300 {
		t.Fatalf("unexpected cooldown: %d", r.Cooldown)
	}

	// Marshal back
	out, err := yaml.Marshal(&r)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if len(out) == 0 {
		t.Fatal("empty marshal output")
	}
}

func TestRuleYAML_NestedConditions(t *testing.T) {
	yamlData := `
version: 1
name: nested-test
status: active
entry:
  all_of:
    - kpi: Delta
      operator: ">"
      value: 0.5
    - any_of:
        - kpi: Portfolio Value
          operator: ">="
          value: 100000
        - kpi: Buying Power
          operator: ">="
          value: 50000
order:
  side: buy
  type: market
  qty: 5
  tif: day
cooldown: 60
`

	var r Rule
	if err := yaml.Unmarshal([]byte(yamlData), &r); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if len(r.Entry.AllOf) != 2 {
		t.Fatalf("expected 2 all_of items, got %d", len(r.Entry.AllOf))
	}

	nested := r.Entry.AllOf[1]
	if len(nested.AnyOf) != 2 {
		t.Fatalf("expected nested any_of with 2 items, got %d", len(nested.AnyOf))
	}
	if nested.AnyOf[0].KPI != "Portfolio Value" {
		t.Fatalf("unexpected nested KPI: %s", nested.AnyOf[0].KPI)
	}
}

func TestToAPIPayload(t *testing.T) {
	r := &Rule{
		Version:  1,
		RuleID:   "abc123",
		Name:     "test-rule",
		Status:   "active",
		Symbols:  []string{"AAPL"},
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 300,
	}

	payload, err := r.ToAPIPayload()
	if err != nil {
		t.Fatalf("ToAPIPayload error: %v", err)
	}

	if payload["rule_id"] != "abc123" {
		t.Fatalf("unexpected rule_id: %v", payload["rule_id"])
	}
	if payload["order_side"] != "buy" {
		t.Fatalf("unexpected order_side: %v", payload["order_side"])
	}
	if _, ok := payload["entry_conditions_json"]; !ok {
		t.Fatal("missing entry_conditions_json")
	}
	if _, ok := payload["symbols_json"]; !ok {
		t.Fatal("missing symbols_json")
	}
}

func TestLoadRuleFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.yaml")

	content := `
version: 1
name: file-test
status: active
entry:
  all_of:
    - kpi: X
      operator: ">"
      value: 10
order:
  side: sell
  type: limit
  qty: 5
  tif: gtc
cooldown: 120
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	r, err := LoadRuleFile(path)
	if err != nil {
		t.Fatalf("LoadRuleFile: %v", err)
	}

	if r.Name != "file-test" {
		t.Fatalf("unexpected name: %s", r.Name)
	}
	if r.Order.Type != "limit" {
		t.Fatalf("unexpected type: %s", r.Order.Type)
	}
	if r.Cooldown != 120 {
		t.Fatalf("unexpected cooldown: %d", r.Cooldown)
	}
}

func TestLoadRulesFromDir(t *testing.T) {
	dir := t.TempDir()

	// Write two rule files
	for _, name := range []string{"rule-a.yaml", "rule-b.yaml"} {
		content := `
version: 1
name: ` + name + `
status: active
entry:
  all_of:
    - kpi: X
      operator: ">"
      value: 0
order:
  side: buy
  type: market
  qty: 1
  tif: day
cooldown: 60
`
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	// Write a non-YAML file (should be ignored)
	if err := os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("ignore me"), 0o600); err != nil {
		t.Fatal(err)
	}

	rules, err := LoadRulesFromDir(dir)
	if err != nil {
		t.Fatalf("LoadRulesFromDir: %v", err)
	}

	if len(rules) != 2 {
		t.Fatalf("expected 2 rules, got %d", len(rules))
	}
}

func TestSaveAndDeleteRule(t *testing.T) {
	dir := t.TempDir()

	r := &Rule{
		Version:  1,
		Name:     "Save Test",
		Status:   "active",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 0}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 1, TIF: "day"},
		Cooldown: 60,
	}

	if err := SaveRule(dir, r); err != nil {
		t.Fatalf("SaveRule: %v", err)
	}

	// Verify file exists
	path := filepath.Join(dir, "save-test.yaml")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected file at %s: %v", path, err)
	}

	// Delete
	if err := DeleteRule(dir, "Save Test"); err != nil {
		t.Fatalf("DeleteRule: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("expected file to be deleted")
	}
}
