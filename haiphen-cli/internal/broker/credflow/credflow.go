package credflow

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/haiphen/haiphen-cli/internal/util"
)

// CollectResult holds the credentials collected from the browser form.
type CollectResult struct {
	APIKey    string
	APISecret string
}

// Collect opens a browser to an ephemeral localhost server that presents a
// secure credential form. The user enters their API key and secret in the
// browser, which POSTs them back to the CLI. This avoids exposing credentials
// in shell history or terminal scrollback.
func Collect(ctx context.Context, brokerName, displayName string) (*CollectResult, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen ephemeral: %w", err)
	}
	defer func() { _ = ln.Close() }()

	addr := ln.Addr().(*net.TCPAddr)
	localURL := fmt.Sprintf("http://127.0.0.1:%d/credentials", addr.Port)

	mux := http.NewServeMux()
	got := make(chan CollectResult, 1)

	formHTML := credentialFormHTML(displayName, addr.Port)

	mux.HandleFunc("/credentials", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(formHTML))
		case "POST":
			var body struct {
				APIKey    string `json:"api_key"`
				APISecret string `json:"api_secret"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.APIKey == "" || body.APISecret == "" {
				http.Error(w, `{"error":"missing credentials"}`, http.StatusBadRequest)
				return
			}
			select {
			case got <- CollectResult{APIKey: body.APIKey, APISecret: body.APISecret}:
			default:
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[credflow] server error: %v", err)
		}
	}()

	if err := util.OpenBrowser(localURL); err != nil {
		_ = srv.Shutdown(context.Background())
		return nil, fmt.Errorf("open browser: %w (try --terminal for headless environments)", err)
	}

	var result CollectResult
	select {
	case result = <-got:
	case <-ctx.Done():
		_ = srv.Shutdown(context.Background())
		return nil, ctx.Err()
	case <-time.After(3 * time.Minute):
		_ = srv.Shutdown(context.Background())
		return nil, errors.New("credential entry timed out after 3 minutes")
	}

	shCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = srv.Shutdown(shCtx)

	return &result, nil
}

func credentialFormHTML(displayName string, port int) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Haiphen — %s Credentials</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b1220;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#1a2332;border:1px solid #2d3748;border-radius:12px;padding:40px;max-width:440px;width:100%%;box-shadow:0 8px 32px rgba(0,0,0,.4)}
h1{font-size:20px;margin-bottom:4px;color:#fff}
.subtitle{color:#8892a4;font-size:14px;margin-bottom:28px}
label{display:block;font-size:13px;color:#a0aec0;margin-bottom:6px;font-weight:500}
input{width:100%%;padding:10px 14px;background:#0b1220;border:1px solid #2d3748;border-radius:8px;color:#e2e8f0;font-size:15px;margin-bottom:18px;outline:none;font-family:monospace}
input:focus{border-color:#5A9BD4;box-shadow:0 0 0 2px rgba(90,155,212,.25)}
button{width:100%%;padding:12px;background:#5A9BD4;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s}
button:hover{background:#4a8bc4}
button:disabled{opacity:.6;cursor:not-allowed}
.security{margin-top:20px;padding:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:8px;font-size:12px;color:#10B981;text-align:center}
.success{text-align:center;padding:40px 0}
.success h2{color:#10B981;margin-bottom:8px}
.success p{color:#8892a4;font-size:14px}
.logo{text-align:center;margin-bottom:24px;font-size:28px;letter-spacing:2px;color:#5A9BD4;font-weight:700}
</style>
</head>
<body>
<div class="card" id="form-card">
  <div class="logo">HAIPHEN</div>
  <h1>Connect %s</h1>
  <p class="subtitle">Enter your API credentials below</p>
  <form id="cred-form" autocomplete="off">
    <label for="api_key">API Key ID</label>
    <input type="password" id="api_key" name="api_key" placeholder="PK..." required autofocus>
    <label for="api_secret">Secret Key</label>
    <input type="password" id="api_secret" name="api_secret" placeholder="Your secret key" required>
    <button type="submit" id="submit-btn">Connect</button>
  </form>
  <div class="security">Keys are sent only to your local CLI on 127.0.0.1:%d</div>
</div>
<div class="card success" id="success-card" style="display:none">
  <div class="logo">HAIPHEN</div>
  <h2>Credentials received</h2>
  <p>You can close this tab and return to your terminal.</p>
</div>
<script>
document.getElementById("cred-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  btn.textContent = "Connecting...";
  try {
    const res = await fetch("/credentials", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        api_key: document.getElementById("api_key").value,
        api_secret: document.getElementById("api_secret").value
      })
    });
    if (res.ok) {
      document.getElementById("form-card").style.display = "none";
      document.getElementById("success-card").style.display = "block";
    } else {
      btn.disabled = false;
      btn.textContent = "Connect";
      alert("Failed to send credentials. Please try again.");
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Connect";
    alert("Connection error: " + err.message);
  }
});
</script>
</body>
</html>`, displayName, displayName, port)
}
