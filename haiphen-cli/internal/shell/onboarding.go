package shell

import (
	"context"
	"fmt"
	"io"

	"github.com/haiphen/haiphen-cli/internal/acl"
	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/tui"
)

// NewOnboardingWorkflow creates the 5-step onboarding workflow.
func NewOnboardingWorkflow(cfg *config.Config, st store.Store, aclClient *acl.Client) *Workflow {
	return &Workflow{
		ID:          "onboarding",
		Label:       "Onboarding",
		Description: "Get started with Haiphen",
		Steps: []Step{
			stepOnboardingWelcome(),
			stepOnboardingAuth(cfg, st, aclClient),
			stepOnboardingStatus(),
			stepOnboardingServices(cfg),
			stepOnboardingNext(),
		},
	}
}

// Step 0: Welcome / Orientation
func stepOnboardingWelcome() Step {
	return NewStep(
		"onboarding.welcome", "Welcome",
		nil, // never skip
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			fmt.Fprintf(w, "  %s is a Semantic Edge Protocol Intelligence Platform.\n", tui.C(tui.Bold, "Haiphen"))
			fmt.Fprintf(w, "  It provides security scanning, network analysis, risk modeling,\n")
			fmt.Fprintf(w, "  causal inference, and supply-chain intelligence for financial\n")
			fmt.Fprintf(w, "  infrastructure — all from the command line.\n\n")

			fmt.Fprintf(w, "  %s\n\n", tui.C(tui.Bold, "Tier Comparison:"))
			fmt.Fprintf(w, "  %-10s  %s\n", tui.C(tui.Gray, "TIER"), tui.C(tui.Gray, "CAPABILITIES"))
			fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "──────────────────────────────────────────────────"))
			fmt.Fprintf(w, "  %-10s  %s\n", tui.C(tui.Green, "Free"), "Browse leads, view metrics, platform health")
			fmt.Fprintf(w, "  %-10s  %s\n", tui.C(tui.Cyan, "Pro"), "Broker + signals, investigations, reports")
			fmt.Fprintf(w, "  %-10s  %s\n", tui.C(tui.Yellow, "Admin"), "Crawl, outreach, pipeline, credential vault")
			fmt.Fprintln(w)
			fmt.Fprintf(w, "  %s %s\n", tui.C(tui.Gray, "Docs:"), "https://haiphen.io")
			fmt.Fprintf(w, "  %s %s\n", tui.C(tui.Gray, "Upgrade:"), "https://haiphen.io/#pricing")

			return StepResult{}
		},
	)
}

// Step 1: Authentication
func stepOnboardingAuth(cfg *config.Config, st store.Store, aclClient *acl.Client) Step {
	return NewStep(
		"onboarding.auth", "Authentication",
		func(state *State) bool { return state.GetBool(KeyLoggedIn) },
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			spin := tui.NewSpinner("Opening browser for login...")

			err := RunLogin(ctx, cfg, st, aclClient, state)
			if err != nil {
				spin.Fail("Login failed")
				return StepResult{Error: err}
			}

			spin.Success(fmt.Sprintf("Logged in as %s", state.GetString(KeyEmail)))
			return StepResult{}
		},
	)
}

// Step 2: Account Status
func stepOnboardingStatus() Step {
	return NewStep(
		"onboarding.status", "Account Status",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			tui.TableRow(w, "User", state.GetString(KeyUser))
			tui.TableRow(w, "Email", state.GetString(KeyEmail))
			tui.TableRow(w, "Plan", state.GetString(KeyPlan))
			tui.TableRow(w, "Role", state.GetString(KeyRole))

			entitled := state.GetBool(KeyEntitled)
			if entitled {
				tui.TableRow(w, "Entitled", tui.C(tui.Green, "yes"))
			} else {
				tui.TableRow(w, "Entitled", tui.C(tui.Red, "no"))
			}

			return StepResult{}
		},
	)
}

// Step 3: Platform Health
func stepOnboardingServices(cfg *config.Config) Step {
	return NewStep(
		"onboarding.services", "Platform Health",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			spin := tui.NewSpinner("Checking services...")
			results, err := CheckServices(ctx, cfg)
			if err != nil {
				spin.Fail("Health check failed")
				return StepResult{Error: err}
			}
			spin.Stop()

			fmt.Fprintf(w, "  %-10s  %-6s  %s\n",
				tui.C(tui.Gray, "SERVICE"),
				tui.C(tui.Gray, "STATUS"),
				tui.C(tui.Gray, "LATENCY"))
			fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "──────────────────────────────"))

			for _, r := range results {
				status := tui.C(tui.Green, "OK")
				if !r.OK {
					status = tui.C(tui.Red, "FAIL")
				}
				fmt.Fprintf(w, "  %-10s  %-6s  %4dms\n", r.Name, status, r.Ms)
			}

			return StepResult{}
		},
	)
}

// Step 5: What's Next
func stepOnboardingNext() Step {
	return NewStep(
		"onboarding.next", "What's Next",
		nil,
		func(ctx context.Context, w io.Writer, state *State) StepResult {
			plan := state.GetString(KeyPlan)
			entitled := state.GetBool(KeyEntitled)

			if (plan == "pro" || plan == "enterprise") && entitled {
				fmt.Fprintf(w, "  You're all set! Your %s plan is active.\n\n", tui.C(tui.Green, plan))

				idx, err := tui.Select("  What next?", []string{
					"Start Trading",
					"Explore Prospects",
					"Back to menu",
				})
				if err != nil {
					return StepResult{BackToMenu: true}
				}

				switch idx {
				case 0:
					return StepResult{Done: true, NextWorkflow: "trading"}
				case 1:
					return StepResult{Done: true, NextWorkflow: "prospect"}
				default:
					return StepResult{BackToMenu: true}
				}
			}

			fmt.Fprintf(w, "  Your current plan: %s\n", tui.C(tui.Yellow, plan))
			if !entitled {
				fmt.Fprintf(w, "  %s\n", tui.C(tui.Gray, "Upgrade at https://haiphen.io/#pricing for full access."))
			}
			fmt.Fprintln(w)

			idx, err := tui.Select("  What next?", []string{
				"Explore Prospects (free tier)",
				"Back to menu",
			})
			if err != nil {
				return StepResult{BackToMenu: true}
			}

			if idx == 0 {
				return StepResult{Done: true, NextWorkflow: "prospect"}
			}
			return StepResult{BackToMenu: true}
		},
	)
}
