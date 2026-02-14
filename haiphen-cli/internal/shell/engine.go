package shell

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"

	"golang.org/x/term"

	"github.com/haiphen/haiphen-cli/internal/acl"
	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/tui"
	"github.com/haiphen/haiphen-cli/internal/util"
)

// Well-known state keys.
const (
	KeyUser       = "user"
	KeyEmail      = "email"
	KeyPlan       = "plan"
	KeyRole       = "role"
	KeyEntitled   = "entitled"
	KeyLoggedIn   = "logged_in"
	KeyBrokerOK   = "broker_ok"
	KeyBrokerName = "broker_name"
	KeyAccountID  = "account_id"
	KeyEquity     = "equity"
	KeyBuyingPower = "buying_power"
	KeyDaemonPID  = "daemon_pid"
	KeyRuleCount  = "rule_count"

	// Prospect state keys
	KeyTargetID           = "target_id"
	KeyTargetName         = "target_name"
	KeyLeadCount          = "lead_count"
	KeyInvestigationCount = "investigation_count"
)

// State is a thread-safe data bag shared between steps.
type State struct {
	data map[string]any
	mu   sync.RWMutex
}

// NewState creates an empty state.
func NewState() *State {
	return &State{data: make(map[string]any)}
}

// Get returns a value and whether it exists.
func (s *State) Get(key string) (any, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.data[key]
	return v, ok
}

// Set stores a value.
func (s *State) Set(key string, val any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[key] = val
}

// GetString returns the string value for key, or "".
func (s *State) GetString(key string) string {
	v, ok := s.Get(key)
	if !ok {
		return ""
	}
	str, _ := v.(string)
	return str
}

// GetBool returns the bool value for key, or false.
func (s *State) GetBool(key string) bool {
	v, ok := s.Get(key)
	if !ok {
		return false
	}
	b, _ := v.(bool)
	return b
}

// GetFloat64 returns the float64 value for key, or 0.
func (s *State) GetFloat64(key string) float64 {
	v, ok := s.Get(key)
	if !ok {
		return 0
	}
	f, _ := v.(float64)
	return f
}

// GetInt returns the int value for key, or 0.
func (s *State) GetInt(key string) int {
	v, ok := s.Get(key)
	if !ok {
		return 0
	}
	n, _ := v.(int)
	return n
}

// StepResult is returned by Step.Run to control flow.
type StepResult struct {
	NextStep     string // override next step ID (empty = sequential advance)
	Done         bool   // workflow complete, return to menu
	Error        error  // shown to user, offers retry
	BackToMenu   bool   // user typed "back" or Ctrl+C mid-step
	NextWorkflow string // chain into another workflow by ID after Done
}

// Step is the unit of interaction in a workflow.
type Step interface {
	ID() string
	Name() string
	Run(ctx context.Context, w io.Writer, state *State) StepResult
	ShouldSkip(state *State) bool
}

// FuncStep is a concrete Step backed by closures.
type FuncStep struct {
	id     string
	name   string
	skipFn func(*State) bool
	runFn  func(context.Context, io.Writer, *State) StepResult
}

func (f *FuncStep) ID() string   { return f.id }
func (f *FuncStep) Name() string { return f.name }

func (f *FuncStep) Run(ctx context.Context, w io.Writer, state *State) StepResult {
	return f.runFn(ctx, w, state)
}

func (f *FuncStep) ShouldSkip(state *State) bool {
	if f.skipFn == nil {
		return false
	}
	return f.skipFn(state)
}

// NewStep creates a FuncStep.
func NewStep(id, name string, skipFn func(*State) bool, runFn func(context.Context, io.Writer, *State) StepResult) *FuncStep {
	return &FuncStep{id: id, name: name, skipFn: skipFn, runFn: runFn}
}

// Workflow is a named sequence of steps with an optional entry guard.
type Workflow struct {
	ID          string
	Label       string
	Description string
	Steps       []Step
	EntryGuard  func(*State) string // returns error msg if blocked, "" if ok
}

