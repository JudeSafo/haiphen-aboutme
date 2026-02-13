package store

import (
	"encoding/json"
	"os"

	"github.com/zalando/go-keyring"
)

const keyringService = "haiphen-cli"

type keyringStore struct {
	account  string // "session.<profile>"
	fallback *fileStore
}

func newKeyringStore(profile string, fallbackPath string) Store {
	account := "session." + profile
	fb := &fileStore{path: fallbackPath}

	// Probe keyring availability with a no-op get
	_, err := keyring.Get(keyringService, account)
	if err == keyring.ErrNotFound {
		// Keyring works, key just doesn't exist yet — use keyring store
		return &keyringStore{account: account, fallback: fb}
	}
	if err != nil {
		// Keyring unavailable (CI, SSH, containers) — fall back to file
		return fb
	}
	// Key exists in keyring — use it
	return &keyringStore{account: account, fallback: fb}
}

func (ks *keyringStore) LoadToken() (*Token, error) {
	s, err := keyring.Get(keyringService, ks.account)
	if err == keyring.ErrNotFound {
		// Check file fallback (migration path)
		return ks.fallback.LoadToken()
	}
	if err != nil {
		return ks.fallback.LoadToken()
	}
	var t Token
	if err := json.Unmarshal([]byte(s), &t); err != nil {
		return nil, err
	}
	if t.AccessToken == "" {
		return nil, nil
	}
	return &t, nil
}

func (ks *keyringStore) SaveToken(t *Token) error {
	b, err := json.Marshal(t)
	if err != nil {
		return err
	}
	if err := keyring.Set(keyringService, ks.account, string(b)); err != nil {
		// Keyring write failed — fall back to file
		return ks.fallback.SaveToken(t)
	}
	// Delete plaintext file if migration succeeded
	_ = os.Remove(ks.fallback.path)
	return nil
}

func (ks *keyringStore) ClearToken() error {
	// Clear from both locations
	_ = keyring.Delete(keyringService, ks.account)
	return ks.fallback.ClearToken()
}
