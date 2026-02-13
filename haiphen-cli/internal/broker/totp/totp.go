package totp

import (
	"fmt"
	"os"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	qrcode "github.com/skip2/go-qrcode"

	"github.com/haiphen/haiphen-cli/internal/tui"
)

// EnrollTOTP generates a new TOTP secret, displays a terminal QR code and
// the manual entry key, and returns the secret string. The caller should
// verify one code before persisting the secret.
func EnrollTOTP(accountName string) (string, error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "Haiphen",
		AccountName: accountName,
		Algorithm:   otp.AlgorithmSHA1,
		Digits:      otp.DigitsSix,
	})
	if err != nil {
		return "", fmt.Errorf("generate TOTP key: %w", err)
	}

	// Render QR code to terminal.
	qr, err := qrcode.New(key.URL(), qrcode.Medium)
	if err == nil {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, tui.C(tui.Bold, "  Scan this QR code with your authenticator app:"))
		fmt.Fprintln(os.Stderr)
		fmt.Fprint(os.Stderr, qr.ToSmallString(false))
	}

	// Always show manual entry as fallback.
	fmt.Fprintln(os.Stderr)
	fmt.Fprintf(os.Stderr, "  %s %s\n", tui.C(tui.Gray, "Manual entry:"), key.Secret())
	fmt.Fprintln(os.Stderr)

	return key.Secret(), nil
}

// ValidateTOTP checks a 6-digit TOTP code against the given secret.
func ValidateTOTP(code, secret string) bool {
	return totp.Validate(code, secret)
}
