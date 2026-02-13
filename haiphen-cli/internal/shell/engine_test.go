package shell

import (
	"bytes"
	"context"
	"io"
	"sync"
	"testing"
)

func TestState_GetSet(t *testing.T) {
	s := NewState()
	s.Set("key", "value")
	v, ok := s.Get("key")
	if !ok || v != "value" {
		t.Fatalf("expected value, got %v (ok=%v)", v, ok)
	}
	_, ok = s.Get("missing")
	if ok {
		t.Fatal("expected missing key to return ok=false")
	}
}

func TestState_TypedGetters(t *testing.T) {
	s := NewState()

	// String
	s.Set("name", "alice")
	if got := s.GetString("name"); got != "alice" {
		t.Errorf("GetString = %q, want alice", got)
	}
	if got := s.GetString("missing"); got != "" {
		t.Errorf("GetString missing = %q, want empty", got)
	}

	// Bool
	s.Set("ok", true)
	if got := s.GetBool("ok"); !got {
		t.Error("GetBool = false, want true")
	}
	if got := s.GetBool("missing"); got {
		t.Error("GetBool missing = true, want false")
	}

	// Float64
	s.Set("score", 42.5)
	if got := s.GetFloat64("score"); got != 42.5 {
		t.Errorf("GetFloat64 = %f, want 42.5", got)
	}
	if got := s.GetFloat64("missing"); got != 0 {
		t.Errorf("GetFloat64 missing = %f, want 0", got)
	}

	// Int
	s.Set("count", 7)
	if got := s.GetInt("count"); got != 7 {
		t.Errorf("GetInt = %d, want 7", got)
	}
	if got := s.GetInt("missing"); got != 0 {
		t.Errorf("GetInt missing = %d, want 0", got)
	}
}

func TestState_Concurrent(t *testing.T) {
	s := NewState()
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(2)
		go func(n int) {
			defer wg.Done()
			s.Set("key", n)
		}(i)
		go func() {
			defer wg.Done()
			s.Get("key")
		}()
	}
	wg.Wait()
	// If we get here without a race condition, test passes.
}

func TestFuncStep_Skip(t *testing.T) {
	step := NewStep("test", "Test Step",
		func(s *State) bool { return s.GetBool("skip") },
		func(ctx context.Context, w io.Writer, s *State) StepResult {
			return StepResult{}
		},
	)

	state := NewState()
	if step.ShouldSkip(state) {
		t.Error("should not skip when skip=false")
	}

	state.Set("skip", true)
	if !step.ShouldSkip(state) {
		t.Error("should skip when skip=true")
	}
}

func TestFuncStep_NilSkip(t *testing.T) {
	step := NewStep("test", "Test Step", nil,
		func(ctx context.Context, w io.Writer, s *State) StepResult {
			return StepResult{}
		},
	)

	state := NewState()
	if step.ShouldSkip(state) {
		t.Error("nil skipFn should never skip")
	}
}

func TestFuncStep_Run(t *testing.T) {
	step := NewStep("test", "Test Step", nil,
		func(ctx context.Context, w io.Writer, s *State) StepResult {
			s.Set("ran", true)
			return StepResult{NextStep: "next"}
		},
	)

	state := NewState()
	var buf bytes.Buffer
	result := step.Run(context.Background(), &buf, state)

	if !state.GetBool("ran") {
		t.Error("step did not run")
	}
	if result.NextStep != "next" {
		t.Errorf("NextStep = %q, want next", result.NextStep)
	}
}

func TestFuncStep_IDAndName(t *testing.T) {
	step := NewStep("my.id", "My Name", nil,
		func(ctx context.Context, w io.Writer, s *State) StepResult {
			return StepResult{}
		},
	)

	if step.ID() != "my.id" {
		t.Errorf("ID() = %q, want my.id", step.ID())
	}
	if step.Name() != "My Name" {
		t.Errorf("Name() = %q, want My Name", step.Name())
	}
}

func TestWorkflow_EntryGuard(t *testing.T) {
	wf := &Workflow{
		ID:    "test",
		Label: "Test",
		EntryGuard: func(s *State) string {
			if !s.GetBool(KeyLoggedIn) {
				return "must be logged in"
			}
			return ""
		},
	}

	state := NewState()

	// Blocked
	msg := wf.EntryGuard(state)
	if msg == "" {
		t.Error("expected guard to block")
	}

	// Allowed
	state.Set(KeyLoggedIn, true)
	msg = wf.EntryGuard(state)
	if msg != "" {
		t.Errorf("expected guard to pass, got %q", msg)
	}
}

func TestStepResult_NextWorkflow(t *testing.T) {
	result := StepResult{Done: true, NextWorkflow: "trading"}
	if result.NextWorkflow != "trading" {
		t.Errorf("NextWorkflow = %q, want trading", result.NextWorkflow)
	}

	// Empty NextWorkflow means no chaining
	result2 := StepResult{Done: true}
	if result2.NextWorkflow != "" {
		t.Errorf("NextWorkflow should be empty, got %q", result2.NextWorkflow)
	}
}

func TestWorkflowByID(t *testing.T) {
	eng := &Engine{
		state: NewState(),
		workflows: []*Workflow{
			{ID: "onboarding", Label: "Onboarding"},
			{ID: "trading", Label: "Trading"},
			{ID: "prospect", Label: "Prospect"},
		},
	}

	if wf := eng.workflowByID("trading"); wf == nil || wf.ID != "trading" {
		t.Error("expected to find trading workflow")
	}
	if wf := eng.workflowByID("nonexistent"); wf != nil {
		t.Error("expected nil for nonexistent workflow")
	}
}

func TestEngine_State(t *testing.T) {
	eng := &Engine{state: NewState()}
	eng.State().Set("test", true)
	if !eng.State().GetBool("test") {
		t.Error("State() getter should return shared state")
	}
}
