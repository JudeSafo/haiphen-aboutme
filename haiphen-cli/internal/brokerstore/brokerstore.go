package brokerstore

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Credentials holds the encrypted broker API credentials.
type Credentials struct {
	APIKey      string `json:"api_key"`
	APISecret   string `json:"api_secret"`
	AccountID   string `json:"account_id,omitempty"`
	ConnectedAt string `json:"connected_at"`
}

// Store manages encrypted broker credentials per profile and broker.
type Store struct {
	dir     string
	profile string
}

// New creates a credential store.
// Credentials are stored at ~/.config/haiphen/broker.<profile>.<broker>.enc
func New(profile string) (*Store, error) {
	if profile == "" {
		profile = "default"
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	base := filepath.Join(dir, "haiphen")
	if err := os.MkdirAll(base, 0o700); err != nil {
		return nil, err
	}
	return &Store{dir: base, profile: profile}, nil
}

func (s *Store) path(broker string) string {
	return filepath.Join(s.dir, fmt.Sprintf("broker.%s.%s.enc", s.profile, broker))
}

// Save encrypts and writes credentials for a broker.
func (s *Store) Save(broker string, creds *Credentials) error {
	if creds.ConnectedAt == "" {
		creds.ConnectedAt = time.Now().UTC().Format(time.RFC3339)
	}

	plaintext, err := json.Marshal(creds)
	if err != nil {
		return fmt.Errorf("marshal credentials: %w", err)
	}

	key, err := deriveKey(s.profile)
	if err != nil {
		return err
	}

	ciphertext, err := encrypt(key, plaintext)
	if err != nil {
		return fmt.Errorf("encrypt credentials: %w", err)
	}

	tmp := s.path(broker) + ".tmp"
	if err := os.WriteFile(tmp, ciphertext, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path(broker))
}

// Load decrypts and returns credentials for a broker.
// Returns nil, nil if no credentials are stored.
func (s *Store) Load(broker string) (*Credentials, error) {
	data, err := os.ReadFile(s.path(broker))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	key, err := deriveKey(s.profile)
	if err != nil {
		return nil, err
	}

	plaintext, err := decrypt(key, data)
	if err != nil {
		return nil, fmt.Errorf("decrypt credentials (wrong machine or corrupted?): %w", err)
	}

	var creds Credentials
	if err := json.Unmarshal(plaintext, &creds); err != nil {
		return nil, fmt.Errorf("unmarshal credentials: %w", err)
	}
	return &creds, nil
}

// Delete removes credentials for a broker.
func (s *Store) Delete(broker string) error {
	if err := os.Remove(s.path(broker)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// Exists checks if credentials are stored for a broker.
func (s *Store) Exists(broker string) bool {
	_, err := os.Stat(s.path(broker))
	return err == nil
}
