package signal

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sync"
	"sync/atomic"
	"time"

	"github.com/haiphen/haiphen-cli/internal/broker"
)

// Snapshot represents a trades data snapshot received via WebSocket.
type Snapshot struct {
	Date      string             `json:"date"`
	UpdatedAt string             `json:"updated_at"`
	KPIs      map[string]float64 `json:"kpis"`
	Source    string             `json:"source,omitempty"`
}

// Event represents a signal event to be logged.
type Event struct {
	EventID       string  `json:"event_id"`
	RuleID        string  `json:"rule_id"`
	EventType     string  `json:"event_type"`
	TriggerJSON   string  `json:"trigger_snapshot_json,omitempty"`
	MatchedJSON   string  `json:"matched_conditions_json,omitempty"`
	Symbol        string  `json:"symbol,omitempty"`
	OrderID       string  `json:"order_id,omitempty"`
	OrderSide     string  `json:"order_side,omitempty"`
	OrderQty      float64 `json:"order_qty,omitempty"`
	OrderPrice    float64 `json:"order_price,omitempty"`
	DaemonID      string  `json:"daemon_id,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

// EngineConfig holds engine-level safety limits.
type EngineConfig struct {
	DryRun          bool
	MaxTriggersPerRulePerHour int
	MaxOrdersPerSession       int
	DaemonID        string
	Safety          broker.SafetyConfig
}

// DefaultEngineConfig returns safe defaults.
func DefaultEngineConfig() EngineConfig {
	return EngineConfig{
		DryRun:                    false,
		MaxTriggersPerRulePerHour: 10,
		MaxOrdersPerSession:      50,
		DaemonID:                 "",
		Safety:                   broker.DefaultSafetyConfig(),
	}
}

// Engine evaluates signal rules against snapshots and triggers orders.
type Engine struct {
	mu           sync.RWMutex
	rules        []*Rule
	prevSnapshot *Snapshot
	cooldowns    map[string]time.Time // rule_id → earliest next trigger
	triggerCount map[string][]time.Time // rule_id → trigger timestamps (for hourly cap)
	sessionOrders int
	broker       broker.Broker
	config       EngineConfig
	events       chan<- Event

	// Position copy-trade tracking
	trackedPositions map[string]string // position_id → order_id (dedup)
	posFilter        *PositionFilter
}

// NewEngine creates a new evaluation engine.
func NewEngine(b broker.Broker, cfg EngineConfig, events chan<- Event) *Engine {
	return &Engine{
		rules:            nil,
		prevSnapshot:     nil,
		cooldowns:        make(map[string]time.Time),
		triggerCount:     make(map[string][]time.Time),
		broker:           b,
		config:           cfg,
		events:           events,
		trackedPositions: make(map[string]string),
		posFilter:        DefaultPositionFilter(),
	}
}

// SetPositionFilter sets the position filter for copy-trade processing.
func (e *Engine) SetPositionFilter(f *PositionFilter) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.posFilter = f
}

// TrackedPositions returns a copy of the tracked positions map.
func (e *Engine) TrackedPositions() map[string]string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make(map[string]string, len(e.trackedPositions))
	for k, v := range e.trackedPositions {
		out[k] = v
	}
	return out
}

// ProcessPositionEvents handles incoming position events from the GKE trading engine.
func (e *Engine) ProcessPositionEvents(ctx context.Context, events []PositionEvent) {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := time.Now()

	for _, ev := range events {
		// Apply filter
		if !e.posFilter.Match(ev) {
			continue
		}

		switch ev.TradeStatus {
		case "active":
			// Already tracked? Skip (dedup)
			if _, tracked := e.trackedPositions[ev.ID]; tracked {
				continue
			}

			// Session order cap
			if e.sessionOrders >= e.config.MaxOrdersPerSession {
				e.emitEvent(Event{
					EventID:   generateEventID(),
					RuleID:    "position:" + ev.ID,
					EventType: "order_failed",
					Symbol:    ev.ContractName,
					OrderSide: ev.EntrySide,
					DaemonID:  e.config.DaemonID,
					CreatedAt: now.UTC().Format(time.RFC3339),
				})
				continue
			}

			if e.config.DryRun {
				log.Printf("[dry-run] copy-trade entry: %s %s %s", ev.EntrySide, ev.ContractName, ev.Underlying)
				e.trackedPositions[ev.ID] = "dry-run"
				e.emitEvent(Event{
					EventID:   generateEventID(),
					RuleID:    "position:" + ev.ID,
					EventType: "entry_triggered",
					Symbol:    ev.ContractName,
					OrderSide: ev.EntrySide,
					OrderQty:  e.posFilter.ScaleFactor,
					DaemonID:  e.config.DaemonID,
					CreatedAt: now.UTC().Format(time.RFC3339),
				})
				continue
			}

			if e.broker == nil {
				continue
			}

			// Build entry order
			req := ev.ToEntryOrder(e.posFilter)

			// Safety validation
			if err := broker.ValidateOrderLimits(req, e.config.Safety); err != nil {
				e.emitEvent(Event{
					EventID:   generateEventID(),
					RuleID:    "position:" + ev.ID,
					EventType: "order_failed",
					Symbol:    ev.ContractName,
					OrderSide: req.Side,
					OrderQty:  req.Qty,
					DaemonID:  e.config.DaemonID,
					CreatedAt: now.UTC().Format(time.RFC3339),
				})
				log.Printf("[engine] position entry blocked by safety: %v", err)
				continue
			}

			// Daily loss check for buy orders
			if req.Side == "buy" {
				positions, pErr := e.broker.GetPositions(ctx)
				if pErr == nil {
					var totalPL float64
					for _, pos := range positions {
						totalPL += pos.UnrealizedPL
					}
					if dlErr := broker.ValidateDailyLoss(totalPL, e.config.Safety); dlErr != nil {
						e.emitEvent(Event{
							EventID:   generateEventID(),
							RuleID:    "position:" + ev.ID,
							EventType: "order_failed",
							Symbol:    ev.ContractName,
							OrderSide: req.Side,
							OrderQty:  req.Qty,
							DaemonID:  e.config.DaemonID,
							CreatedAt: now.UTC().Format(time.RFC3339),
						})
						log.Printf("[engine] position entry blocked by daily loss: %v", dlErr)
						continue
					}
				}
			}

			// Place entry order
			order, oErr := e.broker.CreateOrder(ctx, req)
			if oErr != nil {
				e.emitEvent(Event{
					EventID:   generateEventID(),
					RuleID:    "position:" + ev.ID,
					EventType: "order_failed",
					Symbol:    ev.ContractName,
					OrderSide: req.Side,
					OrderQty:  req.Qty,
					DaemonID:  e.config.DaemonID,
					CreatedAt: now.UTC().Format(time.RFC3339),
				})
				log.Printf("[engine] position entry order failed: %v", oErr)
				continue
			}

			e.trackedPositions[ev.ID] = order.OrderID
			e.sessionOrders++

			e.emitEvent(Event{
				EventID:   generateEventID(),
				RuleID:    "position:" + ev.ID,
				EventType: "order_placed",
				Symbol:    ev.ContractName,
				OrderID:   order.OrderID,
				OrderSide: req.Side,
				OrderQty:  req.Qty,
				DaemonID:  e.config.DaemonID,
				CreatedAt: now.UTC().Format(time.RFC3339),
			})
			log.Printf("[engine] position entry: %s %s %.0f %s (order=%s)",
				req.Side, ev.ContractName, req.Qty, order.Status, order.OrderID)

		case "closing":
			// Not tracked? Nothing to close
			if _, tracked := e.trackedPositions[ev.ID]; !tracked {
				continue
			}

			if e.config.DryRun {
				log.Printf("[dry-run] copy-trade exit: %s %s", ev.ContractName, ev.Underlying)
				delete(e.trackedPositions, ev.ID)
				e.emitEvent(Event{
					EventID:   generateEventID(),
					RuleID:    "position:" + ev.ID,
					EventType: "exit_triggered",
					Symbol:    ev.ContractName,
					DaemonID:  e.config.DaemonID,
					CreatedAt: now.UTC().Format(time.RFC3339),
				})
				continue
			}

			if e.broker == nil {
				continue
			}

			// Build exit order (reverse side)
			req := ev.ToExitOrder(e.posFilter)

			if err := broker.ValidateOrderLimits(req, e.config.Safety); err != nil {
				log.Printf("[engine] position exit blocked by safety: %v", err)
				continue
			}

			order, oErr := e.broker.CreateOrder(ctx, req)
			if oErr != nil {
				log.Printf("[engine] position exit order failed: %v", oErr)
				continue
			}

			delete(e.trackedPositions, ev.ID)
			e.sessionOrders++

			e.emitEvent(Event{
				EventID:   generateEventID(),
				RuleID:    "position:" + ev.ID,
				EventType: "order_placed",
				Symbol:    ev.ContractName,
				OrderID:   order.OrderID,
				OrderSide: req.Side,
				OrderQty:  req.Qty,
				DaemonID:  e.config.DaemonID,
				CreatedAt: now.UTC().Format(time.RFC3339),
			})
			log.Printf("[engine] position exit: %s %s %.0f %s (order=%s)",
				req.Side, ev.ContractName, req.Qty, order.Status, order.OrderID)

		case "closed", "deprecated":
			// Cleanup tracking
			delete(e.trackedPositions, ev.ID)
		}
	}
}

// SetRules replaces the active ruleset.
func (e *Engine) SetRules(rules []*Rule) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.rules = rules
}

// Rules returns the current ruleset.
func (e *Engine) Rules() []*Rule {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]*Rule, len(e.rules))
	copy(out, e.rules)
	return out
}

// SessionOrders returns the number of orders placed this session.
func (e *Engine) SessionOrders() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.sessionOrders
}

// Evaluate processes a snapshot against all active rules.
func (e *Engine) Evaluate(ctx context.Context, snap *Snapshot) {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := time.Now()

	for _, r := range e.rules {
		if r.Status != "active" {
			continue
		}

		// Check cooldown
		if earliest, ok := e.cooldowns[r.RuleID]; ok && now.Before(earliest) {
			continue
		}

		// Check hourly trigger cap
		if e.isHourlyCapReached(r.RuleID, now) {
			e.emitEvent(Event{
				EventID:   generateEventID(),
				RuleID:    r.RuleID,
				EventType: "cooldown_blocked",
				DaemonID:  e.config.DaemonID,
				CreatedAt: now.UTC().Format(time.RFC3339),
			})
			continue
		}

		// Check session order cap
		if e.sessionOrders >= e.config.MaxOrdersPerSession {
			continue
		}

		// Evaluate entry conditions
		if r.Entry != nil && e.evaluateGroup(r.Entry, snap, e.prevSnapshot) {
			e.handleTrigger(ctx, r, snap, "entry_triggered", now)
			continue
		}

		// Evaluate exit conditions
		if r.Exit != nil && e.evaluateGroup(r.Exit, snap, e.prevSnapshot) {
			e.handleTrigger(ctx, r, snap, "exit_triggered", now)
		}
	}

	// Update previous snapshot for stateful operators
	e.prevSnapshot = snap
}

func (e *Engine) handleTrigger(ctx context.Context, r *Rule, snap *Snapshot, eventType string, now time.Time) {
	// Set cooldown
	e.cooldowns[r.RuleID] = now.Add(time.Duration(r.Cooldown) * time.Second)

	// Record trigger
	e.triggerCount[r.RuleID] = append(e.triggerCount[r.RuleID], now)

	triggerJSON, _ := json.Marshal(snap.KPIs)

	// Determine symbol (first from rule's symbols list, or empty)
	symbol := ""
	if len(r.Symbols) > 0 {
		symbol = r.Symbols[0]
	}

	// Emit trigger event
	e.emitEvent(Event{
		EventID:     generateEventID(),
		RuleID:      r.RuleID,
		EventType:   eventType,
		TriggerJSON: string(triggerJSON),
		Symbol:      symbol,
		OrderSide:   r.Order.Side,
		OrderQty:    r.Order.Qty,
		DaemonID:    e.config.DaemonID,
		CreatedAt:   now.UTC().Format(time.RFC3339),
	})

	// Dry-run: log but don't order
	if e.config.DryRun {
		log.Printf("[dry-run] rule %q triggered (%s), would %s %.0f %s",
			r.Name, eventType, r.Order.Side, r.Order.Qty, symbol)
		return
	}

	if e.broker == nil {
		log.Printf("[engine] no broker connected, skipping order for rule %q", r.Name)
		return
	}

	// Build order request
	req := broker.OrderRequest{
		Symbol: symbol,
		Qty:    r.Order.Qty,
		Side:   r.Order.Side,
		Type:   r.Order.Type,
		TIF:    r.Order.TIF,
	}

	// Safety validation
	if err := broker.ValidateOrderLimits(req, e.config.Safety); err != nil {
		e.emitEvent(Event{
			EventID:   generateEventID(),
			RuleID:    r.RuleID,
			EventType: "order_failed",
			Symbol:    symbol,
			OrderSide: r.Order.Side,
			OrderQty:  r.Order.Qty,
			DaemonID:  e.config.DaemonID,
			CreatedAt: now.UTC().Format(time.RFC3339),
		})
		log.Printf("[engine] order blocked by safety: %v", err)
		return
	}

	// Check daily loss before buy orders
	if r.Order.Side == "buy" && e.broker != nil {
		positions, err := e.broker.GetPositions(ctx)
		if err == nil {
			var totalPL float64
			for _, p := range positions {
				totalPL += p.UnrealizedPL
			}
			if err := broker.ValidateDailyLoss(totalPL, e.config.Safety); err != nil {
				e.emitEvent(Event{
					EventID:   generateEventID(),
					RuleID:    r.RuleID,
					EventType: "order_failed",
					Symbol:    symbol,
					OrderSide: r.Order.Side,
					OrderQty:  r.Order.Qty,
					DaemonID:  e.config.DaemonID,
					CreatedAt: now.UTC().Format(time.RFC3339),
				})
				log.Printf("[engine] order blocked by daily loss limit: %v", err)
				return
			}
		}
	}

	// Place order
	order, err := e.broker.CreateOrder(ctx, req)
	if err != nil {
		e.emitEvent(Event{
			EventID:   generateEventID(),
			RuleID:    r.RuleID,
			EventType: "order_failed",
			Symbol:    symbol,
			OrderSide: r.Order.Side,
			OrderQty:  r.Order.Qty,
			DaemonID:  e.config.DaemonID,
			CreatedAt: now.UTC().Format(time.RFC3339),
		})
		log.Printf("[engine] order failed: %v", err)
		return
	}

	e.sessionOrders++

	e.emitEvent(Event{
		EventID:   generateEventID(),
		RuleID:    r.RuleID,
		EventType: "order_placed",
		Symbol:    symbol,
		OrderID:   order.OrderID,
		OrderSide: r.Order.Side,
		OrderQty:  r.Order.Qty,
		DaemonID:  e.config.DaemonID,
		CreatedAt: now.UTC().Format(time.RFC3339),
	})
	log.Printf("[engine] order placed: %s %s %.0f %s (id=%s)",
		r.Order.Side, symbol, r.Order.Qty, order.Status, order.OrderID)
}

func (e *Engine) emitEvent(ev Event) {
	if e.events != nil {
		select {
		case e.events <- ev:
		default:
			// Channel full, drop event
		}
	}
}

// evaluateGroup evaluates an AND or OR condition group.
func (e *Engine) evaluateGroup(g *ConditionGroup, snap, prev *Snapshot) bool {
	if len(g.AllOf) > 0 {
		for _, c := range g.AllOf {
			if !e.evaluateCondition(&c, snap, prev) {
				return false
			}
		}
		return true
	}
	if len(g.AnyOf) > 0 {
		for _, c := range g.AnyOf {
			if e.evaluateCondition(&c, snap, prev) {
				return true
			}
		}
		return false
	}
	return false
}

// evaluateCondition evaluates a single condition or nested group.
func (e *Engine) evaluateCondition(c *ConditionOrGroup, snap, prev *Snapshot) bool {
	// Nested group
	if len(c.AllOf) > 0 {
		for _, sub := range c.AllOf {
			if !e.evaluateCondition(&sub, snap, prev) {
				return false
			}
		}
		return true
	}
	if len(c.AnyOf) > 0 {
		for _, sub := range c.AnyOf {
			if e.evaluateCondition(&sub, snap, prev) {
				return true
			}
		}
		return false
	}

	// Leaf condition
	if c.KPI == "" {
		return false
	}

	val, ok := snap.KPIs[c.KPI]
	if !ok {
		// Missing KPI evaluates to false (fail-safe)
		return false
	}

	switch c.Operator {
	case ">":
		return val > c.Value
	case "<":
		return val < c.Value
	case ">=":
		return val >= c.Value
	case "<=":
		return val <= c.Value
	case "==":
		return math.Abs(val-c.Value) < 1e-9
	case "!=":
		return math.Abs(val-c.Value) >= 1e-9
	case "crosses_above":
		if prev == nil {
			return false
		}
		prevVal, ok := prev.KPIs[c.KPI]
		if !ok {
			return false
		}
		return prevVal <= c.Value && val > c.Value
	case "crosses_below":
		if prev == nil {
			return false
		}
		prevVal, ok := prev.KPIs[c.KPI]
		if !ok {
			return false
		}
		return prevVal >= c.Value && val < c.Value
	default:
		return false
	}
}

// isHourlyCapReached checks if a rule has been triggered too many times in the last hour.
func (e *Engine) isHourlyCapReached(ruleID string, now time.Time) bool {
	cutoff := now.Add(-1 * time.Hour)
	var recent []time.Time
	for _, t := range e.triggerCount[ruleID] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	e.triggerCount[ruleID] = recent
	return len(recent) >= e.config.MaxTriggersPerRulePerHour
}

var eventSeq atomic.Int64

// generateEventID creates a short unique ID for events.
func generateEventID() string {
	seq := eventSeq.Add(1)
	return fmt.Sprintf("evt_%d_%d", time.Now().UnixNano(), seq)
}

// ParseSnapshot converts a raw WebSocket JSON message to a Snapshot.
func ParseSnapshot(data []byte) (*Snapshot, error) {
	var raw struct {
		Type      string `json:"type"`
		Date      string `json:"date"`
		UpdatedAt string `json:"updated_at"`
		Rows      []struct {
			KPI   string `json:"kpi"`
			Value string `json:"value"`
		} `json:"rows"`
		Source string `json:"source,omitempty"`
	}

	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	if raw.Type != "snapshot" {
		return nil, fmt.Errorf("unexpected message type: %q", raw.Type)
	}

	kpis := make(map[string]float64)
	for _, row := range raw.Rows {
		var val float64
		if _, err := fmt.Sscanf(row.Value, "%f", &val); err == nil {
			kpis[row.KPI] = val
		}
		// Non-numeric values are silently skipped
	}

	return &Snapshot{
		Date:      raw.Date,
		UpdatedAt: raw.UpdatedAt,
		KPIs:      kpis,
		Source:    raw.Source,
	}, nil
}
