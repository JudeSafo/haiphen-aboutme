package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/util"
)

type Client struct {
	cfg *config.Config
	st  store.Store
	hc  *http.Client
}

func New(cfg *config.Config, st store.Store) *Client {
	return &Client{
		cfg: cfg,
		st:  st,
		hc:  &http.Client{Timeout: 12 * time.Second},
	}
}

type User struct {
	Sub    string  `json:"sub"`
	Name   *string `json:"name"`
	Email  *string `json:"email"`
	Avatar *string `json:"avatar"`
}

type Status struct {
	LoggedIn      bool
	User          *User
	Entitled      bool
	EntitledUntil *time.Time
}

type LoginOptions struct {
	Force bool
}

func (c *Client) Login(ctx context.Context, opts LoginOptions) (*store.Token, error) {
	// IMPORTANT: don't bind to cfg.Port (serve might already be running there).
	// Use an ephemeral localhost port for the login callback.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen ephemeral: %w", err)
	}
	defer func() { _ = ln.Close() }()

	addr := ln.Addr().(*net.TCPAddr)
	cbURL := fmt.Sprintf("http://127.0.0.1:%d/auth/callback", addr.Port)

	mux := http.NewServeMux()
	got := make(chan string, 1)

	mux.HandleFunc("/auth/callback", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			// JS pulls token from URL fragment and posts it back to this endpoint.
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
      document.body.innerHTML = res.ok
        ? "<h2>✅ Haiphen login complete.</h2><p>You can close this tab.</p>"
        : "<h2>Login failed.</h2>";
    })();
    </script>
  </body>
</html>`))
			return

		case "POST":
			var body struct {
				Token string `json:"token"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Token == "" {
				http.Error(w, "missing token", http.StatusBadRequest)
				return
			}
			select {
			case got <- body.Token:
			default:
			}
			w.WriteHeader(http.StatusNoContent)
			return

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
	})

	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[auth] callback server error: %v", err)
		}
	}()

	// Open browser to hosted auth
	u, err := url.Parse(c.cfg.AuthOrigin + "/login")
	if err != nil {
		_ = srv.Shutdown(context.Background())
		return nil, err
	}
	q := u.Query()
	q.Set("to", cbURL)
	q.Set("native", "1")
	if opts.Force {
		q.Set("force", "1")
	}
	u.RawQuery = q.Encode()

	if err := util.OpenBrowser(u.String()); err != nil {
		_ = srv.Shutdown(context.Background())
		return nil, fmt.Errorf("open browser: %w", err)
	}

	// Wait for callback or cancel
	var raw string
	select {
	case raw = <-got:
	case <-ctx.Done():
		_ = srv.Shutdown(context.Background())
		return nil, ctx.Err()
	case <-time.After(2 * time.Minute):
		_ = srv.Shutdown(context.Background())
		return nil, errors.New("login timed out")
	}

	shCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = srv.Shutdown(shCtx)

	tok := &store.Token{
		AccessToken: raw,
		Expiry:      time.Time{},
	}

	if exp, err := util.JWTExpiry(raw); err == nil {
		tok.Expiry = exp
	} else {
		// conservative fallback
		tok.Expiry = time.Now().Add(6 * time.Hour)
	}

	if err := c.st.SaveToken(tok); err != nil {
		return nil, err
	}
	return tok, nil
}

func (c *Client) Logout(ctx context.Context) error {
	_ = ctx // reserved if you later add remote revoke
	return c.st.ClearToken()
}

func (c *Client) Status(ctx context.Context) (*Status, error) {
	tok, err := c.st.LoadToken()
	if err != nil {
		return nil, err
	}
	if tok == nil || tok.AccessToken == "" {
		return &Status{LoggedIn: false}, nil
	}

	req, err := http.NewRequestWithContext(ctx, "GET", c.cfg.AuthOrigin+"/me", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	req.Header.Set("Cache-Control", "no-store")

	resp, err := c.hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return &Status{LoggedIn: false}, nil
	}

	var u User
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		// If /me ever returns something unexpected, treat it as logged out.
		log.Printf("[auth] /me decode error: %v", err)
		return &Status{LoggedIn: false}, nil
	}

	ent, until, err := c.checkEntitlement(ctx, tok.AccessToken)
	if err != nil {
		log.Printf("[auth] entitlement check failed: %v", err)
		// Decide strictness at the caller/gateway layer.
	}

	return &Status{
		LoggedIn:      true,
		User:          &u,
		Entitled:      ent,
		EntitledUntil: until,
	}, nil
}

func (c *Client) checkEntitlement(ctx context.Context, token string) (bool, *time.Time, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.cfg.AuthOrigin+"/entitlement", nil)
	if err != nil {
		return false, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Cache-Control", "no-store")

	resp, err := c.hc.Do(req)
	if err != nil {
		return false, nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return false, nil, nil
	}

	var out struct {
		Entitled      bool    `json:"entitled"`
		EntitledUntil *string `json:"entitled_until"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, nil, err
	}

	var until *time.Time
	if out.EntitledUntil != nil && *out.EntitledUntil != "" {
		if t, err := time.Parse(time.RFC3339, *out.EntitledUntil); err == nil {
			until = &t
		}
	}
	return out.Entitled, until, nil
}