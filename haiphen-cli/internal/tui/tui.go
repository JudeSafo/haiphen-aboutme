package tui

import (
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"
)

// Spinner displays an animated spinner with a message.
type Spinner struct {
	w       io.Writer
	msg     string
	stop    chan struct{}
	stopped chan struct{}
	mu      sync.Mutex
}

var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

// NewSpinner creates and starts a spinner with the given message.
func NewSpinner(msg string) *Spinner {
	s := &Spinner{
		w:       os.Stderr,
		msg:     msg,
		stop:    make(chan struct{}),
		stopped: make(chan struct{}),
	}
	go s.run()
	return s
}

func (s *Spinner) run() {
	defer close(s.stopped)
	i := 0
	ticker := time.NewTicker(80 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-s.stop:
			// Clear the spinner line.
			fmt.Fprintf(s.w, "\r%s\r", strings.Repeat(" ", len(s.msg)+4))
			return
		case <-ticker.C:
			s.mu.Lock()
			frame := spinnerFrames[i%len(spinnerFrames)]
			fmt.Fprintf(s.w, "\r%s %s", C(Cyan, frame), s.msg)
			s.mu.Unlock()
			i++
		}
	}
}

// Update changes the spinner message while running.
func (s *Spinner) Update(msg string) {
	s.mu.Lock()
	s.msg = msg
	s.mu.Unlock()
}

// Stop stops the spinner and clears the line.
func (s *Spinner) Stop() {
	select {
	case <-s.stop:
		return // already stopped
	default:
		close(s.stop)
	}
	<-s.stopped
}

// Success stops the spinner and prints a success message.
func (s *Spinner) Success(msg string) {
	s.Stop()
	fmt.Fprintf(s.w, "%s %s\n", C(Green, "✓"), msg)
}

// Fail stops the spinner and prints a failure message.
func (s *Spinner) Fail(msg string) {
	s.Stop()
	fmt.Fprintf(s.w, "%s %s\n", C(Red, "✗"), msg)
}

// DisclaimerBanner prints the paper trading warning box.
func DisclaimerBanner(w io.Writer) {
	border := C(Yellow+Bold, "  ┌──────────────────────────────────────────────────┐")
	line1 := C(Yellow+Bold, "  │") + C(Yellow+Bold, "  ⚠  PAPER TRADING ONLY — NO REAL MONEY") + strings.Repeat(" ", 11) + C(Yellow+Bold, "│")
	line2 := C(Yellow+Bold, "  │") + "  All connections use paper/sandbox APIs." + strings.Repeat(" ", 9) + C(Yellow+Bold, "│")
	bottom := C(Yellow+Bold, "  └──────────────────────────────────────────────────┘")

	fmt.Fprintln(w, border)
	fmt.Fprintln(w, line1)
	fmt.Fprintln(w, line2)
	fmt.Fprintln(w, bottom)
	fmt.Fprintln(w)
}

// InlineDisclaimer prints a compact one-line disclaimer.
func InlineDisclaimer(w io.Writer) {
	fmt.Fprintf(w, "  %s\n\n", C(Yellow+Bold, "⚠  PAPER TRADING ONLY"))
}

// TableRow prints a key-value pair with aligned formatting.
func TableRow(w io.Writer, label, value string) {
	fmt.Fprintf(w, "  %-16s %s\n", C(Gray, label+":"), value)
}

// Header prints a styled section header.
func Header(w io.Writer, title string) {
	fmt.Fprintf(w, "\n%s\n", C(Bold, title))
	fmt.Fprintln(w, C(Gray, strings.Repeat("━", len(title)+2)))
}

// StatusIcon returns a colored status indicator.
func StatusIcon(status string) string {
	switch strings.ToLower(status) {
	case "filled", "active", "success", "connected":
		return C(Green, "●")
	case "pending_new", "accepted", "pending":
		return C(Yellow, "●")
	case "canceled", "cancelled", "expired", "error", "rejected":
		return C(Red, "●")
	case "partially_filled":
		return C(Cyan, "●")
	default:
		return C(Gray, "●")
	}
}

// FormatMoney formats a float as a dollar amount.
func FormatMoney(amount float64) string {
	if amount >= 0 {
		return C(Green, fmt.Sprintf("$%,.2f", amount))
	}
	return C(Red, fmt.Sprintf("-$%,.2f", -amount))
}

// FormatMoneyPlain formats a float as a dollar amount without color.
func FormatMoneyPlain(amount float64) string {
	if amount >= 0 {
		return fmt.Sprintf("$%.2f", amount)
	}
	return fmt.Sprintf("-$%.2f", -amount)
}
