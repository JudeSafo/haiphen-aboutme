package signal

import (
	"context"
	"testing"
)

func TestEvaluateGroup_AllOf(t *testing.T) {
	engine := NewEngine(nil, DefaultEngineConfig(), nil)

	snap := &Snapshot{
		KPIs: map[string]float64{
			"Delta": 0.6,
			"Gamma": 0.05,
		},
	}

	group := &ConditionGroup{
		AllOf: []ConditionOrGroup{
			{KPI: "Delta", Operator: ">", Value: 0.5},
			{KPI: "Gamma", Operator: "<", Value: 0.1},
		},
	}

	if !engine.evaluateGroup(group, snap, nil) {
		t.Fatal("expected all_of to match")
	}

	// Change one to fail
	snap.KPIs["Delta"] = 0.3
	if engine.evaluateGroup(group, snap, nil) {
		t.Fatal("expected all_of to NOT match")
	}
}

func TestEvaluateGroup_AnyOf(t *testing.T) {
	engine := NewEngine(nil, DefaultEngineConfig(), nil)

	snap := &Snapshot{
		KPIs: map[string]float64{
			"Delta": 0.3,
			"Gamma": 0.05,
		},
	}

	group := &ConditionGroup{
		AnyOf: []ConditionOrGroup{
			{KPI: "Delta", Operator: ">", Value: 0.5},
			{KPI: "Gamma", Operator: "<", Value: 0.1},
		},
	}

	if !engine.evaluateGroup(group, snap, nil) {
		t.Fatal("expected any_of to match (gamma matches)")
	}

	snap.KPIs["Gamma"] = 0.2
	if engine.evaluateGroup(group, snap, nil) {
		t.Fatal("expected any_of to NOT match")
	}
}

func TestEvaluateCondition_Operators(t *testing.T) {
	engine := NewEngine(nil, DefaultEngineConfig(), nil)
	snap := &Snapshot{KPIs: map[string]float64{"X": 10}}

	tests := []struct {
		op    string
		val   float64
		want  bool
	}{
		{">", 5, true},
		{">", 10, false},
		{"<", 15, true},
		{"<", 10, false},
		{">=", 10, true},
		{">=", 11, false},
		{"<=", 10, true},
		{"<=", 9, false},
		{"==", 10, true},
		{"==", 10.1, false},
		{"!=", 5, true},
		{"!=", 10, false},
	}

	for _, tt := range tests {
		c := &ConditionOrGroup{KPI: "X", Operator: tt.op, Value: tt.val}
		got := engine.evaluateCondition(c, snap, nil)
		if got != tt.want {
			t.Errorf("X=10 %s %.1f: got %v, want %v", tt.op, tt.val, got, tt.want)
		}
	}
}

func TestEvaluateCondition_CrossesAbove(t *testing.T) {
	engine := NewEngine(nil, DefaultEngineConfig(), nil)

	prev := &Snapshot{KPIs: map[string]float64{"Delta": 0.4}}
	curr := &Snapshot{KPIs: map[string]float64{"Delta": 0.6}}

	c := &ConditionOrGroup{KPI: "Delta", Operator: "crosses_above", Value: 0.5}

	if !engine.evaluateCondition(c, curr, prev) {
		t.Fatal("expected crosses_above to match")
	}

	// Already above → should not trigger
	prev2 := &Snapshot{KPIs: map[string]float64{"Delta": 0.55}}
	if engine.evaluateCondition(c, curr, prev2) {
		t.Fatal("should not trigger when already above")
	}

	// No prev → should not trigger
	if engine.evaluateCondition(c, curr, nil) {
		t.Fatal("should not trigger without previous snapshot")
	}
}

func TestEvaluateCondition_CrossesBelow(t *testing.T) {
	engine := NewEngine(nil, DefaultEngineConfig(), nil)

	prev := &Snapshot{KPIs: map[string]float64{"Delta": 0.6}}
	curr := &Snapshot{KPIs: map[string]float64{"Delta": 0.2}}

	c := &ConditionOrGroup{KPI: "Delta", Operator: "crosses_below", Value: 0.3}

	if !engine.evaluateCondition(c, curr, prev) {
		t.Fatal("expected crosses_below to match")
	}

	prev2 := &Snapshot{KPIs: map[string]float64{"Delta": 0.25}}
	if engine.evaluateCondition(c, curr, prev2) {
		t.Fatal("should not trigger when already below")
	}
}

func TestEvaluateCondition_MissingKPI(t *testing.T) {
	engine := NewEngine(nil, DefaultEngineConfig(), nil)
	snap := &Snapshot{KPIs: map[string]float64{}}

	c := &ConditionOrGroup{KPI: "NonExistent", Operator: ">", Value: 0}
	if engine.evaluateCondition(c, snap, nil) {
		t.Fatal("missing KPI should evaluate to false")
	}
}

