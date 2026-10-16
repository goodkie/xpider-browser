// [PROJECT]: Lite Chromium Portable
// [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
// [BOUND THREAD]: goodkie/v-show Issue #8
// [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

package main

import (
	"archive/zip"
	"io"
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
		{"https://operator:superSecretPass@api.internal.net/v1?api_key=my_key_999#token=frag_token", "https://operator:%5BREDACTED%5D@api.internal.net/v1?api_key=%5BREDACTED%5D#%5BREDACTED%5D"},
	}

	for _, c := range cases {
		actual := SanitizeString(c.input)
		if actual != c.expected {
			t.Errorf("SanitizeString(%q) = %q; expected %q", c.input, actual, c.expected)
		}
	}
}

func TestSanitizeArgs(t *testing.T) {
	args := []string{"chrome.exe", "--password", "superSecretPassword!", "--url", "https://example.com?auth=token999"}
	clean := SanitizeArgs(args)
	if clean[1] != "--password" {
		t.Errorf("Expected flag --password to be preserved, got %s", clean[1])
	}
	if clean[2] != "[REDACTED]" {
		t.Errorf("Expected password value to be [REDACTED], got %s", clean[2])
	}
	if strings.Contains(clean[4], "token999") {
		t.Errorf("Expected query auth to be redacted in url, got %s", clean[4])
	}
}

func TestSanitizeValue(t *testing.T) {
	details := map[string]interface{}{
		"normal_field": "safe_value",
		"auth_token":   "secret_token_12345",
		"password":     "plain_password",
		"nested": map[string]interface{}{
			"secret_key": "top_secret_nested",
			"safe_flag":  true,
		},
	}

	sanitized := SanitizeValue(details).(map[string]interface{})
	if sanitized["normal_field"] != "safe_value" {
		t.Errorf("Safe value corrupted")
	}
	if sanitized["auth_token"] != "[REDACTED]" {
		t.Errorf("auth_token not redacted: %v", sanitized["auth_token"])
	}
	if sanitized["password"] != "[REDACTED]" {
		t.Errorf("password not redacted: %v", sanitized["password"])
	}
	nested := sanitized["nested"].(map[string]interface{})
	if nested["secret_key"] != "[REDACTED]" {
		t.Errorf("nested secret_key not redacted: %v", nested["secret_key"])
	}
}

func TestLevelFiltering(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_logger_filter_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	l := NewLogger(tempDir, "test_session", LevelInfo)
	// Log DEBUG event when currentLevel is INFO -> MUST BE FILTERED
	l.Log(LevelDebug, "SHOULD_BE_IGNORED", "Debug message", 1, 100, "", "", nil, nil)

	// Log INFO event -> MUST BE WRITTEN
	l.Log(LevelInfo, "SHOULD_BE_WRITTEN", "Info message", 1, 100, "", "", nil, nil)

	auditPath := filepath.Join(tempDir, "launcher_audit_inst1.jsonl")
	data, err := os.ReadFile(auditPath)
	if err != nil {
		t.Fatalf("Failed to read audit log: %v", err)
	}
	content := string(data)
	if strings.Contains(content, "SHOULD_BE_IGNORED") {
		t.Errorf("Level filtering failed: DEBUG event was logged when currentLevel is INFO")
	}
	if !strings.Contains(content, "SHOULD_BE_WRITTEN") {
		t.Errorf("INFO event was not logged")
	}
}

func TestDiagnosticsSanitizationLeakCheck(t *testing.T) {
	appRoot, err := os.MkdirTemp("", "test_diag_root_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(appRoot)

	dataDir := filepath.Join(appRoot, "data")
	logsDir := filepath.Join(dataDir, "logs")
	_ = os.MkdirAll(logsDir, 0755)

	dummySecretToken := "TEST_DUMMY_SECRET_TOKEN_XYZ987654"
	dummyPassword := "FAKE_PASSWORD_ABC_123"

	// Create log with dummy secrets
	l := NewLogger(logsDir, "test_session", LevelInfo)
	l.Log(LevelInfo, "TEST_RUN", "Starting with token="+dummySecretToken, 1, 500, "", "", []string{"--password", dummyPassword}, nil)

	// Also simulate an un-sanitized log file line directly on disk
	leakLogPath := filepath.Join(logsDir, "raw_leak.log")
	_ = os.WriteFile(leakLogPath, []byte("RAW_EVENT token="+dummySecretToken+" password="+dummyPassword+"\n"), 0644)

	zipPath, err := ExportDiagnostics(appRoot)
	if err != nil {
		t.Fatalf("ExportDiagnostics failed: %v", err)
	}
	defer os.Remove(zipPath)

	// Read zip and assert zero leak of dummy secrets
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatalf("Failed to open diagnostic zip: %v", err)
	}
	defer zr.Close()

	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("Failed to open zip entry %s: %v", f.Name, err)
		}
		bytes, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			t.Fatalf("Failed to read zip entry %s: %v", f.Name, err)
		}
		content := string(bytes)
		if strings.Contains(content, dummySecretToken) {
			t.Fatalf("LEAK DETECTED in %s: dummySecretToken was found!", f.Name)
		}
		if strings.Contains(content, dummyPassword) {
			t.Fatalf("LEAK DETECTED in %s: dummyPassword was found!", f.Name)
		}
	}
}
