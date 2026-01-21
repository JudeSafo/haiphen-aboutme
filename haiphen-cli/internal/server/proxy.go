package server

import (
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/haiphen/haiphen-cli/internal/store"
)

type apiProxy struct {
	base   *url.URL
	client *http.Client
	st     store.Store
}

func newAPIProxy(apiOrigin string, st store.Store) (*apiProxy, error) {
	u, err := url.Parse(strings.TrimRight(apiOrigin, "/"))
	if err != nil {
		return nil, err
	}
	return &apiProxy{
		base: u,
		st:   st,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

func (p *apiProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	tok, err := p.st.LoadToken()
	if err != nil || tok == nil || tok.AccessToken == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	up := *p.base
	up.Path = strings.TrimRight(p.base.Path, "/") + r.URL.Path
	up.RawQuery = r.URL.RawQuery

	req, err := http.NewRequestWithContext(r.Context(), r.Method, up.String(), r.Body)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Copy headers (carefully)
	copyHeaders(req.Header, r.Header)
	stripHopByHop(req.Header)

	// Force auth
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)

	// Optional: identify the gateway (nice for server logs)
	req.Header.Set("X-Haiphen-Gateway", "local-cli")

	resp, err := p.client.Do(req)
	if err != nil {
		log.Printf("[proxy] upstream error: %v", err)
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy upstream headers + status
	copyHeaders(w.Header(), resp.Header)
	stripHopByHop(w.Header())
	w.WriteHeader(resp.StatusCode)

	_, _ = io.Copy(w, resp.Body)
}

func copyHeaders(dst, src http.Header) {
	for k, vals := range src {
		// don't forward Host
		if strings.EqualFold(k, "Host") {
			continue
		}
		for _, v := range vals {
			dst.Add(k, v)
		}
	}
}

func stripHopByHop(h http.Header) {
	// RFC 7230 hop-by-hop headers
	for _, k := range []string{
		"Connection", "Proxy-Connection", "Keep-Alive", "Proxy-Authenticate",
		"Proxy-Authorization", "Te", "Trailer", "Transfer-Encoding", "Upgrade",
	} {
		h.Del(k)
	}
}