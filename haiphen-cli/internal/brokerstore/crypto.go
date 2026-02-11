package brokerstore

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"os/user"
	"runtime"

	"golang.org/x/crypto/pbkdf2"
)

const (
	pbkdf2Iterations = 100000
	keyLen           = 32
	passphrase       = "haiphen-broker-vault"
)

// deriveKey produces a 32-byte AES key using PBKDF2.
// The salt is machine-specific: SHA256(hostname + username + homedir + profile).
func deriveKey(profile string) ([]byte, error) {
	salt, err := machineSalt(profile)
	if err != nil {
		return nil, fmt.Errorf("derive key: %w", err)
	}
	key := pbkdf2.Key([]byte(passphrase), salt, pbkdf2Iterations, keyLen, sha256.New)
	return key, nil
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
