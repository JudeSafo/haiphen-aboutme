package util

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestServiceGet_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method = %q, want GET", r.Method)
		}
		if r.URL.Path != "/v1/health" {
			t.Errorf("path = %q, want /v1/health", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer tok123" {
			t.Errorf("Authorization = %q, want %q", got, "Bearer tok123")
		}
		if got := r.Header.Get("X-Haiphen-Gateway"); got != "local-cli" {
			t.Errorf("X-Haiphen-Gateway = %q, want %q", got, "local-cli")
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	data, err := ServiceGet(context.Background(), srv.URL, "/v1/health", "tok123")
	if err != nil {
		t.Fatalf("ServiceGet: %v", err)
	}
	if string(data) != `{"ok":true}` {
		t.Errorf("body = %q, want %q", string(data), `{"ok":true}`)
	}
}

func TestServiceGet_Unauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		_, _ = w.Write([]byte("unauthorized"))
	}))
	defer srv.Close()

	_, err := ServiceGet(context.Background(), srv.URL, "/v1/test", "bad")
	if err == nil {
		t.Fatal("ServiceGet should return error on 401")
	}
}

func TestServiceGet_Forbidden(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(403)
	}))
	defer srv.Close()

	_, err := ServiceGet(context.Background(), srv.URL, "/v1/test", "tok")
	if err == nil {
		t.Fatal("ServiceGet should return error on 403")
	}
}

func TestServiceGet_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = w.Write([]byte("internal error"))
	}))
	defer srv.Close()

	_, err := ServiceGet(context.Background(), srv.URL, "/v1/test", "tok")
	if err == nil {
		t.Fatal("ServiceGet should return error on 500")
	}
}

func TestServiceGet_EmptyToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// "Bearer " with empty token gets normalized to "Bearer" by net/http
		got := r.Header.Get("Authorization")
		if got != "Bearer" && got != "Bearer " {
			t.Errorf("Authorization = %q, want Bearer prefix", got)
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()

	_, err := ServiceGet(context.Background(), srv.URL, "/v1/health", "")
	if err != nil {
		t.Fatalf("ServiceGet with empty token: %v", err)
	}
}

func TestServicePost_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %q, want POST", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("Content-Type = %q, want application/json", ct)
		}

		body, _ := io.ReadAll(r.Body)
		var payload map[string]string
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatalf("unmarshal body: %v", err)
		}
		if payload["target"] != "gw-01" {
			t.Errorf("target = %q, want %q", payload["target"], "gw-01")
		}

		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"scan_id":"s1"}`))
	}))
	defer srv.Close()

	data, err := ServicePost(context.Background(), srv.URL, "/v1/scan", "tok",
		map[string]string{"target": "gw-01"})
	if err != nil {
		t.Fatalf("ServicePost: %v", err)
	}
	if string(data) != `{"scan_id":"s1"}` {
		t.Errorf("body = %q", string(data))
	}
}

func TestServicePost_NilPayload(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if len(body) != 0 {
			t.Errorf("expected empty body with nil payload, got %q", body)
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()

	_, err := ServicePost(context.Background(), srv.URL, "/v1/test", "tok", nil)
	if err != nil {
		t.Fatalf("ServicePost nil payload: %v", err)
	}
}

func TestServicePost_Unauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
	}))
	defer srv.Close()

	_, err := ServicePost(context.Background(), srv.URL, "/v1/test", "tok",
		map[string]string{"a": "b"})
	if err == nil {
		t.Fatal("ServicePost should return error on 401")
	}
}

func TestServicePost_Non2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(422)
		_, _ = w.Write([]byte("validation error"))
	}))
	defer srv.Close()

	_, err := ServicePost(context.Background(), srv.URL, "/v1/test", "tok",
		map[string]string{"a": "b"})
	if err == nil {
		t.Fatal("ServicePost should return error on 422")
	}
}

func TestServiceGet_TrailingSlashOrigin(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/health" {
			t.Errorf("path = %q, want /v1/health (no double slash)", r.URL.Path)
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()

	_, err := ServiceGet(context.Background(), srv.URL+"/", "/v1/health", "tok")
	if err != nil {
		t.Fatalf("ServiceGet with trailing slash: %v", err)
	}
}
