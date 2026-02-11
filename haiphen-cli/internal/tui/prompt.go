package tui

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"

	"golang.org/x/term"
)

// Select presents a list of options and returns the selected index.
func Select(prompt string, options []string) (int, error) {
	fmt.Println(prompt)
	for i, opt := range options {
		marker := "  "
		if i == 0 {
			marker = C(Cyan, "› ")
		}
		fmt.Printf("%s%s\n", marker, opt)
	}
	fmt.Print("\nChoice [1]: ")

	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return 0, err
	}
	input = strings.TrimSpace(input)
	if input == "" {
		return 0, nil
	}
	n, err := strconv.Atoi(input)
	if err != nil || n < 1 || n > len(options) {
		return 0, fmt.Errorf("invalid selection: %q", input)
	}
	return n - 1, nil
}

// Confirm asks a yes/no question and returns the result.
// Default is false (no) unless defaultYes is true.
func Confirm(prompt string, defaultYes bool) (bool, error) {
	hint := "[y/N]"
	if defaultYes {
		hint = "[Y/n]"
	}
	fmt.Printf("%s %s: ", prompt, hint)

	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return false, err
	}
	input = strings.TrimSpace(strings.ToLower(input))
	if input == "" {
		return defaultYes, nil
	}
	return input == "y" || input == "yes", nil
}

// TextInput reads a line of text from stdin.
func TextInput(prompt string) (string, error) {
	fmt.Print(prompt)
	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(input), nil
}

// SecretInput reads a line of masked input from stdin (no echo).
func SecretInput(prompt string) (string, error) {
	fmt.Print(prompt)
	b, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println() // newline after hidden input
	if err != nil {
		return "", fmt.Errorf("failed to read secret: %w", err)
	}
	return strings.TrimSpace(string(b)), nil
}

// NumberInput reads an integer from stdin with a default value.
func NumberInput(prompt string, defaultVal int) (int, error) {
	fmt.Printf("%s [%d]: ", prompt, defaultVal)
	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return 0, err
	}
	input = strings.TrimSpace(input)
	if input == "" {
		return defaultVal, nil
	}
	n, err := strconv.Atoi(input)
	if err != nil {
		return 0, fmt.Errorf("invalid number: %q", input)
	}
	return n, nil
}
