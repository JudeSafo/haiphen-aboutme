package server

import (
	"net/http"
	"testing"
)

func TestCopyHeaders(t *testing.T) {
	src := http.Header{}
	src.Set("Content-Type", "application/json")
	src.Set("X-Custom", "value1")
	src.Add("X-Custom", "value2")
	src.Set("Host", "evil.com")

	dst := http.Header{}
	copyHeaders(dst, src)

	if got := dst.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want %q", got, "application/json")
	}
	if vals := dst.Values("X-Custom"); len(vals) != 2 {
		t.Errorf("X-Custom values = %d, want 2", len(vals))
	}
	if got := dst.Get("Host"); got != "" {
		t.Errorf("Host should not be copied, got %q", got)
	}
}

func TestStripHopByHop(t *testing.T) {
	h := http.Header{}
	hopByHop := []string{
		"Connection", "Proxy-Connection", "Keep-Alive",
		"Proxy-Authenticate", "Proxy-Authorization",
		"Te", "Trailer", "Transfer-Encoding", "Upgrade",
	}
	for _, k := range hopByHop {
		h.Set(k, "some-value")
	}
	h.Set("Content-Type", "application/json")
	h.Set("Authorization", "Bearer tok")

	stripHopByHop(h)

	for _, k := range hopByHop {
		if got := h.Get(k); got != "" {
			t.Errorf("header %q should be stripped, got %q", k, got)
		}
	}
	// Non-hop-by-hop should be preserved
	if got := h.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type should be preserved, got %q", got)
	}
	if got := h.Get("Authorization"); got != "Bearer tok" {
		t.Errorf("Authorization should be preserved, got %q", got)
	}
}
