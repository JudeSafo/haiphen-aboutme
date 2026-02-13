package tui

import (
	"fmt"
	"regexp"
	"strings"

	"golang.org/x/term"
	"os"
)

var totpPattern = regexp.MustCompile(`^\d{6}$`)

// TOTPInput reads a masked 6-digit TOTP code from stdin.
func TOTPInput(prompt string) (string, error) {
	fmt.Print(prompt)
	b, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return "", fmt.Errorf("failed to read TOTP code: %w", err)
	}
	code := strings.TrimSpace(string(b))
	if !totpPattern.MatchString(code) {
		return "", fmt.Errorf("TOTP code must be exactly 6 digits")
	}
	return code, nil
}
