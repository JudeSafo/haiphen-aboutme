package credflow

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCollectFormServed(t *testing.T) {
	// Test that GET /credentials returns an HTML form.
	handler := http.NewServeMux()
	got := make(chan CollectResult, 1)
	handler.HandleFunc("/credentials", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(credentialFormHTML("Alpaca", 0)))
		case "POST":
			var body struct {
				APIKey    string `json:"api_key"`
				APISecret string `json:"api_secret"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.APIKey == "" || body.APISecret == "" {
				http.Error(w, "bad", http.StatusBadRequest)
				return
			}
			select {
			case got <- CollectResult{APIKey: body.APIKey, APISecret: body.APISecret}:
			default:
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
		}
	})

	srv := httptest.NewServer(handler)
	defer srv.Close()

	// Test GET
	resp, err := http.Get(srv.URL + "/credentials")
	if err != nil {
		t.Fatalf("GET error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("GET status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "text/html; charset=utf-8" {
		t.Errorf("Content-Type = %q, want text/html", ct)
	}

	// Test POST round-trip
	payload := map[string]string{
		"api_key":    "PK_TEST_KEY",
		"api_secret": "SK_TEST_SECRET",
	}
	body, _ := json.Marshal(payload)
	postResp, err := http.Post(srv.URL+"/credentials", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST error: %v", err)
	}
	defer postResp.Body.Close()
	if postResp.StatusCode != 200 {
		t.Fatalf("POST status = %d, want 200", postResp.StatusCode)
	}

	select {
	case result := <-got:
		if result.APIKey != "PK_TEST_KEY" {
			t.Errorf("APIKey = %q, want PK_TEST_KEY", result.APIKey)
		}
		if result.APISecret != "SK_TEST_SECRET" {
			t.Errorf("APISecret = %q, want SK_TEST_SECRET", result.APISecret)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for credential result")
	}
}

func TestCollectPostMissingFields(t *testing.T) {
	handler := http.NewServeMux()
	handler.HandleFunc("/credentials", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var body struct {
				APIKey    string `json:"api_key"`
				APISecret string `json:"api_secret"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.APIKey == "" || body.APISecret == "" {
				http.Error(w, `{"error":"missing credentials"}`, http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusOK)
		}
	})

	srv := httptest.NewServer(handler)
	defer srv.Close()

	// POST with empty api_key should fail
	payload := map[string]string{"api_key": "", "api_secret": "secret"}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(srv.URL+"/credentials", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 for missing api_key", resp.StatusCode)
	}
}

func TestCollectTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	// Collect should fail because no browser opens and context expires.
	_, err := Collect(ctx, "test", "Test Broker")
	if err == nil {
		t.Fatal("expected error from Collect with expired context")
	}
}
