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
		hc: &http.Client{Timeout: 12 * time.Second},
	}
}

type User struct {
	Sub   string `json:"sub"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Avatar string `json:"avatar"`
}

type Status struct {
	LoggedIn      bool
	User          *User
	Entitled      bool
	EntitledUntil *time.Time
}

func (c *Client) Login(ctx context.Context) (*store.Token, error) {
	// Start a tiny callback listener on localhost
	cbURL := fmt.Sprintf("http://127.0.0.1:%d/auth/callback", c.cfg.Port)

	mux := http.NewServeMux()
	got := make(chan string, 1)

	mux.HandleFunc("/auth/callback", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		token := q.Get("token")
		if token == "" {
			http.Error(w, "missing token", http.StatusBadRequest)
			return
		}
		select {
		case got <- token:
		default:
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><body><h2>✅ Haiphen login complete.</h2><p>You can close this tab.</p></body></html>`))
	})

	srv := &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%d", c.cfg.Port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ln, err := net.Listen("tcp", srv.Addr)
	if err != nil {
		return nil, fmt.Errorf("listen %s: %w", srv.Addr, err)
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

	_ = srv.Shutdown(context.Background())

	// OPTIONAL: ask server for token metadata; for now store a conservative expiry
	// Better: your auth worker should return exp and entitlement in token or via /me.
	tok := &store.Token{
		AccessToken: raw,
		Expiry:      time.Now().Add(6 * time.Hour),
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

	// Call auth-origin /me but with Bearer token (native mode)
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
		return nil, err
	}

	// Entitlement source of truth (recommended endpoint)
	ent, until, err := c.checkEntitlement(ctx, tok.AccessToken)
	if err != nil {
		// Fail closed for entitlement if you want strict enforcement:
		// return &Status{LoggedIn: true, User: &u, Entitled: false}, nil
		log.Printf("[auth] entitlement check failed: %v", err)
	}

	return &Status{
		LoggedIn:      true,
		User:          &u,
		Entitled:      ent,
		EntitledUntil: until,
	}, nil
}

func (c *Client) checkEntitlement(ctx context.Context, token string) (bool, *time.Time, error) {
	// Recommended: implement on auth worker:
	// GET /entitlement -> { entitled: true, entitled_until: "..." }
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
		Entitled     bool   `json:"entitled"`
		EntitledUntil string `json:"entitled_until"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, nil, err
	}

	var until *time.Time
	if out.EntitledUntil != "" {
		if t, err := time.Parse(time.RFC3339, out.EntitledUntil); err == nil {
			until = &t
		}
	}
	return out.Entitled, until, nil
}