// StepHook is the LLM integration seam (nil for v1).
type StepHook interface {
	BeforeStep(ctx context.Context, step Step, state *State) string
	AfterStep(ctx context.Context, step Step, result StepResult, state *State) *StepResult
	HandleFreeInput(ctx context.Context, input string, state *State) *StepResult
}

// Engine owns the REPL loop, state, workflows, and status bar.
type Engine struct {
	cfg       *config.Config
	st        store.Store
	acl       *acl.Client
	state     *State
	workflows []*Workflow
	statusBar *StatusBar
	hook      StepHook
	w         io.Writer
}

// NewEngine creates an interactive shell engine.
func NewEngine(cfg *config.Config, st store.Store, aclClient *acl.Client) *Engine {
	return &Engine{
		cfg:       cfg,
		st:        st,
		acl:       aclClient,
		state:     NewState(),
		statusBar: NewStatusBar(),
		w:         os.Stdout,
	}
}

// State returns the engine's shared state (for testing).
func (e *Engine) State() *State { return e.state }

// RegisterWorkflow adds a workflow to the menu.
func (e *Engine) RegisterWorkflow(wf *Workflow) {
	e.workflows = append(e.workflows, wf)
}

// workflowByID returns the workflow with the given ID, or nil.
func (e *Engine) workflowByID(id string) *Workflow {
	for _, wf := range e.workflows {
		if wf.ID == id {
			return wf
		}
	}
	return nil
}

// Run starts the interactive REPL loop.
func (e *Engine) Run(ctx context.Context) error {
	// Clear screen and position cursor at top — content flows downward.
	e.initScreen()

	// Banner + version
	util.PrintBanner(e.w, util.BannerSizeCompact)
	fmt.Fprintf(e.w, "  %s Interactive Shell\n", tui.C(tui.Bold, "Haiphen"))
	fmt.Fprintf(e.w, "  %s\n\n", tui.C(tui.Gray, "↑↓ navigate · enter select · q quit"))

	// Hydrate state silently
	e.hydrate()

	// Main loop
	for {
		if ctx.Err() != nil {
			return nil
		}

		e.statusBar.Render(e.w, e.state)
		fmt.Fprintln(e.w)

		// Build menu options
		menuOptions := make([]string, len(e.workflows)+1)
		for i, wf := range e.workflows {
			menuOptions[i] = fmt.Sprintf("%s %s", wf.Label, tui.C(tui.Gray, "- "+wf.Description))
		}
		menuOptions[len(e.workflows)] = "Quit"

		idx, err := tui.Select("  What would you like to do?", menuOptions)
		if err != nil {
			// Cancelled / Ctrl+C / q → exit
			fmt.Fprintf(e.w, "\n%s\n", tui.C(tui.Gray, "Goodbye."))
			return nil
		}

		// Quit option is last
		if idx == len(e.workflows) {
			fmt.Fprintf(e.w, "\n%s\n", tui.C(tui.Gray, "Goodbye."))
			return nil
		}

		wf := e.workflows[idx]

		// Check entry guard — offer redirect to onboarding if blocked
		if wf.EntryGuard != nil {
			if msg := wf.EntryGuard(e.state); msg != "" {
				fmt.Fprintf(e.w, "\n  %s %s\n", tui.C(tui.Red, "Blocked:"), msg)
				onb := e.workflowByID("onboarding")
				if onb != nil && wf.ID != "onboarding" {
					ok, confirmErr := tui.Confirm("  Run Onboarding instead?", true)
					if confirmErr == nil && ok {
						wf = onb
					} else {
						fmt.Fprintln(e.w)
						continue
					}
				} else {
					fmt.Fprintln(e.w)
					continue
				}
			}
		}

		// Run workflow and follow chains
		nextWF := e.runWorkflow(ctx, wf)
		for nextWF != "" {
			chain := e.workflowByID(nextWF)
			if chain == nil {
				break
			}
			// Check chain target's entry guard
			if chain.EntryGuard != nil {
				if msg := chain.EntryGuard(e.state); msg != "" {
					fmt.Fprintf(e.w, "\n  %s %s\n\n", tui.C(tui.Red, "Blocked:"), msg)
					break
				}
			}
			nextWF = e.runWorkflow(ctx, chain)
		}
		fmt.Fprintln(e.w)
	}
}

