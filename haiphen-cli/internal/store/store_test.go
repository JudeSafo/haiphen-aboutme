package store

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// newTestStore creates a file store in a temp directory.
func newTestStore(t *testing.T) *fileStore {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "session.test.json")
	return &fileStore{path: path}
}

// storePath extracts the underlying file path regardless of store type.
func storePath(st Store) string {
	switch s := st.(type) {
	case *fileStore:
		return s.path
	case *keyringStore:
		return s.fallback.path
	default:
		return ""
	}
}

func TestNew_DefaultProfile(t *testing.T) {
	st, err := New(Options{Profile: ""})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	// Should have been set to "default"
	p := storePath(st)
	if !contains(p, "session.default.json") {
		t.Errorf("path = %q, want to contain session.default.json", p)
	}
}

func TestNew_CustomProfile(t *testing.T) {
	st, err := New(Options{Profile: "work"})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	p := storePath(st)
	if !contains(p, "session.work.json") {
		t.Errorf("path = %q, want to contain session.work.json", p)
	}
}

func TestLoadToken_NoFile(t *testing.T) {
	st := newTestStore(t)
	tok, err := st.LoadToken()
	if err != nil {
		t.Fatalf("LoadToken: %v", err)
	}
	if tok != nil {
		t.Errorf("LoadToken on missing file should return nil, got %+v", tok)
	}
}

func TestSaveAndLoadToken(t *testing.T) {
	st := newTestStore(t)
	expiry := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	tok := &Token{AccessToken: "abc123", Expiry: expiry}

	if err := st.SaveToken(tok); err != nil {
		t.Fatalf("SaveToken: %v", err)
	}

	loaded, err := st.LoadToken()
	if err != nil {
		t.Fatalf("LoadToken: %v", err)
	}
	if loaded == nil {
		t.Fatal("LoadToken returned nil after save")
	}
	if loaded.AccessToken != "abc123" {
		t.Errorf("AccessToken = %q, want %q", loaded.AccessToken, "abc123")
	}
	if !loaded.Expiry.Equal(expiry) {
		t.Errorf("Expiry = %v, want %v", loaded.Expiry, expiry)
	}
}

func TestSaveToken_AtomicWrite(t *testing.T) {
	st := newTestStore(t)
	tok := &Token{AccessToken: "test", Expiry: time.Now().Add(time.Hour)}

	if err := st.SaveToken(tok); err != nil {
		t.Fatalf("SaveToken: %v", err)
	}

	// Temp file should be cleaned up
	tmpPath := st.path + ".tmp"
	if _, err := os.Stat(tmpPath); !os.IsNotExist(err) {
		t.Errorf("tmp file should not exist after save, got err=%v", err)
	}
}

func TestSaveToken_FilePermissions(t *testing.T) {
	st := newTestStore(t)
	tok := &Token{AccessToken: "secret", Expiry: time.Now().Add(time.Hour)}

	if err := st.SaveToken(tok); err != nil {
		t.Fatalf("SaveToken: %v", err)
	}

	info, err := os.Stat(st.path)
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	perm := info.Mode().Perm()
	// The tmp file is written with 0600; after rename the perm should be preserved.
	if perm&0o077 != 0 {
		t.Errorf("file permissions = %o, want group/other bits to be 0", perm)
	}
}

func TestLoadToken_EmptyAccessToken(t *testing.T) {
	st := newTestStore(t)
	tok := &Token{AccessToken: "", Expiry: time.Now().Add(time.Hour)}
	if err := st.SaveToken(tok); err != nil {
		t.Fatalf("SaveToken: %v", err)
	}

	loaded, err := st.LoadToken()
	if err != nil {
		t.Fatalf("LoadToken: %v", err)
	}
	// Empty access token should return nil
	if loaded != nil {
		t.Errorf("LoadToken with empty access_token should return nil, got %+v", loaded)
	}
}

func TestClearToken(t *testing.T) {
	st := newTestStore(t)
	tok := &Token{AccessToken: "abc", Expiry: time.Now().Add(time.Hour)}
	if err := st.SaveToken(tok); err != nil {
		t.Fatalf("SaveToken: %v", err)
	}

	if err := st.ClearToken(); err != nil {
		t.Fatalf("ClearToken: %v", err)
	}

	loaded, err := st.LoadToken()
	if err != nil {
		t.Fatalf("LoadToken after clear: %v", err)
	}
	if loaded != nil {
		t.Errorf("LoadToken after clear should return nil, got %+v", loaded)
	}
}

func TestClearToken_NoFile(t *testing.T) {
	st := newTestStore(t)
	// Should not error when file doesn't exist
	if err := st.ClearToken(); err != nil {
		t.Fatalf("ClearToken on missing file: %v", err)
	}
}

func TestLoadToken_InvalidJSON(t *testing.T) {
	st := newTestStore(t)
	if err := os.WriteFile(st.path, []byte("not json"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	_, err := st.LoadToken()
	if err == nil {
		t.Error("LoadToken with invalid JSON should return error")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && filepath.Base(s) == substr || len(s) > 0 && findSubstr(s, substr)
}

func findSubstr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
