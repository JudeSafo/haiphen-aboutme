package tui

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"golang.org/x/term"
)

// ---- Interactive Select (bubbletea) ----

type selectModel struct {
	prompt   string
	options  []string
	cursor   int
	selected int // -1 until chosen
	quitting bool
}

func (m selectModel) Init() tea.Cmd { return nil }

func (m selectModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}
		case "down", "j":
			if m.cursor < len(m.options)-1 {
				m.cursor++
			}
		case "enter":
			m.selected = m.cursor
			return m, tea.Quit
		case "q", "ctrl+c", "esc":
			m.quitting = true
			return m, tea.Quit
		// Number keys for quick jump (1-9)
		case "1", "2", "3", "4", "5", "6", "7", "8", "9":
			n := int(msg.String()[0] - '0')
			if n >= 1 && n <= len(m.options) {
				m.selected = n - 1
				return m, tea.Quit
			}
		}
	}
	return m, nil
}

func (m selectModel) View() string {
	var b strings.Builder
	if m.prompt != "" {
		b.WriteString(m.prompt + "\n")
	}

	cursorStyle := lipgloss.NewStyle().Foreground(T.Primary).Bold(true)
	mutedNum := lipgloss.NewStyle().Foreground(T.Muted)

	for i, opt := range m.options {
		num := mutedNum.Render(fmt.Sprintf(" %d ", i+1))
		if i == m.cursor {
			cursor := cursorStyle.Render("> ")
			label := cursorStyle.Render(opt)
			b.WriteString(fmt.Sprintf("%s%s%s\n", cursor, num, label))
		} else {
			b.WriteString(fmt.Sprintf("  %s%s\n", num, opt))
		}
	}

	b.WriteString(HelpStyle.Render("\n  ↑↓/jk move · enter select · 1-9 jump · q back") + "\n")
	return b.String()
}

// Select presents an interactive list of options with arrow-key navigation.
// Returns the selected index (0-based) or error if quit.
func Select(prompt string, options []string) (int, error) {
	if len(options) == 0 {
		return 0, fmt.Errorf("no options provided")
	}

	m := selectModel{
		prompt:   prompt,
		options:  options,
		selected: -1,
	}

	p := tea.NewProgram(m)
	finalModel, err := p.Run()
	if err != nil {
		return 0, fmt.Errorf("select: %w", err)
	}

	final := finalModel.(selectModel)
	if final.quitting || final.selected < 0 {
		return 0, fmt.Errorf("selection cancelled")
	}

	return final.selected, nil
}

// ---- Interactive Confirm (bubbletea) ----

type confirmModel struct {
	prompt     string
	defaultYes bool
	cursor     int // 0 = yes, 1 = no
	decided    bool
	result     bool
	quitting   bool
}

func (m confirmModel) Init() tea.Cmd { return nil }

func (m confirmModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "left", "h", "tab":
			if m.cursor > 0 {
				m.cursor--
			} else {
				m.cursor = 1
			}
		case "right", "l":
			if m.cursor < 1 {
				m.cursor++
			} else {
				m.cursor = 0
			}
		case "y", "Y":
			m.decided = true
			m.result = true
			return m, tea.Quit
		case "n", "N":
			m.decided = true
			m.result = false
			return m, tea.Quit
		case "enter":
			m.decided = true
			m.result = m.cursor == 0 // 0 = Yes
			return m, tea.Quit
		case "q", "ctrl+c", "esc":
			m.quitting = true
			m.decided = true
			m.result = false
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m confirmModel) View() string {
	var b strings.Builder

	b.WriteString(m.prompt + " ")

	yesStyle := lipgloss.NewStyle().Foreground(T.Muted)
	noStyle := lipgloss.NewStyle().Foreground(T.Muted)
	activeStyle := lipgloss.NewStyle().Foreground(T.Primary).Bold(true).Underline(true)

	yes := "Yes"
	no := "No"
	if m.cursor == 0 {
		yes = activeStyle.Render("Yes")
		no = noStyle.Render("No")
	} else {
		yes = yesStyle.Render("Yes")
		no = activeStyle.Render("No")
	}

	b.WriteString(fmt.Sprintf("[%s / %s]", yes, no))
	b.WriteString(HelpStyle.Render("  ←→ toggle · y/n · enter confirm"))
	b.WriteString("\n")

	return b.String()
}

// Confirm asks a yes/no question with arrow-key toggle.
// Default cursor position depends on defaultYes.
func Confirm(prompt string, defaultYes bool) (bool, error) {
	cursor := 1 // default No
	if defaultYes {
		cursor = 0 // default Yes
	}

	m := confirmModel{
		prompt:     prompt,
		defaultYes: defaultYes,
		cursor:     cursor,
	}

	p := tea.NewProgram(m)
	finalModel, err := p.Run()
	if err != nil {
		return false, fmt.Errorf("confirm: %w", err)
	}

	final := finalModel.(confirmModel)
	if final.quitting {
		return false, nil
	}

	return final.result, nil
}

// ---- TextInput (stays readline-based — no arrow nav needed) ----

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
	n := 0
	_, parseErr := fmt.Sscanf(input, "%d", &n)
	if parseErr != nil {
		return 0, fmt.Errorf("invalid number: %q", input)
	}
	return n, nil
}
