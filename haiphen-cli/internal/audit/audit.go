package audit

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const maxEntries = 10000

// Entry is a single audit log record.
type Entry struct {
	Timestamp  time.Time         `json:"ts"`
	Action     string            `json:"action"`
	Tier       string            `json:"tier"`
	User       string            `json:"user"`
	Args       map[string]string `json:"args,omitempty"`
	Success    bool              `json:"success"`
	Error      string            `json:"error,omitempty"`
	DurationMs int64             `json:"duration_ms"`
}

// Logger writes structured audit entries to a JSONL file.
type Logger struct {
	path    string
	mu      sync.Mutex
	pending *Entry
	start   time.Time
}

// New creates an audit logger for the given profile.
func New(profile string) (*Logger, error) {
	if profile == "" {
		profile = "default"
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	base := filepath.Join(dir, "haiphen")
	if err := os.MkdirAll(base, 0o700); err != nil {
		return nil, err
	}
	return &Logger{
		path: filepath.Join(base, fmt.Sprintf("audit.%s.jsonl", profile)),
	}, nil
}

// Begin starts tracking a new audit entry. Call Finish() to write it.
func (l *Logger) Begin(action, tier, user string, args map[string]string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.start = time.Now()
	l.pending = &Entry{
		Timestamp: l.start,
		Action:    action,
		Tier:      tier,
		User:      user,
		Args:      args,
	}
}

// Finish writes the pending audit entry with success/error status.
func (l *Logger) Finish(err error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.pending == nil {
		return
	}
	l.pending.DurationMs = time.Since(l.start).Milliseconds()
	if err != nil {
		l.pending.Success = false
		l.pending.Error = err.Error()
	} else {
		l.pending.Success = true
	}
	l.write(l.pending)
	l.pending = nil
}

func (l *Logger) write(e *Entry) {
	b, err := json.Marshal(e)
	if err != nil {
		return
	}
	b = append(b, '\n')

	f, err := os.OpenFile(l.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(b)

	// Check size and rotate if needed
	if info, err := f.Stat(); err == nil && info.Size() > int64(maxEntries)*512 {
		go l.rotate()
	}
}

func (l *Logger) rotate() {
	data, err := os.ReadFile(l.path)
	if err != nil {
		return
	}

	lines := make([][]byte, 0)
	start := 0
	for i := 0; i < len(data); i++ {
		if data[i] == '\n' {
			if i > start {
				lines = append(lines, data[start:i+1])
			}
			start = i + 1
		}
	}

	if len(lines) <= maxEntries {
		return
	}

	// Keep last maxEntries entries
	keep := lines[len(lines)-maxEntries:]
	f, err := os.OpenFile(l.path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	for _, line := range keep {
		_, _ = f.Write(line)
	}
}
