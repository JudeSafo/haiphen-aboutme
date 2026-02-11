package brokerstore

import (
	"bytes"
	"testing"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}

	plaintext := []byte("sensitive broker credentials")

	ciphertext, err := encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("encrypt() error = %v", err)
	}

	if bytes.Equal(ciphertext, plaintext) {
		t.Fatal("ciphertext should not equal plaintext")
	}

	decrypted, err := decrypt(key, ciphertext)
	if err != nil {
		t.Fatalf("decrypt() error = %v", err)
	}

	if !bytes.Equal(decrypted, plaintext) {
		t.Errorf("decrypted = %q, want %q", decrypted, plaintext)
	}
}

func TestEncryptProducesDifferentCiphertexts(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}

	plaintext := []byte("same data")

	ct1, err := encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("encrypt() error = %v", err)
	}
	ct2, err := encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("encrypt() error = %v", err)
	}

	if bytes.Equal(ct1, ct2) {
		t.Error("two encryptions of same data should produce different ciphertexts (random nonce)")
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1 := make([]byte, 32)
	key2 := make([]byte, 32)
	for i := range key1 {
		key1[i] = byte(i)
		key2[i] = byte(i + 1)
	}

	plaintext := []byte("secret data")
	ciphertext, err := encrypt(key1, plaintext)
	if err != nil {
		t.Fatalf("encrypt() error = %v", err)
	}

	_, err = decrypt(key2, ciphertext)
	if err == nil {
		t.Fatal("expected error when decrypting with wrong key")
	}
}

func TestDecryptTruncatedCiphertext(t *testing.T) {
	key := make([]byte, 32)
	_, err := decrypt(key, []byte("short"))
	if err == nil {
		t.Fatal("expected error for truncated ciphertext")
	}
}

func TestDeriveKeyDeterministic(t *testing.T) {
	k1, err := deriveKey("test-profile")
	if err != nil {
		t.Fatalf("deriveKey() error = %v", err)
	}
	k2, err := deriveKey("test-profile")
	if err != nil {
		t.Fatalf("deriveKey() error = %v", err)
	}

	if !bytes.Equal(k1, k2) {
		t.Error("deriveKey() should produce same key for same profile")
	}

	if len(k1) != 32 {
		t.Errorf("key length = %d, want 32", len(k1))
	}
}

func TestDeriveKeyDifferentProfiles(t *testing.T) {
	k1, err := deriveKey("profile-a")
	if err != nil {
		t.Fatalf("deriveKey() error = %v", err)
	}
	k2, err := deriveKey("profile-b")
	if err != nil {
		t.Fatalf("deriveKey() error = %v", err)
	}

	if bytes.Equal(k1, k2) {
		t.Error("different profiles should produce different keys")
	}
}
