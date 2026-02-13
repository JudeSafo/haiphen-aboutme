package shell

import (
	"bytes"
	"strings"
	"testing"
)

func renderStatusBar(state *State) string {
	sb := NewStatusBar()
	var buf bytes.Buffer
	sb.Render(&buf, state)
	return buf.String()
}

func TestStatusBar_NotLoggedIn(t *testing.T) {
	state := NewState()
	out := renderStatusBar(state)

	if !strings.Contains(out, "not logged in") {
		t.Errorf("expected 'not logged in' in status bar, got:\n%s", out)
	}
}

func TestStatusBar_LoggedInWithPlan(t *testing.T) {
	state := NewState()
	state.Set(KeyLoggedIn, true)
	state.Set(KeyEmail, "jude@haiphen.io")
	state.Set(KeyPlan, "pro")

	out := renderStatusBar(state)

	if !strings.Contains(out, "jude@haiphen.io") {
		t.Error("expected email in status bar")
	}
	if !strings.Contains(out, "pro") {
		t.Error("expected plan in status bar")
	}
}

func TestStatusBar_FullState(t *testing.T) {
	state := NewState()
	state.Set(KeyLoggedIn, true)
	state.Set(KeyEmail, "test@example.com")
	state.Set(KeyPlan, "enterprise")
	state.Set(KeyBrokerOK, true)
	state.Set(KeyDaemonPID, 12345)

	out := renderStatusBar(state)

	if !strings.Contains(out, "test@example.com") {
		t.Error("expected email")
	}
	if !strings.Contains(out, "enterprise") {
		t.Error("expected plan")
	}
	if !strings.Contains(out, "broker:ok") {
		t.Error("expected broker:ok")
	}
	if !strings.Contains(out, "daemon:12345") {
		t.Error("expected daemon:12345")
	}
}

func TestStatusBar_ProspectLeads(t *testing.T) {
	state := NewState()
	state.Set(KeyLoggedIn, true)
	state.Set(KeyEmail, "user@test.com")
	state.Set(KeyLeadCount, 42)

	out := renderStatusBar(state)

	if !strings.Contains(out, "leads:42") {
		t.Errorf("expected 'leads:42' in status bar, got:\n%s", out)
	}
}

func TestStatusBar_NoLeadsWhenZero(t *testing.T) {
	state := NewState()
	state.Set(KeyLoggedIn, true)
	state.Set(KeyEmail, "user@test.com")
	state.Set(KeyLeadCount, 0)

	out := renderStatusBar(state)

	if strings.Contains(out, "leads:") {
		t.Errorf("should not show leads when count is 0, got:\n%s", out)
	}
}

func TestStatusBar_FreePlanColor(t *testing.T) {
	state := NewState()
	state.Set(KeyLoggedIn, true)
	state.Set(KeyEmail, "free@test.com")
	state.Set(KeyPlan, "free")

	out := renderStatusBar(state)

	// free plan should appear (we can't easily test ANSI color, but verify text)
	if !strings.Contains(out, "free") {
		t.Error("expected 'free' plan in status bar")
	}
}

func TestStatusBar_UserFallback(t *testing.T) {
	state := NewState()
	state.Set(KeyLoggedIn, true)
	state.Set(KeyUser, "github-user")
	// No email set

	out := renderStatusBar(state)

	if !strings.Contains(out, "github-user") {
		t.Errorf("expected user fallback, got:\n%s", out)
	}
}
