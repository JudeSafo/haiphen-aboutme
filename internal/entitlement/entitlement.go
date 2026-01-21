package entitlement

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/haiphen/haiphen-cli/internal/auth"
	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/store"
)

type Monitor struct {
	cfg *config.Config
	st  store.Store
	auth *auth.Client

	mu sync.RWMutex
	entitled bool
	lastCheck time.Time
}

func New(cfg *config.Config, st store.Store, a *auth.Client) *Monitor {
	return &Monitor{cfg: cfg, st: st, auth: a}
}

func (m *Monitor) Start(ctx context.Context) {
	t := time.NewTicker(time.Duration(m.cfg.EntitlementRefreshMinutes) * time.Minute)
	defer t.Stop()

	// initial
	m.refresh(ctx)

	for {
		select {
		case <-t.C:
			m.refresh(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (m *Monitor) refresh(ctx context.Context) {
	s, err := m.auth.Status(ctx)
	if err != nil {
		log.Printf("[entitlement] status error: %v", err)
		// Strict: fail closed by marking not entitled
		m.mu.Lock()
		m.entitled = false
		m.lastCheck = time.Now()
		m.mu.Unlock()
		return
	}

	m.mu.Lock()
	m.entitled = s.LoggedIn && s.Entitled
	m.lastCheck = time.Now()
	// If user is not entitled anymore, clear token to hard-lock.
	if s.LoggedIn && !s.Entitled {
		_ = m.st.ClearToken()
	}
	m.mu.Unlock()
}

func (m *Monitor) Entitled() (bool, time.Time) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.entitled, m.lastCheck
}