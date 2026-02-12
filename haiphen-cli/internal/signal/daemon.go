package signal

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// DaemonConfig holds daemon lifecycle config.
type DaemonConfig struct {
	Profile     string
	APIOrigin   string
	Token       string
	RulesDir    string
	MaxOrderQty int
}

// PIDPath returns the PID file path for a profile.
func PIDPath(profile string) (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "haiphen", fmt.Sprintf("signal.%s.pid", profile)), nil
}

// LogPath returns the log file path for a profile.
func LogPath(profile string) (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "haiphen", fmt.Sprintf("signal.%s.log", profile)), nil
}

// WritePID writes the current process PID to the PID file.
func WritePID(profile string) error {
	path, err := PIDPath(profile)
	if err != nil {
		return err
	}
	return os.WriteFile(path, []byte(strconv.Itoa(os.Getpid())), 0o600)
}

// ReadPID reads the daemon PID from the PID file.
func ReadPID(profile string) (int, error) {
	path, err := PIDPath(profile)
	if err != nil {
		return 0, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(data)))
}

// RemovePID removes the PID file.
func RemovePID(profile string) {
	path, _ := PIDPath(profile)
	if path != "" {
		os.Remove(path)
	}
}

// IsRunning checks if a daemon process is alive.
func IsRunning(profile string) (int, bool) {
	pid, err := ReadPID(profile)
	if err != nil {
		return 0, false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return 0, false
	}
	// Signal 0 checks if process exists
	err = proc.Signal(syscall.Signal(0))
	return pid, err == nil
}

// StopDaemon sends SIGTERM to the running daemon.
func StopDaemon(profile string) error {
	pid, running := IsRunning(profile)
	if !running {
		return fmt.Errorf("no daemon running (profile=%s)", profile)
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return proc.Signal(syscall.SIGTERM)
}

// SetupLogger configures structured JSON logging to the log file.
func SetupLogger(profile string) (*os.File, error) {
	logPath, err := LogPath(profile)
	if err != nil {
		return nil, err
	}
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	log.SetOutput(f)
	log.SetFlags(0) // We'll do our own formatting
	return f, nil
}

// LogJSON writes a structured JSON log line.
func LogJSON(level, msg string, fields map[string]interface{}) {
	entry := map[string]interface{}{
		"ts":    time.Now().UTC().Format(time.RFC3339Nano),
		"level": level,
		"msg":   msg,
	}
	for k, v := range fields {
		entry[k] = v
	}
	data, _ := json.Marshal(entry)
	log.Println(string(data))
}

// RunDaemon is the main daemon loop: load rules, connect WS, evaluate.
func RunDaemon(ctx context.Context, engine *Engine, dcfg DaemonConfig) error {
	// Load rules
	rules, err := LoadRulesFromDir(dcfg.RulesDir)
	if err != nil {
		return fmt.Errorf("load rules: %w", err)
	}

	// Assign IDs + filter valid rules
	var active []*Rule
	for _, r := range rules {
		if r.RuleID == "" {
			r.RuleID = DeterministicID("", r.Name)
		}
		if err := ValidateRule(r, dcfg.MaxOrderQty); err != nil {
			LogJSON("warn", "skipping invalid rule", map[string]interface{}{
				"rule": r.Name, "error": err.Error(),
			})
			continue
		}
		if r.Status == "active" {
			active = append(active, r)
		}
	}

	engine.SetRules(active)

	// Load position filter for copy-trade
	posFilter, err := LoadPositionFilter(dcfg.Profile)
	if err != nil {
		LogJSON("warn", "failed to load position filter, copy-trade disabled", map[string]interface{}{
			"error": err.Error(),
		})
		posFilter = DefaultPositionFilter()
	}
	engine.SetPositionFilter(posFilter)

	LogJSON("info", "daemon started", map[string]interface{}{
		"pid":              os.Getpid(),
		"rules":            len(active),
		"dry_run":          engine.config.DryRun,
		"api":              dcfg.APIOrigin,
		"copy_trade":       posFilter.Enabled,
	})

	// WebSocket connect loop with exponential backoff
	backoff := time.Second
	maxBackoff := 2 * time.Minute

	for {
		select {
		case <-ctx.Done():
			LogJSON("info", "daemon shutting down", nil)
			return nil
		default:
		}

		err := connectAndListen(ctx, engine, dcfg)
		if ctx.Err() != nil {
			return nil
		}

		LogJSON("warn", "WebSocket disconnected", map[string]interface{}{
			"error":   fmt.Sprintf("%v", err),
			"backoff": backoff.String(),
		})

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(backoff):
		}

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func connectAndListen(ctx context.Context, engine *Engine, dcfg DaemonConfig) error {
	wsURL := strings.Replace(dcfg.APIOrigin, "https://", "wss://", 1)
	wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
	wsURL = strings.TrimRight(wsURL, "/") + "/v1/signal/stream?token=" + dcfg.Token

	LogJSON("info", "connecting to signal feed", map[string]interface{}{
		"url": strings.Split(wsURL, "?")[0], // don't log token
	})

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	LogJSON("info", "connected to signal feed", nil)

	// Read loop
	for {
		select {
		case <-ctx.Done():
			conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return nil
		default:
		}

		_, msg, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}

		// Parse message type
		var envelope struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(msg, &envelope); err != nil {
			continue
		}

		switch envelope.Type {
		case "hello":
			LogJSON("info", "received hello from signal feed", nil)
		case "snapshot":
			snap, err := ParseSnapshot(msg)
			if err != nil {
				LogJSON("warn", "parse snapshot failed", map[string]interface{}{
					"error": err.Error(),
				})
				continue
			}
			LogJSON("debug", "snapshot received", map[string]interface{}{
				"date":   snap.Date,
				"kpis":   len(snap.KPIs),
				"source": snap.Source,
			})
			engine.Evaluate(ctx, snap)
		case "position_events":
			events, err := ParsePositionEvents(msg)
			if err != nil {
				LogJSON("warn", "parse position events failed", map[string]interface{}{
					"error": err.Error(),
				})
				continue
			}
			LogJSON("debug", "position events received", map[string]interface{}{
				"count": len(events),
			})
			engine.ProcessPositionEvents(ctx, events)
		}
	}
}

// EventLogger runs a goroutine that logs events and optionally posts them to the API.
func EventLogger(ctx context.Context, events <-chan Event, apiOrigin, token string) {
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-events:
			if !ok {
				return
			}

			LogJSON("info", "signal event", map[string]interface{}{
				"event_id":   ev.EventID,
				"rule_id":    ev.RuleID,
				"event_type": ev.EventType,
				"symbol":     ev.Symbol,
				"order_id":   ev.OrderID,
			})

			// Async POST to API (best-effort)
			if token != "" && apiOrigin != "" {
				go postEvent(apiOrigin, token, ev)
			}
		}
	}
}

func postEvent(apiOrigin, token string, ev Event) {
	// Fire-and-forget: errors are logged but don't affect daemon
	data, err := json.Marshal(ev)
	if err != nil {
		return
	}

	url := strings.TrimRight(apiOrigin, "/") + "/v1/signal/events"
	req, err := newJSONRequest("POST", url, data)
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := newHTTPClient(10 * time.Second)
	resp, err := client.Do(req)
	if err != nil {
		LogJSON("warn", "event post failed", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}
	resp.Body.Close()
}
