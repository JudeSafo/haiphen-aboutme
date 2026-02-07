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
			Handler:           nil,
			ReadHeaderTimeout: 5 * time.Second,
		},
	}

	// Public endpoints
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/status", s.handleStatus)

	// Native auth callback (serve-mode login capture)
	mux.HandleFunc("/auth/callback", s.handleAuthCallback)
	mux.HandleFunc("/auth/logout", s.handleLogout)

	// Remote API proxy (protected)
	proxy, err := newAPIProxy(cfg.APIOrigin, st)
	if err != nil {
		return nil, err
	}
	protected := s.withGates(proxy)
	mux.Handle("/v1/", protected)

	// Service proxies (protected, strip prefix to forward as /v1/...)
	serviceRoutes := []struct {
		prefix string
		origin string
	}{
		{"/secure/", cfg.SecureOrigin},
		{"/network/", cfg.NetworkOrigin},
		{"/graph/", cfg.GraphOrigin},
		{"/risk/", cfg.RiskOrigin},
		{"/causal/", cfg.CausalOrigin},
		{"/supply/", cfg.SupplyOrigin},
	}
	for _, sr := range serviceRoutes {
		svcProxy, err := newAPIProxy(sr.origin, st)
		if err != nil {
			return nil, err
		}
		mux.Handle(sr.prefix, s.withGates(http.StripPrefix(strings.TrimSuffix(sr.prefix, "/"), svcProxy)))
	}

	// Aggregate health handler (public)
	mux.HandleFunc("/services", s.handleServicesHealth)

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
		"logged_in":              st.LoggedIn,
		"user":                   st.User,
		"entitled":               st.Entitled,
		"monitor_entitled":       ent,
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

func (s *Server) handleServicesHealth(w http.ResponseWriter, r *http.Request) {
	type svcResult struct {
		Name   string `json:"name"`
		Origin string `json:"origin"`
		OK     bool   `json:"ok"`
	}

	services := []struct {
		name   string
		origin string
	}{
		{"api", s.cfg.APIOrigin},
		{"secure", s.cfg.SecureOrigin},
		{"network", s.cfg.NetworkOrigin},
		{"graph", s.cfg.GraphOrigin},
		{"risk", s.cfg.RiskOrigin},
		{"causal", s.cfg.CausalOrigin},
		{"supply", s.cfg.SupplyOrigin},
	}

	results := make([]svcResult, len(services))
	for i, svc := range services {
		_, err := util.ServiceGet(r.Context(), svc.origin, "/v1/health", "")
		results[i] = svcResult{Name: svc.name, Origin: svc.origin, OK: err == nil}
	}

	writeJSON(w, results, http.StatusOK)
}

// serve-mode native callback endpoint.
// GET: renders JS to post token from fragment.
// POST: saves token to store and redirects user to /status (nice UX).
func (s *Server) handleAuthCallback(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!doctype html>
<html>
  <body style="font-family:sans-serif">
    <h2>Completing Haiphen login…</h2>
    <script>
    (async () => {
      // Prefer fragment (#token=...) but also support query (?token=...) for robustness.
      const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      let token = hash.get('token');

      if (!token) {
        const qs = new URLSearchParams(location.search || '');
        token = qs.get('token');
        // If token came in via query, scrub it from the URL immediately.
        if (token) {
          try {
            const clean = new URL(location.href);
            clean.searchParams.delete('token');
            clean.hash = 'token=' + encodeURIComponent(token);
            history.replaceState(null, '', clean.toString());
          } catch (_) {}
        }
      }
      if (!token) {
        document.body.innerHTML = "<h2>Missing token</h2><p>No token found in URL fragment.</p>";
        return;
      }

      const res = await fetch(location.pathname, {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        // move user to a helpful status page in the gateway
        location.replace("/status");
        return;
      }

      document.body.innerHTML = "<h2>Login failed.</h2>";
    })();
    </script>
  </body>
</html>`))
		return

	case "POST":
		var body struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Token) == "" {
			http.Error(w, "missing token", http.StatusBadRequest)
			return
		}

		tok := &store.Token{
			AccessToken: body.Token,
			Expiry:      time.Time{},
		}
		if exp, err := util.JWTExpiry(body.Token); err == nil {
			tok.Expiry = exp
		} else {
			tok.Expiry = time.Now().Add(6 * time.Hour)
		}

		if err := s.st.SaveToken(tok); err != nil {
			http.Error(w, "failed to save session", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
		return

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

// ---- Gating middleware ----

func (s *Server) withGates(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := "local"
		if !s.rl.Allow(key) {
			writeErr(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}

		tok, err := s.st.LoadToken()
		if err != nil {
			log.Printf("[gate] load token error: %v", err)
			writeErr(w, http.StatusInternalServerError, "session store error")
			return
		}
		if tok == nil || strings.TrimSpace(tok.AccessToken) == "" {
			s.openLogin()
			writeErr(w, http.StatusUnauthorized, "not logged in")
			return
		}

		if !tok.Expiry.IsZero() && time.Now().After(tok.Expiry) {
			_ = s.st.ClearToken()
			s.openLogin()
			writeErr(w, http.StatusUnauthorized, "session expired")
			return
		}

		entitled, lastCheck := s.mon.Entitled()
		if !entitled {
			// If monitor hasn't run recently, do a synchronous check (avoid false lockouts).
			if time.Since(lastCheck) > 2*time.Minute {
				st, err := s.auth.Status(r.Context())
				if err != nil {
					log.Printf("[gate] entitlement status error: %v", err)
					s.openCheckout()
					writeErr(w, http.StatusPaymentRequired, "entitlement check failed")
					return
				}
				if !st.LoggedIn {
					_ = s.st.ClearToken()
					s.openLogin()
					writeErr(w, http.StatusUnauthorized, "not logged in")
					return
				}
				if !st.Entitled {
					_ = s.st.ClearToken()
					s.openCheckout()
					writeErr(w, http.StatusPaymentRequired, "not entitled")
					return
				}
			} else {
				_ = s.st.ClearToken()
				s.openCheckout()
				writeErr(w, http.StatusPaymentRequired, "not entitled")
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// ---- Native UX helpers (open browser) ----

func (s *Server) openLogin() {
	// IMPORTANT: return to /auth/callback so the gateway can capture the token fragment.
	to := fmt.Sprintf("http://127.0.0.1:%d/auth/callback", s.cfg.Port)

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