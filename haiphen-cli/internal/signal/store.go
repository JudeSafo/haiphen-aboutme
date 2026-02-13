package signal

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// SignalsDir returns the directory for signal rule YAML files.
func SignalsDir(profile string) (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(configDir, "haiphen", "signals", profile)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

// LoadRulesFromDir reads all .yaml files from a directory and returns parsed rules.
func LoadRulesFromDir(dir string) ([]*Rule, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var rules []*Rule
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			continue
		}

		r, err := LoadRuleFile(filepath.Join(dir, name))
		if err != nil {
			return nil, fmt.Errorf("parse %s: %w", name, err)
		}
		rules = append(rules, r)
	}
	return rules, nil
}

// LoadRuleFile reads and parses a single YAML rule file.
func LoadRuleFile(path string) (*Rule, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var r Rule
	if err := yaml.Unmarshal(data, &r); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}

	// Normalize defaults
	if r.Status == "" {
		r.Status = "active"
	}
	if r.Order.Type == "" {
		r.Order.Type = "market"
	}
	if r.Order.TIF == "" {
		r.Order.TIF = "day"
	}
	if r.Cooldown < 60 {
		r.Cooldown = 60
	}
	if r.Version < 1 {
		r.Version = 1
	}

	return &r, nil
}

// SaveRule writes a rule as a YAML file. Filename is derived from rule name.
func SaveRule(dir string, r *Rule) error {
	data, err := yaml.Marshal(r)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	filename := sanitizeFilename(r.Name) + ".yaml"
	path := filepath.Join(dir, filename)

	// Write atomically
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// DeleteRule removes the YAML file for a rule.
func DeleteRule(dir, name string) error {
	filename := sanitizeFilename(name) + ".yaml"
	path := filepath.Join(dir, filename)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// sanitizeFilename converts a rule name to a safe filename.
func sanitizeFilename(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		if r == ' ' {
			return '-'
		}
		return -1
	}, s)
	if s == "" {
		s = "rule"
	}
	return s
}
