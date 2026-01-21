package ratelimit

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type Limiter struct {
	mu sync.Mutex
	byKey map[string]*rate.Limiter

	r rate.Limit
	b int
}

func New(perMinute int, burst int) *Limiter {
	return &Limiter{
		byKey: make(map[string]*rate.Limiter),
		r:     rate.Limit(float64(perMinute) / 60.0),
		b:     burst,
	}
}

func (l *Limiter) Get(key string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()

	rl, ok := l.byKey[key]
	if !ok {
		rl = rate.NewLimiter(l.r, l.b)
		l.byKey[key] = rl
	}
	return rl
}

func (l *Limiter) Allow(key string) bool {
	rl := l.Get(key)
	return rl.AllowN(time.Now(), 1)
}