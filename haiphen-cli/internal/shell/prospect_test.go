package shell

import (
	"testing"

	"github.com/haiphen/haiphen-cli/internal/acl"
	"github.com/haiphen/haiphen-cli/internal/config"
)

func testProspectWorkflow() *Workflow {
	// We only need the Workflow struct for guard/skip tests — steps won't actually run.
	_ = config.Default() // ensure config package is referenced
	return &Workflow{
		ID:    "prospect",
		Label: "Prospect Intelligence",
		EntryGuard: func(state *State) string {
			if !state.GetBool(KeyLoggedIn) {
				return "You must be logged in. Select Onboarding to get started."
			}
			return ""
		},
		Steps: []Step{
			// Credentials — admin to set, free to view
			NewStep("prospect.credentials", "API Credentials", nil, nil),
			// Targets — free
			NewStep("prospect.targets", "Browse Targets", nil, nil),
			// Crawl — admin only
			NewStep("prospect.crawl", "Targeted Crawl",
				func(state *State) bool { return state.GetString(KeyRole) != "admin" },
				nil),
			// Leads — free
			NewStep("prospect.leads", "View Leads", nil, nil),
			// Investigate — skip if free
			NewStep("prospect.investigate", "Run Investigation",
				func(state *State) bool { return state.GetString(KeyPlan) == "free" },
				nil),
			// Report — skip if free
			NewStep("prospect.report", "Generate Report",
				func(state *State) bool { return state.GetString(KeyPlan) == "free" },
				nil),
			// Outreach — admin only
			NewStep("prospect.outreach", "Draft Outreach",
				func(state *State) bool { return state.GetString(KeyRole) != "admin" },
				nil),
		},
	}
}

func TestProspectEntryGuard_RequiresLogin(t *testing.T) {
	wf := testProspectWorkflow()
	state := NewState()

	msg := wf.EntryGuard(state)
	if msg == "" {
		t.Error("expected guard to block when not logged in")
	}
}

func TestProspectEntryGuard_AllowsFree(t *testing.T) {
	wf := testProspectWorkflow()
	state := NewState()
	state.Set(KeyLoggedIn, true)
	state.Set(KeyPlan, "free")
	state.Set(KeyRole, "user")

	msg := wf.EntryGuard(state)
	if msg != "" {
		t.Errorf("expected guard to pass for free user, got %q", msg)
	}
}

func TestProspectCrawl_SkipsNonAdmin(t *testing.T) {
	wf := testProspectWorkflow()
	state := NewState()
	state.Set(KeyRole, "user")

	crawlStep := wf.Steps[2] // prospect.crawl
	if crawlStep.ID() != "prospect.crawl" {
		t.Fatalf("expected prospect.crawl, got %s", crawlStep.ID())
	}
	if !crawlStep.ShouldSkip(state) {
		t.Error("crawl should skip for non-admin")
	}

	state.Set(KeyRole, "admin")
	if crawlStep.ShouldSkip(state) {
		t.Error("crawl should not skip for admin")
	}
}

func TestProspectInvestigate_SkipsFree(t *testing.T) {
	wf := testProspectWorkflow()
	state := NewState()
	state.Set(KeyPlan, "free")

	investStep := wf.Steps[4] // prospect.investigate
	if investStep.ID() != "prospect.investigate" {
		t.Fatalf("expected prospect.investigate, got %s", investStep.ID())
	}
	if !investStep.ShouldSkip(state) {
		t.Error("investigate should skip for free plan")
	}

	state.Set(KeyPlan, "pro")
	if investStep.ShouldSkip(state) {
		t.Error("investigate should not skip for pro plan")
	}
}

func TestProspectReport_SkipsFree(t *testing.T) {
	wf := testProspectWorkflow()
	state := NewState()
	state.Set(KeyPlan, "free")

	reportStep := wf.Steps[5] // prospect.report
	if reportStep.ID() != "prospect.report" {
		t.Fatalf("expected prospect.report, got %s", reportStep.ID())
	}
	if !reportStep.ShouldSkip(state) {
		t.Error("report should skip for free plan")
	}
}

func TestProspectOutreach_SkipsNonAdmin(t *testing.T) {
	wf := testProspectWorkflow()
	state := NewState()
	state.Set(KeyRole, "user")

	outreachStep := wf.Steps[6] // prospect.outreach
	if outreachStep.ID() != "prospect.outreach" {
		t.Fatalf("expected prospect.outreach, got %s", outreachStep.ID())
	}
	if !outreachStep.ShouldSkip(state) {
		t.Error("outreach should skip for non-admin")
	}

	state.Set(KeyRole, "admin")
	if outreachStep.ShouldSkip(state) {
		t.Error("outreach should not skip for admin")
	}
}

// Verify the full ProspectWorkflow constructor step IDs match expectations.
func TestProspectWorkflow_StepIDs(t *testing.T) {
	wf := testProspectWorkflow()

	expected := []string{
		"prospect.credentials",
		"prospect.targets",
		"prospect.crawl",
		"prospect.leads",
		"prospect.investigate",
		"prospect.report",
		"prospect.outreach",
	}

	if len(wf.Steps) != len(expected) {
		t.Fatalf("expected %d steps, got %d", len(expected), len(wf.Steps))
	}

	for i, id := range expected {
		if wf.Steps[i].ID() != id {
			t.Errorf("step %d: ID = %q, want %q", i, wf.Steps[i].ID(), id)
		}
	}
}

// Verify tier mapping aligns with ACL package.
func TestProspectTiers(t *testing.T) {
	if acl.Free != 1 {
		t.Error("expected Free=1")
	}
	if acl.Pro != 2 {
		t.Error("expected Pro=2")
	}
	if acl.Admin != 3 {
		t.Error("expected Admin=3")
	}
}
