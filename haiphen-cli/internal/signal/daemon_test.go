package signal

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestPIDWriteReadRemove(t *testing.T) {
	// Use a temp dir to override config dir
	dir := t.TempDir()
	pidPath := filepath.Join(dir, "signal.test.pid")

	// Write
	pid := os.Getpid()
	if err := os.WriteFile(pidPath, []byte(strconv.Itoa(pid)), 0o600); err != nil {
		t.Fatal(err)
	}

	// Read
	data, err := os.ReadFile(pidPath)
	if err != nil {
		t.Fatal(err)
	}
	readPID, err := strconv.Atoi(string(data))
	if err != nil {
		t.Fatal(err)
	}
	if readPID != pid {
		t.Fatalf("expected PID %d, got %d", pid, readPID)
	}

	// Remove
	os.Remove(pidPath)
	if _, err := os.Stat(pidPath); !os.IsNotExist(err) {
		t.Fatal("expected PID file to be removed")
	}
}

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"delta-hedge-entry", "delta-hedge-entry"},
		{"My Rule Name", "my-rule-name"},
		{"UPPER CASE", "upper-case"},
		{"special!@#chars", "specialchars"},
		{"", "rule"},
		{"a_b_c", "a_b_c"},
	}

	for _, tt := range tests {
		got := sanitizeFilename(tt.in)
		if got != tt.want {
			t.Errorf("sanitizeFilename(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestLogJSON(t *testing.T) {
	// Just ensure it doesn't panic
	LogJSON("info", "test message", map[string]interface{}{
		"key": "value",
		"num": 42,
	})
}

func TestGenerateEventID(t *testing.T) {
	id1 := generateEventID()
	id2 := generateEventID()

	if id1 == "" {
		t.Fatal("empty event ID")
	}
	if id1 == id2 {
		t.Fatal("event IDs should be unique")
	}
	if len(id1) < 5 {
		t.Fatalf("event ID too short: %s", id1)
	}
}
