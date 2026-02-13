package brokerstore

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"os/user"
	"runtime"

	"github.com/zalando/go-keyring"
	"golang.org/x/crypto/pbkdf2"
)

const (
	pbkdf2Iterations = 100000
	keyLen           = 32
	passphrase       = "haiphen-broker-vault"
	keyringService   = "haiphen-cli"
)

// legacyDeriveKey uses the hardcoded passphrase (for migration from pre-keychain installs).
func legacyDeriveKey(profile string) ([]byte, error) {
	salt, err := machineSalt(profile)
	if err != nil {
		return nil, fmt.Errorf("derive key: %w", err)
	}
	key := pbkdf2.Key([]byte(passphrase), salt, pbkdf2Iterations, keyLen, sha256.New)
	return key, nil
}

// deriveKey produces a 32-byte AES key using a keychain-stored random master key.
// Falls back to the legacy hardcoded passphrase if the keychain is unavailable.
func deriveKey(profile string) ([]byte, error) {
	acct := fmt.Sprintf("broker-master.%s", profile)

	storedKey, err := keyring.Get(keyringService, acct)
	if err != nil {
		if err == keyring.ErrNotFound {
			// First time: generate a random master key and store in keychain
			rawKey := make([]byte, 32)
			if _, err := io.ReadFull(rand.Reader, rawKey); err != nil {
				return legacyDeriveKey(profile)
			}
			encoded := base64.StdEncoding.EncodeToString(rawKey)
			if err := keyring.Set(keyringService, acct, encoded); err != nil {
				// Keychain unavailable — fall back to hardcoded passphrase
				return legacyDeriveKey(profile)
			}
			storedKey = encoded
		} else {
			// Other keyring error — fall back
			return legacyDeriveKey(profile)
		}
	}

	decoded, err := base64.StdEncoding.DecodeString(storedKey)
	if err != nil || len(decoded) == 0 {
		return legacyDeriveKey(profile)
	}

	salt, err := machineSalt(profile)
	if err != nil {
		return nil, fmt.Errorf("derive key: %w", err)
	}
	return pbkdf2.Key(decoded, salt, pbkdf2Iterations, keyLen, sha256.New), nil
}

func machineSalt(profile string) ([]byte, error) {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = runtime.GOOS
	}

	u, err := user.Current()
	if err != nil {
		return nil, err
	}

	h := sha256.New()
	h.Write([]byte(hostname))
	h.Write([]byte(u.Username))
	h.Write([]byte(u.HomeDir))
	h.Write([]byte(profile))
	return h.Sum(nil), nil
}

// encrypt uses AES-256-GCM to encrypt plaintext.
func encrypt(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// decrypt uses AES-256-GCM to decrypt ciphertext.
func decrypt(key, ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce, ct := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return gcm.Open(nil, nonce, ct, nil)
}
