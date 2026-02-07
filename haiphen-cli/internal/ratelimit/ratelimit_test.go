package ratelimit

import "testing"

func TestNew(t *testing.T) {
	rl := New(60, 10)
	if rl == nil {
		t.Fatal("New returned nil")
	}
	if rl.b != 10 {
		t.Errorf("burst = %d, want %d", rl.b, 10)
	}
}

func TestAllow_WithinBurst(t *testing.T) {
	rl := New(60, 5)
	for i := 0; i < 5; i++ {
		if !rl.Allow("key1") {
			t.Errorf("Allow(%d) returned false within burst", i)
		}
	}
}

func TestAllow_ExceedsBurst(t *testing.T) {
	rl := New(60, 3)
	// Exhaust burst
	for i := 0; i < 3; i++ {
		rl.Allow("key1")
	}
	// Next should be denied (no time has passed)
	if rl.Allow("key1") {
		t.Error("Allow should return false after burst exhausted")
	}
}

func TestAllow_PerKey(t *testing.T) {
	rl := New(60, 2)
	// Exhaust key1
	rl.Allow("key1")
	rl.Allow("key1")

	// key2 should still work
	if !rl.Allow("key2") {
		t.Error("key2 should be allowed independently of key1")
	}
}

func TestGet_ReturnsSameLimiter(t *testing.T) {
	rl := New(60, 5)
	l1 := rl.Get("a")
	l2 := rl.Get("a")
	if l1 != l2 {
		t.Error("Get should return same limiter for same key")
	}
}

func TestGet_DifferentKeys(t *testing.T) {
	rl := New(60, 5)
	l1 := rl.Get("a")
	l2 := rl.Get("b")
	if l1 == l2 {
		t.Error("Get should return different limiters for different keys")
	}
}
