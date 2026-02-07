package util

import (
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func makeJWT(claims map[string]any) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload, _ := json.Marshal(claims)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payload)
	return header + "." + payloadB64 + ".fakesignature"
}

func TestJWTExpiry_Valid(t *testing.T) {
	exp := time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC).Unix()
	token := makeJWT(map[string]any{"exp": exp, "sub": "user1"})

	got, err := JWTExpiry(token)
	if err != nil {
		t.Fatalf("JWTExpiry: %v", err)
	}
	want := time.Unix(exp, 0)
	if !got.Equal(want) {
		t.Errorf("JWTExpiry = %v, want %v", got, want)
	}
}

func TestJWTExpiry_MissingExp(t *testing.T) {
	token := makeJWT(map[string]any{"sub": "user1"})
	_, err := JWTExpiry(token)
	if err == nil {
		t.Error("JWTExpiry should error when exp is missing")
	}
}

func TestJWTExpiry_InvalidToken_TooFewParts(t *testing.T) {
	_, err := JWTExpiry("onlyonepart")
	if err == nil {
		t.Error("JWTExpiry should error with too few segments")
	}
}

func TestJWTExpiry_InvalidBase64(t *testing.T) {
	_, err := JWTExpiry("header.!!!invalid!!!.sig")
	if err == nil {
		t.Error("JWTExpiry should error with invalid base64")
	}
}

func TestJWTExpiry_InvalidJSON(t *testing.T) {
	bad := base64.RawURLEncoding.EncodeToString([]byte("not json"))
	_, err := JWTExpiry("header." + bad + ".sig")
	if err == nil {
		t.Error("JWTExpiry should error with invalid JSON payload")
	}
}

func TestJWTExpiry_ZeroExp(t *testing.T) {
	token := makeJWT(map[string]any{"exp": 0})
	_, err := JWTExpiry(token)
	if err == nil {
		t.Error("JWTExpiry should error when exp is 0")
	}
}
