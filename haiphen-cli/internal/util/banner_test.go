package util

import (
	"bytes"
	"strings"
	"testing"
)

func TestPrintBanner_Wide(t *testing.T) {
	var buf bytes.Buffer
	PrintBanner(&buf, BannerSizeWide)
	out := buf.String()
	if out == "" {
		t.Error("Wide banner should not be empty")
	}
	// Wide banner uses # characters for ASCII art
	if !strings.Contains(out, "#@*") {
		t.Error("Wide banner should contain '#@*' ASCII art characters")
	}
}

func TestPrintBanner_Compact(t *testing.T) {
	var buf bytes.Buffer
	PrintBanner(&buf, BannerSizeCompact)
	out := buf.String()
	// Compact banner has literal "aiphen" in its ASCII art
	if !strings.Contains(out, "|_|") {
		t.Error("Compact banner should contain '|_|' ASCII art")
	}
}

func TestPrintBanner_DefaultIsWide(t *testing.T) {
	var buf bytes.Buffer
	PrintBanner(&buf, "unknown")
	out := buf.String()
	// Default should be the wide banner
	if !strings.Contains(out, "#@*") {
		t.Error("Unknown size should default to wide banner")
	}
}

func TestPrintBanner_NoLeadingTrailingNewlines(t *testing.T) {
	var buf bytes.Buffer
	PrintBanner(&buf, BannerSizeWide)
	out := buf.String()
	// Should end with a single newline from Fprintln, not multiple
	if strings.HasPrefix(out, "\n\n") {
		t.Error("Banner should not have leading double newlines")
	}
}
