// [PROJECT]: Lite Chromium Portable
// [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
// [BOUND THREAD]: goodkie/v-show Issue #8
// [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSanitizeString(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"--url=https://example.com/api?token=secret123&user=admin", "--url=https://example.com/api?token=[REDACTED]&user=admin"},
		{"password=mySuperPassword123", "password=[REDACTED]"},
		{"Authorization: Bearer eyJhbGciOi...", "Authorization: Bearer [REDACTED]"},
		{"cookie=session_id_45678", "cookie=[REDACTED]"},
		{"--user-data-dir=E:\\path\\profile", "--user-data-dir=E:\\path\\profile"},
	}

	for _, c := range cases {
		actual := SanitizeString(c.input)
		if actual != c.expected {
			t.Errorf("SanitizeString(%q) = %q; expected %q", c.input, actual, c.expected)
		}
	}
}

func TestLoggerWriting(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_logger_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	l := NewLogger(tempDir, "test_session", LevelDebug)
	l.Log(LevelInfo, "TEST_EVENT", "Test message with secret=xyz123", 1, 9999, "profile_1", "test_corr_1", []string{"cmd", "token=abc"}, map[string]interface{}{"key": "val"})

	auditPath := filepath.Join(tempDir, "launcher_audit.jsonl")
	auditBytes, err := os.ReadFile(auditPath)
	if err != nil {
		t.Fatalf("Failed to read audit log: %v", err)
	}
	auditContent := string(auditBytes)
	if !strings.Contains(auditContent, "TEST_EVENT") {
		t.Errorf("Expected TEST_EVENT in audit log, got: %s", auditContent)
	}
	if strings.Contains(auditContent, "xyz123") {
		t.Errorf("Secret xyz123 was NOT sanitized in audit log!")
	}
	if strings.Contains(auditContent, "abc") {
		t.Errorf("Token abc was NOT sanitized in command!")
	}

	humanPath := filepath.Join(tempDir, "launcher.log")
	humanBytes, err := os.ReadFile(humanPath)
	if err != nil {
		t.Fatalf("Failed to read human log: %v", err)
	}
	humanContent := string(humanBytes)
	if !strings.Contains(humanContent, "TEST_EVENT") {
		t.Errorf("Expected TEST_EVENT in human log, got: %s", humanContent)
	}
}
