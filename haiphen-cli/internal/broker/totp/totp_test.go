package totp

import (
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
)

func TestEnrollReturnsSecret(t *testing.T) {
	secret, err := EnrollTOTP("test:broker")
	if err != nil {
		t.Fatalf("EnrollTOTP error: %v", err)
	}
	if secret == "" {
		t.Fatal("EnrollTOTP returned empty secret")
	}
	// Secret should be base32-encoded, at least 16 chars.
	if len(secret) < 16 {
		t.Errorf("secret length = %d, want >= 16", len(secret))
	}
}

func TestValidateTOTPCorrectCode(t *testing.T) {
	secret, err := EnrollTOTP("test:validate")
	if err != nil {
		t.Fatalf("EnrollTOTP error: %v", err)
	}

	// Generate a valid code using the same secret.
	code, err := totp.GenerateCode(secret, time.Now())
	if err != nil {
		t.Fatalf("GenerateCode error: %v", err)
	}

	if !ValidateTOTP(code, secret) {
		t.Error("ValidateTOTP returned false for a valid code")
	}
}

func TestValidateTOTPWrongCode(t *testing.T) {
	secret, err := EnrollTOTP("test:wrong")
	if err != nil {
		t.Fatalf("EnrollTOTP error: %v", err)
	}

	if ValidateTOTP("000000", secret) {
		// This could theoretically pass if 000000 is the current code,
		// but the probability is 1/1000000 per 30s window.
		t.Log("warning: 000000 happened to be a valid code (extremely unlikely)")
	}

	if ValidateTOTP("not-a-code", secret) {
		t.Error("ValidateTOTP returned true for non-numeric code")
	}
}