func TestEvaluateGroup_NestedConditions(t *testing.T) {
	engine := NewEngine(nil, DefaultEngineConfig(), nil)

	snap := &Snapshot{
		KPIs: map[string]float64{
			"Delta":           0.6,
			"Gamma":           0.05,
			"Portfolio Value": 120000,
			"Buying Power":    30000,
		},
	}

	// all_of: Delta > 0.5 AND Gamma < 0.1 AND any_of(PV >= 100k OR BP >= 50k)
	group := &ConditionGroup{
		AllOf: []ConditionOrGroup{
			{KPI: "Delta", Operator: ">", Value: 0.5},
			{KPI: "Gamma", Operator: "<", Value: 0.1},
			{
				AnyOf: []ConditionOrGroup{
					{KPI: "Portfolio Value", Operator: ">=", Value: 100000},
					{KPI: "Buying Power", Operator: ">=", Value: 50000},
				},
			},
		},
	}

	if !engine.evaluateGroup(group, snap, nil) {
		t.Fatal("expected nested condition to match")
	}

	// Remove portfolio value match AND buying power match
	snap.KPIs["Portfolio Value"] = 50000
	snap.KPIs["Buying Power"] = 20000
	if engine.evaluateGroup(group, snap, nil) {
		t.Fatal("expected nested condition to NOT match when neither any_of matches")
	}
}

func TestEngine_DryRun(t *testing.T) {
	events := make(chan Event, 10)
	ecfg := DefaultEngineConfig()
	ecfg.DryRun = true
	ecfg.DaemonID = "test"

	engine := NewEngine(nil, ecfg, events)

	rule := &Rule{
		RuleID:   "test-rule-1",
		Name:     "test",
		Status:   "active",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	engine.SetRules([]*Rule{rule})

	snap := &Snapshot{KPIs: map[string]float64{"X": 10}}
	engine.Evaluate(context.Background(), snap)

	// Should emit entry_triggered event but no order
	select {
	case ev := <-events:
		if ev.EventType != "entry_triggered" {
			t.Fatalf("expected entry_triggered, got %s", ev.EventType)
		}
	default:
		t.Fatal("expected event from dry-run trigger")
	}

	// No order_placed should follow
	select {
	case ev := <-events:
		t.Fatalf("unexpected event: %s", ev.EventType)
	default:
		// Good — no order placed
	}
}

func TestEngine_Cooldown(t *testing.T) {
	events := make(chan Event, 10)
	ecfg := DefaultEngineConfig()
	ecfg.DryRun = true
	ecfg.DaemonID = "test"

	engine := NewEngine(nil, ecfg, events)

	rule := &Rule{
		RuleID:   "test-cooldown",
		Name:     "cooldown-test",
		Status:   "active",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 5}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 300, // 5 minutes
	}
	engine.SetRules([]*Rule{rule})

	snap := &Snapshot{KPIs: map[string]float64{"X": 10}}

	// First evaluation should trigger
	engine.Evaluate(context.Background(), snap)
	select {
	case <-events:
		// Good
	default:
		t.Fatal("expected first trigger")
	}

	// Second evaluation should be blocked by cooldown
	engine.Evaluate(context.Background(), snap)
	select {
	case ev := <-events:
		t.Fatalf("expected cooldown block, got: %s", ev.EventType)
	default:
		// Good — cooldown blocked
	}
}

func TestEngine_PausedRuleSkipped(t *testing.T) {
	events := make(chan Event, 10)
	ecfg := DefaultEngineConfig()
	ecfg.DryRun = true

	engine := NewEngine(nil, ecfg, events)

	rule := &Rule{
		RuleID:   "paused-rule",
		Name:     "paused",
		Status:   "paused",
		Entry:    &ConditionGroup{AllOf: []ConditionOrGroup{{KPI: "X", Operator: ">", Value: 0}}},
		Order:    OrderParams{Side: "buy", Type: "market", Qty: 10, TIF: "day"},
		Cooldown: 60,
	}
	engine.SetRules([]*Rule{rule})

	snap := &Snapshot{KPIs: map[string]float64{"X": 100}}
	engine.Evaluate(context.Background(), snap)

	select {
	case ev := <-events:
		t.Fatalf("paused rule should not trigger, got: %s", ev.EventType)
	default:
		// Good
	}
}

func TestParseSnapshot(t *testing.T) {
	data := []byte(`{
		"type": "snapshot",
		"date": "2026-02-11",
		"updated_at": "2026-02-11T10:00:00Z",
		"rows": [
			{"kpi": "Delta", "value": "0.55"},
			{"kpi": "Portfolio Value", "value": "123456.78"},
			{"kpi": "Status", "value": "active"}
		],
		"source": "paper:alpaca"
	}`)

	snap, err := ParseSnapshot(data)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if snap.Date != "2026-02-11" {
		t.Fatalf("unexpected date: %s", snap.Date)
	}
	if snap.KPIs["Delta"] != 0.55 {
		t.Fatalf("unexpected Delta: %f", snap.KPIs["Delta"])
	}
	if snap.KPIs["Portfolio Value"] != 123456.78 {
		t.Fatalf("unexpected Portfolio Value: %f", snap.KPIs["Portfolio Value"])
	}
	// Non-numeric "Status" should be silently skipped
	if _, ok := snap.KPIs["Status"]; ok {
		t.Fatal("non-numeric KPI should not be in KPIs map")
	}
}

func TestParseSnapshot_WrongType(t *testing.T) {
	data := []byte(`{"type": "hello", "ts": 12345}`)
	_, err := ParseSnapshot(data)
	if err == nil {
		t.Fatal("expected error for non-snapshot type")
	}
}
