package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

type Options struct {
	Profile string
}

type Token struct {
	AccessToken string    `json:"access_token"`
	Expiry      time.Time `json:"expiry"`
}

type Store interface {
	LoadToken() (*Token, error)
	SaveToken(*Token) error
	ClearToken() error
}

type fileStore struct {
	path string
}

func New(opts Options) (Store, error) {
	if opts.Profile == "" {
		opts.Profile = "default"
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	base := filepath.Join(dir, "haiphen")
	if err := os.MkdirAll(base, 0o700); err != nil {
		return nil, err
	}
	path := filepath.Join(base, "session."+opts.Profile+".json")
	return newKeyringStore(opts.Profile, path), nil
}

func (s *fileStore) LoadToken() (*Token, error) {
	b, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var t Token
	if err := json.Unmarshal(b, &t); err != nil {
		return nil, err
	}
	if t.AccessToken == "" {
		return nil, nil
	}
	return &t, nil
}

func (s *fileStore) SaveToken(t *Token) error {
	b, err := json.MarshalIndent(t, "", "  ")
	if err != nil {
		return err
	}
	// write atomically
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *fileStore) ClearToken() error {
	if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}