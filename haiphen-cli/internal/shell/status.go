package shell

import (
	"fmt"
	"io"

	"github.com/haiphen/haiphen-cli/internal/tui"
)

// StatusBar renders a compact ANSI status line.
type StatusBar struct{}

// NewStatusBar creates a status bar renderer.
func NewStatusBar() *StatusBar {
	return &StatusBar{}
}

// Render prints the status bar from current state.
func (sb *StatusBar) Render(w io.Writer, state *State) {
	var parts []string

	// User segment
	if state.GetBool(KeyLoggedIn) {
		email := state.GetString(KeyEmail)
		if email == "" {
			email = state.GetString(KeyUser)
		}
		if email != "" {
			parts = append(parts, tui.C(tui.Cyan, email))
		}
	} else {
		parts = append(parts, tui.C(tui.Red, "not logged in"))
	}

	// Plan segment
	plan := state.GetString(KeyPlan)
	if plan != "" {
		color := tui.Gray
		if plan == "pro" || plan == "enterprise" {
			color = tui.Green
		}
		parts = append(parts, tui.C(color, plan))
	}

	// Broker segment
	if state.GetBool(KeyBrokerOK) {
		parts = append(parts, tui.C(tui.Green, "broker:ok"))
	}

	// Daemon segment
	if pid := state.GetInt(KeyDaemonPID); pid > 0 {
		parts = append(parts, tui.C(tui.Green, fmt.Sprintf("daemon:%d", pid)))
	}

	// Leads segment
	if leads := state.GetInt(KeyLeadCount); leads > 0 {
		parts = append(parts, tui.C(tui.Cyan, fmt.Sprintf("leads:%d", leads)))
	}

	bar := tui.C(tui.Gray, "━━ ")
	for i, p := range parts {
		if i > 0 {
			bar += tui.C(tui.Gray, " | ")
		}
		bar += p
	}
	bar += tui.C(tui.Gray, " ━━")

	fmt.Fprintln(w, bar)
}
