package tui

import (
	"os"
	"testing"
)

func TestColorsEnabled(t *testing.T) {
	// Save env state
	origNoColor := os.Getenv("NO_COLOR")
	origTerm := os.Getenv("TERM")
	defer func() {
		os.Setenv("NO_COLOR", origNoColor)
		os.Setenv("TERM", origTerm)
	}()

	// Normal — colors enabled
	os.Unsetenv("NO_COLOR")
	os.Setenv("TERM", "xterm-256color")
	if !ColorsEnabled() {
		t.Error("expected colors enabled in normal terminal")
	}

	// NO_COLOR set — colors disabled
	os.Setenv("NO_COLOR", "1")
	os.Setenv("TERM", "xterm-256color")
	if ColorsEnabled() {
		t.Error("expected colors disabled when NO_COLOR is set")
	}

	// TERM=dumb — colors disabled
	os.Unsetenv("NO_COLOR")
	os.Setenv("TERM", "dumb")
	if ColorsEnabled() {
		t.Error("expected colors disabled when TERM=dumb")
	}
}

func TestC(t *testing.T) {
	// With colors enabled
	origNoColor := os.Getenv("NO_COLOR")
	origTerm := os.Getenv("TERM")
	defer func() {
		os.Setenv("NO_COLOR", origNoColor)
		os.Setenv("TERM", origTerm)
	}()

	os.Unsetenv("NO_COLOR")
	os.Setenv("TERM", "xterm-256color")
	result := C(Red, "error")
	if result != Red+"error"+Reset {
		t.Errorf("C(Red, \"error\") = %q, want %q", result, Red+"error"+Reset)
	}

	// With colors disabled
	os.Setenv("NO_COLOR", "1")
	result = C(Red, "error")
	if result != "error" {
		t.Errorf("C(Red, \"error\") with NO_COLOR = %q, want \"error\"", result)
	}
}
