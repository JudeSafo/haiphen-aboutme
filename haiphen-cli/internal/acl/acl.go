package acl

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Tier represents a required access level for a CLI command.
type Tier int

const (
	Public Tier = iota // No auth needed
	Free               // Login required, no payment
	Pro                // Login + paid entitlement
	Admin              // Login + admin role
)

// ParseTier converts a string annotation to a Tier value.
func ParseTier(s string) Tier {
	switch strings.ToLower(s) {
	case "free":
		return Free
	case "pro":
		return Pro
	case "admin":
		return Admin
	default:
		return Public
	}
}

func (t Tier) String() string {
	switch t {
	case Free:
		return "free"
	case Pro:
		return "pro"
	case Admin:
		return "admin"
	default:
		return "public"
	}
}

// UserRole holds the resolved role and plan for the logged-in user.
type UserRole struct {
	LoggedIn bool      `json:"logged_in"`
	Email    string    `json:"email"`
	Plan     string    `json:"plan"`    // "free", "pro", "enterprise"
	Role     string    `json:"role"`    // "user", "admin"
	Entitled bool      `json:"entitled"`
	CachedAt time.Time `json:"cached_at"`
}

const cacheTTL = 5 * time.Minute

// Client resolves user roles via the auth API with caching.
type Client struct {
	authOrigin string
	profile    string

	mu    sync.Mutex
	cache *UserRole
}

// NewClient creates a new ACL client.
func NewClient(authOrigin, profile string) *Client {
	return &Client{
		authOrigin: authOrigin,
		profile:    profile,
	}
}

// ResolveRole returns the user's role, using cache when valid.
func (c *Client) ResolveRole(token string) (*UserRole, error) {
	c.mu.Lock()
	if c.cache != nil && time.Since(c.cache.CachedAt) < cacheTTL {
		role := *c.cache
		c.mu.Unlock()
		return &role, nil
	}
	c.mu.Unlock()

	// Try disk cache
	if disk := c.loadDiskCache(); disk != nil && time.Since(disk.CachedAt) < cacheTTL {
		c.mu.Lock()
		c.cache = disk
		c.mu.Unlock()
		return disk, nil
	}

	// Fetch from /me
	role, err := c.fetchRole(token)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.cache = role
	c.mu.Unlock()
	c.saveDiskCache(role)

	return role, nil
}

func (c *Client) fetchRole(token string) (*UserRole, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(c.authOrigin, "/")+"/me", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("role check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("role check returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var me struct {
		Sub      string `json:"sub"`
		Email    string `json:"email"`
		Plan     string `json:"plan"`
		Role     string `json:"role"`
		Entitled bool   `json:"entitled"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&me); err != nil {
		return nil, fmt.Errorf("decode /me: %w", err)
	}

	return &UserRole{
		LoggedIn: true,
		Email:    me.Email,
		Plan:     me.Plan,
		Role:     me.Role,
		Entitled: me.Entitled,
		CachedAt: time.Now(),
	}, nil
}

func (c *Client) cacheFilePath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	profile := c.profile
	if profile == "" {
		profile = "default"
	}
	return filepath.Join(dir, "haiphen", "role."+profile+".json")
}

func (c *Client) loadDiskCache() *UserRole {
	path := c.cacheFilePath()
	if path == "" {
		return nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var role UserRole
	if json.Unmarshal(b, &role) != nil {
		return nil
	}
	return &role
}

func (c *Client) saveDiskCache(role *UserRole) {
	path := c.cacheFilePath()
	if path == "" {
		return
	}
	b, err := json.MarshalIndent(role, "", "  ")
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(path), 0o700)
	_ = os.WriteFile(path, b, 0o600)
}

// ClearCache removes the disk cache file (used on logout).
func (c *Client) ClearCache() {
	c.mu.Lock()
	c.cache = nil
	c.mu.Unlock()
	path := c.cacheFilePath()
	if path != "" {
		_ = os.Remove(path)
	}
}
