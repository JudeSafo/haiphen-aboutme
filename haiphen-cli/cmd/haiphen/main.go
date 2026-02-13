package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/haiphen/haiphen-cli/internal/auth"
	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/server"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/tui"
	"github.com/haiphen/haiphen-cli/internal/util"
)

// Set via ldflags at build time.
var (
	version = "dev"
	commit  = "unknown"
	date    = "unknown"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	cfg := config.Default()

	root := &cobra.Command{
		Use:   "haiphen",
		Short: "Haiphen local gateway + CLI",
	}

	// Print landing page only when user runs plain `haiphen` (no subcommand/flags).
	if len(os.Args) == 1 {
		printLandingPage()
	}

	root.PersistentFlags().StringVar(&cfg.AuthOrigin, "auth-origin", cfg.AuthOrigin, "Auth origin (e.g. https://auth.haiphen.io)")
	root.PersistentFlags().StringVar(&cfg.APIOrigin, "api-origin", cfg.APIOrigin, "API origin (e.g. https://api.haiphen.io)")
	root.PersistentFlags().IntVar(&cfg.Port, "port", cfg.Port, "Local gateway port")
	root.PersistentFlags().StringVar(&cfg.Profile, "profile", cfg.Profile, "Profile name (multi-account)")

	st, err := store.New(store.Options{Profile: cfg.Profile})
	if err != nil {
		log.Fatalf("store init: %v", err)
	}

	root.AddCommand(cmdServe(cfg, st))
	root.AddCommand(cmdLogin(cfg, st))
	root.AddCommand(cmdLogout(cfg, st))
	root.AddCommand(cmdStatus(cfg, st))
	root.AddCommand(cmdOnboarding(cfg, st))
	root.AddCommand(cmdServices(cfg, st))
	root.AddCommand(cmdMetrics(cfg, st))
	root.AddCommand(cmdSecure(cfg, st))
	root.AddCommand(cmdNetwork(cfg, st))
	root.AddCommand(cmdGraph(cfg, st))
	root.AddCommand(cmdRisk(cfg, st))
	root.AddCommand(cmdCausal(cfg, st))
	root.AddCommand(cmdSupply(cfg, st))
	root.AddCommand(cmdProspect(cfg, st))
	root.AddCommand(cmdBroker(cfg, st))
	root.AddCommand(cmdSignal(cfg, st))
	root.AddCommand(cmdVersion())

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func printLandingPage() {
	util.PrintBanner(os.Stdout, util.BannerSizeRobot)
	fmt.Println()

	commitShort := commit
	if len(commitShort) > 7 {
		commitShort = commitShort[:7]
	}
	fmt.Printf("  %s v%s (%s)\n", tui.C(tui.Bold, "Haiphen CLI"), version, commitShort)
	fmt.Printf("  %s\n", tui.C(tui.Gray, "Semantic Edge Protocol Intelligence Platform"))
	fmt.Println()
	fmt.Printf("  %s\n", tui.C(tui.Bold, "Quick Start:"))
	fmt.Printf("    %s          %s\n", tui.C(tui.Cyan, "haiphen login"), tui.C(tui.Gray, "Log in via browser"))
	fmt.Printf("    %s    %s\n", tui.C(tui.Cyan, "haiphen broker init"), tui.C(tui.Gray, "Connect a paper brokerage"))
	fmt.Printf("    %s  %s\n", tui.C(tui.Cyan, "haiphen signal daemon"), tui.C(tui.Gray, "Start signal arbitrage engine"))
	fmt.Printf("    %s         %s\n", tui.C(tui.Cyan, "haiphen status"), tui.C(tui.Gray, "Auth + entitlement status"))
	fmt.Printf("    %s       %s\n", tui.C(tui.Cyan, "haiphen services"), tui.C(tui.Gray, "Platform health dashboard"))
	fmt.Printf("    %s         %s\n", tui.C(tui.Cyan, "haiphen --help"), tui.C(tui.Gray, "Full command reference"))
	fmt.Println()
}

func cmdVersion() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print CLI version, commit, and build date",
		Run: func(cmd *cobra.Command, args []string) {
			commitShort := commit
			if len(commitShort) > 7 {
				commitShort = commitShort[:7]
			}
			fmt.Printf("haiphen %s (commit %s, built %s)\n", version, commitShort, date)
		},
	}
}

type onboardingResources struct {
	OK           bool   `json:"ok"`
	UserLogin    string `json:"user_login"`
	Plan         string `json:"plan"`
	Entitlements struct {
		Active   bool            `json:"active"`
		Plan     string          `json:"plan"`
		Features map[string]bool `json:"features"`
	} `json:"entitlements"`
	Links map[string]string `json:"links"`
}

