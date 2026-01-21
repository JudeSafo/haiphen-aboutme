package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/haiphen/haiphen-cli/internal/auth"
	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/server"
	"github.com/haiphen/haiphen-cli/internal/store"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	cfg := config.Default()

	root := &cobra.Command{
		Use:   "haiphen",
		Short: "Haiphen local gateway + CLI",
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

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
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