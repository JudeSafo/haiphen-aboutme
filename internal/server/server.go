package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/haiphen/haiphen-cli/internal/auth"
	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/entitlement"
	"github.com/haiphen/haiphen-cli/internal/ratelimit"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/util"
)

type Server struct {
	cfg *config.Config
	st  store.Store

	httpSrv *http.Server
	auth    *auth.Client
	mon     *entitlement.Monitor
	rl      *ratelimit.Limiter
}

func New(cfg *config.Config, st store.Store) (*Server, error) {
	a := auth.New(cfg, st)
	mon := entitlement.New(cfg, st, a)
	rl := ratelimit.New(cfg.RateLimitPerMin, cfg.Burst)

	mux := http.NewServeMux()

	s := &Server{
		cfg:  cfg,
		st:   st,
		auth: a,
		mon:  mon,
		rl:   rl,
		httpSrv: &http.Server{
			Addr:              fmt.Sprintf("127.0.0.1:%d", cfg.Port),
			Handler:           nil, // set below
			ReadHeaderTimeout: 5 * time.Second,
		},
	}

	// Public endpoints
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/status", s.handleStatus)

	// Auth endpoints (local)
	mux.HandleFunc("/auth/callback", func(w http.ResponseWriter, r *http.Request) {
		// handled by `haiphen login` flow server, but keep for completeness
		writeErr(w, http.StatusBadRequest, "use `haiphen login` to authenticate")
	})
	mux.HandleFunc("/auth/logout", s.handleLogout)

	// Protected API surface
	protected := s.withGates(http.HandlerFunc(s.handleV1))
	mux.Handle("/v1/", protected)

	s.httpSrv.Handler = mux
	return s, nil
}

func (s *Server) Start() error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go s.mon.Start(ctx)

	log.Printf("[server] listening on %s", s.httpSrv.Addr)
	err := s.httpSrv.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (s *Server) Shutdown(ctx context.Context) error {
	log.Printf("[server] shutting down")
	return s.httpSrv.Shutdown(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	st, err := s.auth.Status(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	ent, last := s.mon.Entitled()
	out := map[string]any{
		"logged_in":             st.LoggedIn,
		"user":                  st.User,
		"entitled":              st.Entitled,
		"monitor_entitled":      ent,
		"last_entitlement_check": last.Format(time.RFC3339),
	}
	writeJSON(w, out, http.StatusOK)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeErr(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	_ = s.st.ClearToken()
	writeJSON(w, map[string]any{"ok": true}, http.StatusOK)
}

func (s *Server) handleV1(w http.ResponseWriter, r *http.Request) {
	// This is your “local haiphen-api” surface.
	// In the next step, you can either:
	//  1) implement local compute, or
	//  2) proxy to remote API with Authorization: Bearer <token>
	//
	// For now, return a structured placeholder.
	writeJSON(w, map[string]any{
		"ok":      true,
		"path":    r.URL.Path,
		"message": "haiphen local gateway (placeholder).",
	}, http.StatusOK)
}

// ---- Gating middleware ----

func (s *Server) withGates(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Local rate limit (UX + basic abuse prevention)
		// Later you can key this by user sub if you want:
		// e.g. key := "user:" + sub
		key := "local"
		if !s.rl.Allow(key) {
			writeErr(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}

		// Must be logged in (token exists)
		tok, err := s.st.LoadToken()
		if err != nil {
			log.Printf("[gate] load token error: %v", err)
			writeErr(w, http.StatusInternalServerError, "session store error")
			return
		}
		if tok == nil || strings.TrimSpace(tok.AccessToken) == "" {
			s.openLogin(r)
			writeErr(w, http.StatusUnauthorized, "not logged in")
			return
		}

		// Optional: if token is known-expired, treat as logged out (fail closed).
		if !tok.Expiry.IsZero() && time.Now().After(tok.Expiry) {
			_ = s.st.ClearToken()
			s.openLogin(r)
			writeErr(w, http.StatusUnauthorized, "session expired")
			return
		}

		// Entitlement enforcement: prefer monitor state (fast) but fail closed if not entitled.
		entitled, lastCheck := s.mon.Entitled()
		if !entitled {
			// If monitor hasn't run yet (startup), do a synchronous check to avoid false lockouts.
			// Note: auth.Status() already checks entitlement via /entitlement (as designed).
			if time.Since(lastCheck) > 2*time.Minute {
				st, err := s.auth.Status(r.Context())
				if err != nil {
					log.Printf("[gate] entitlement status error: %v", err)
					// strict: fail closed
					s.openCheckout()
					writeErr(w, http.StatusPaymentRequired, "entitlement check failed")
					return
				}
				if !st.LoggedIn {
					_ = s.st.ClearToken()
					s.openLogin(r)
					writeErr(w, http.StatusUnauthorized, "not logged in")
					return
				}
				if !st.Entitled {
					// hard-lock locally too
					_ = s.st.ClearToken()
					s.openCheckout()
					writeErr(w, http.StatusPaymentRequired, "not entitled")
					return
				}
				// if we got here, user is entitled; continue
			} else {
				// recently checked and not entitled
				_ = s.st.ClearToken()
				s.openCheckout()
				writeErr(w, http.StatusPaymentRequired, "not entitled")
				return
			}
		}

		// Passed gates
		next.ServeHTTP(w, r)
	})
}

// ---- Native UX helpers (open browser) ----

func (s *Server) openLogin(r *http.Request) {
	// Send user through hosted login but return to *this local gateway* after login.
	// For "serve" UX, bounce back to /status so they see immediate confirmation.
	to := fmt.Sprintf("http://127.0.0.1:%d/status", s.cfg.Port)

	// If you prefer preserving the attempted endpoint:
	// to = fmt.Sprintf("http://127.0.0.1:%d/status?from=%s", s.cfg.Port, url.QueryEscape(r.URL.Path))

	u, err := url.Parse(s.cfg.AuthOrigin + "/login")
	if err != nil {
		log.Printf("[ux] login url parse error: %v", err)
		return
	}
	q := u.Query()
	q.Set("to", to)
	q.Set("native", "1")
	u.RawQuery = q.Encode()

	if err := util.OpenBrowser(u.String()); err != nil {
		log.Printf("[ux] open browser login failed: %v", err)
	}
}

func (s *Server) openCheckout() {
	// Canonical approach: implement auth worker route /checkout that:
	//  - checks logged-in user
	//  - redirects to Stripe checkout for that user
	//  - on success sets entitlement and redirects somewhere
	//
	// For now, just open a consistent hosted URL. You can change this
	// without touching the CLI once your worker supports it.
	u := s.cfg.AuthOrigin + "/checkout"
	if err := util.OpenBrowser(u); err != nil {
		log.Printf("[ux] open browser checkout failed: %v", err)
	}
}

// ---- JSON helpers ----

func writeJSON(w http.ResponseWriter, v any, status int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, map[string]any{
		"ok":    false,
		"error": msg,
	}, status)
}