func cmdOnboarding(cfg *config.Config, st store.Store) *cobra.Command {
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "onboarding",
		Short: "Show onboarding links and activation resources",
		RunE: func(cmd *cobra.Command, args []string) error {
			tok, err := st.LoadToken()
			if err != nil {
				return err
			}
			if tok == nil || strings.TrimSpace(tok.AccessToken) == "" {
				return fmt.Errorf("not logged in; run `haiphen login`")
			}

			endpoint := strings.TrimRight(cfg.APIOrigin, "/") + "/v1/onboarding/resources"
			req, err := http.NewRequestWithContext(cmd.Context(), http.MethodGet, endpoint, nil)
			if err != nil {
				return err
			}
			req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
			req.Header.Set("Accept", "application/json")
			req.Header.Set("Cache-Control", "no-store")

			hc := &http.Client{Timeout: 12 * time.Second}
			resp, err := hc.Do(req)
			if err != nil {
				return err
			}
			defer resp.Body.Close()

			body, err := io.ReadAll(resp.Body)
			if err != nil {
				return err
			}

			if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
				return fmt.Errorf("session unauthorized; run `haiphen login --force`")
			}
			if resp.StatusCode != http.StatusOK {
				return fmt.Errorf("api error (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
			}

			if asJSON {
				var outBuf strings.Builder
				var pretty any
				if err := json.Unmarshal(body, &pretty); err != nil {
					return fmt.Errorf("decode onboarding json: %w", err)
				}
				enc := json.NewEncoder(&outBuf)
				enc.SetIndent("", "  ")
				if err := enc.Encode(pretty); err != nil {
					return err
				}
				fmt.Print(outBuf.String())
				return nil
			}

			var out onboardingResources
			if err := json.Unmarshal(body, &out); err != nil {
				return fmt.Errorf("decode onboarding response: %w", err)
			}

			fmt.Printf("User: %s\n", out.UserLogin)
			fmt.Printf("Plan: %s\n", out.Plan)
			fmt.Printf("Entitled: %v\n", out.Entitlements.Active)
			fmt.Println()
			fmt.Println("Resources:")

			keys := make([]string, 0, len(out.Links))
			for k, v := range out.Links {
				if strings.TrimSpace(v) == "" {
					continue
				}
				keys = append(keys, k)
			}
			sort.Strings(keys)

			for _, k := range keys {
				fmt.Printf("- %s: %s\n", prettyLinkKey(k), strings.TrimSpace(out.Links[k]))
			}

			return nil
		},
	}

	cmd.Flags().BoolVar(&asJSON, "json", false, "Print raw onboarding payload as JSON")
	return cmd
}

func prettyLinkKey(k string) string {
	s := strings.ReplaceAll(strings.TrimSpace(k), "_", " ")
	parts := strings.Fields(s)
	for i, p := range parts {
		lp := strings.ToLower(p)
		switch lp {
		case "api":
			parts[i] = "API"
		case "cli":
			parts[i] = "CLI"
		case "url":
			parts[i] = "URL"
		default:
			if len(p) > 1 {
				parts[i] = strings.ToUpper(p[:1]) + strings.ToLower(p[1:])
			} else {
				parts[i] = strings.ToUpper(p)
			}
		}
	}
	return strings.Join(parts, " ")
}

func cmdServe(cfg *config.Config, st store.Store) *cobra.Command {
	return &cobra.Command{
		Use:   "serve",
		Short: "Run the local Haiphen gateway",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			srv, err := server.New(cfg, st)
			if err != nil {
				return err
			}

			go func() {
				if err := srv.Start(); err != nil {
					log.Printf("server stopped: %v", err)
					cancel()
				}
			}()

			ch := make(chan os.Signal, 2)
			signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
			select {
			case <-ch:
				log.Printf("shutdown requested")
			case <-ctx.Done():
				log.Printf("context done")
			}

			shCtx, shCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer shCancel()
			return srv.Shutdown(shCtx)
		},
	}
}

func cmdLogin(cfg *config.Config, st store.Store) *cobra.Command {
	var force bool

	cmd := &cobra.Command{
		Use:   "login",
		Short: "Login via browser and store session locally",
		RunE: func(cmd *cobra.Command, args []string) error {
			a := auth.New(cfg, st)
			token, err := a.Login(cmd.Context(), auth.LoginOptions{Force: force})
			if err != nil {
				return err
			}
			fmt.Printf("✅ Logged in. Token expires at: %s\n", token.Expiry.Format(time.RFC3339))
			return nil
		},
	}

	cmd.Flags().BoolVar(&force, "force", false, "Force GitHub OAuth flow (account switching)")
	return cmd
}

func cmdLogout(cfg *config.Config, st store.Store) *cobra.Command {
	return &cobra.Command{
		Use:   "logout",
		Short: "Clear local session and (optionally) revoke remotely",
		RunE: func(cmd *cobra.Command, args []string) error {
			a := auth.New(cfg, st)
			if err := a.Logout(cmd.Context()); err != nil {
				return err
			}
			fmt.Println("✅ Logged out.")
			return nil
		},
	}
}

func cmdStatus(cfg *config.Config, st store.Store) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show auth + entitlement status",
		RunE: func(cmd *cobra.Command, args []string) error {
			a := auth.New(cfg, st)
			s, err := a.Status(cmd.Context())
			if err != nil {
				return err
			}

			fmt.Printf("LoggedIn: %v\n", s.LoggedIn)
			if s.User != nil {
				email := ""
				if s.User.Email != nil {
					email = *s.User.Email
				}
				fmt.Printf("User: %s (%s)\n", s.User.Sub, email)
			}
			fmt.Printf("Entitled: %v\n", s.Entitled)
			if s.EntitledUntil != nil {
				fmt.Printf("EntitledUntil: %s\n", s.EntitledUntil.Format(time.RFC3339))
			}
			return nil
		},
	}
}