// initScreen clears the terminal and sets a scroll region so the banner
// stays visible at the top and interactions flow downward from below it.
func (e *Engine) initScreen() {
	fd := int(os.Stdout.Fd())
	_, height, err := term.GetSize(fd)
	if err != nil || height <= 0 {
		height = 40 // safe fallback
	}

	// Clear screen, move cursor home.
	fmt.Fprint(e.w, "\033[2J\033[H")

	// Pre-fill the bottom half with empty lines so the initial content
	// starts at the top and subsequent output scrolls naturally downward.
	pad := height / 2
	fmt.Fprint(e.w, strings.Repeat("\n", pad))

	// Move cursor back to the top.
	fmt.Fprint(e.w, "\033[H")
}

func (e *Engine) hydrate() {
	CheckAuth(e.cfg, e.st, e.acl, e.state)
	CheckBroker(e.cfg, e.state)
	CheckDaemon(e.cfg, e.state)
}

func (e *Engine) runWorkflow(ctx context.Context, wf *Workflow) string {
	totalSteps := len(wf.Steps)
	i := 0
	for i < totalSteps {
		if ctx.Err() != nil {
			return ""
		}

		step := wf.Steps[i]

		// Step header
		fmt.Fprintf(e.w, "\n%s %s %s %s %s\n",
			tui.C(tui.Gray, "───"),
			tui.C(tui.Bold, wf.Label),
			tui.C(tui.Gray, "───"),
			tui.C(tui.Gray, fmt.Sprintf("Step %d of %d", i+1, totalSteps)),
			tui.C(tui.Gray, "───"))

		if step.ShouldSkip(e.state) {
			fmt.Fprintf(e.w, "  %s %s\n",
				tui.C(tui.Gray, "[skipped]"),
				tui.C(tui.Gray, step.Name()))
			i++
			continue
		}

		// Hook: before step
		if e.hook != nil {
			if intro := e.hook.BeforeStep(ctx, step, e.state); intro != "" {
				fmt.Fprintf(e.w, "  %s\n", intro)
			}
		}

		fmt.Fprintf(e.w, "  %s\n\n", tui.C(tui.Bold, step.Name()))

		result := step.Run(ctx, e.w, e.state)

		// Hook: after step
		if e.hook != nil {
			if override := e.hook.AfterStep(ctx, step, result, e.state); override != nil {
				result = *override
			}
		}

		if result.BackToMenu {
			return ""
		}

		if result.Error != nil {
			fmt.Fprintf(e.w, "\n  %s %s\n", tui.C(tui.Red, "Error:"), result.Error)
			retry, err := tui.Confirm("  Retry?", true)
			if err != nil || !retry {
				return ""
			}
			continue // retry same step
		}

		if result.Done {
			fmt.Fprintf(e.w, "\n  %s %s complete.\n",
				tui.C(tui.Green, "✓"),
				wf.Label)
			return result.NextWorkflow
		}

		if result.NextStep != "" {
			// Jump to named step
			found := false
			for j, s := range wf.Steps {
				if s.ID() == result.NextStep {
					i = j
					found = true
					break
				}
			}
			if !found {
				i++
			}
		} else {
			i++
		}

		// Re-render status bar between steps
		if i < totalSteps {
			fmt.Fprintln(e.w)
			e.statusBar.Render(e.w, e.state)
		}
	}

	fmt.Fprintf(e.w, "\n  %s %s complete.\n",
		tui.C(tui.Green, "✓"),
		wf.Label)
	return ""
}
