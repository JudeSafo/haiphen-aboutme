package brokerstore

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStoreRoundTrip(t *testing.T) {
	// Use temp dir instead of real config dir.
	tmpDir := t.TempDir()

	s := &Store{dir: tmpDir, profile: "test"}

	creds := &Credentials{
		APIKey:    "PKTEST123",
		APISecret: "supersecretkey",
		AccountID: "acct-456",
	}

	// Save
	if err := s.Save("alpaca", creds); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	// Exists
	if !s.Exists("alpaca") {
		t.Fatal("Exists() = false after Save")
	}

	// File permissions
	info, err := os.Stat(s.path("alpaca"))
	if err != nil {
		t.Fatalf("stat error = %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("file permissions = %o, want 600", info.Mode().Perm())
	}

	// Load
	loaded, err := s.Load("alpaca")
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if loaded.APIKey != "PKTEST123" {
		t.Errorf("APIKey = %q, want PKTEST123", loaded.APIKey)
	}
	if loaded.APISecret != "supersecretkey" {
		t.Errorf("APISecret = %q, want supersecretkey", loaded.APISecret)
	}
	if loaded.AccountID != "acct-456" {
		t.Errorf("AccountID = %q, want acct-456", loaded.AccountID)
	}
	if loaded.ConnectedAt == "" {
		t.Error("ConnectedAt should be auto-populated")
	}

	// Delete
	if err := s.Delete("alpaca"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if s.Exists("alpaca") {
		t.Fatal("Exists() = true after Delete")
	}
}

func TestStoreLoadNonexistent(t *testing.T) {
	tmpDir := t.TempDir()
	s := &Store{dir: tmpDir, profile: "test"}

	creds, err := s.Load("nonexistent")
	if err != nil {
		t.Fatalf("Load() error = %v, want nil", err)
	}
	if creds != nil {
		t.Fatalf("Load() = %v, want nil", creds)
	}
}

func TestStoreDeleteNonexistent(t *testing.T) {
	tmpDir := t.TempDir()
	s := &Store{dir: tmpDir, profile: "test"}

	if err := s.Delete("nonexistent"); err != nil {
		t.Fatalf("Delete() error = %v, want nil", err)
	}
}

func TestStoreFilePath(t *testing.T) {
	s := &Store{dir: "/tmp/haiphen", profile: "default"}
	expected := filepath.Join("/tmp/haiphen", "broker.default.alpaca.enc")
	if s.path("alpaca") != expected {
		t.Errorf("path = %q, want %q", s.path("alpaca"), expected)
	}
}

func TestStoreFileIsEncrypted(t *testing.T) {
	tmpDir := t.TempDir()
	s := &Store{dir: tmpDir, profile: "test"}

	creds := &Credentials{
		APIKey:    "PKTEST123",
		APISecret: "supersecretkey",
	}

	if err := s.Save("alpaca", creds); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	raw, err := os.ReadFile(s.path("alpaca"))
	if err != nil {
		t.Fatalf("ReadFile error = %v", err)
	}

	// Raw file should not contain the plaintext key
	content := string(raw)
	if contains(content, "PKTEST123") || contains(content, "supersecretkey") {
		t.Error("encrypted file should not contain plaintext credentials")
	}
}

func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
