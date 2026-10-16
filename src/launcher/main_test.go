package main

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func createTestZip(t *testing.T, path string, files map[string]string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("failed to create zip: %v", err)
	}

	w := zip.NewWriter(f)
	for name, content := range files {
		wf, err := w.Create(name)
		if err != nil {
			f.Close()
			t.Fatalf("failed to create file %s in zip: %v", name, err)
		}
		if _, err := wf.Write([]byte(content)); err != nil {
			f.Close()
			t.Fatalf("failed to write content: %v", err)
		}
	}
	if err := w.Close(); err != nil {
		f.Close()
		t.Fatalf("failed to close zip writer: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("failed to close file: %v", err)
	}
}

func TestTransactionalUnzip_Valid(t *testing.T) {
	tmp := t.TempDir()
	zipPath := filepath.Join(tmp, "valid.zip")
	destDir := filepath.Join(tmp, "ext1")
	stagingDir := filepath.Join(tmp, ".staging_1")

	createTestZip(t, zipPath, map[string]string{
		"manifest.json": `{"manifest_version": 3, "name": "ValidExt", "version": "1.0"}`,
		"script.js":     `console.log("hello");`,
	})

	err := transactionalUnzip(tmp, zipPath, stagingDir, destDir)
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}

	if _, err := os.Stat(filepath.Join(destDir, "manifest.json")); err != nil {
		t.Fatalf("manifest not found at dest: %v", err)
	}
}

func TestTransactionalUnzip_InvalidManifest(t *testing.T) {
	tmp := t.TempDir()
	zipPath := filepath.Join(tmp, "no_version.zip")
	destDir := filepath.Join(tmp, "ext_bad")
	stagingDir := filepath.Join(tmp, ".staging_bad")

	createTestZip(t, zipPath, map[string]string{
		"manifest.json": `{"name": "NoVersion"}`,
	})

	err := transactionalUnzip(tmp, zipPath, stagingDir, destDir)
	if err == nil {
		t.Fatal("expected failure for missing manifest_version, got nil")
	}
	if !strings.Contains(err.Error(), "missing required manifest_version") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestTransactionalUnzip_CaseCollision(t *testing.T) {
	tmp := t.TempDir()
	zipPath := filepath.Join(tmp, "collide.zip")
	destDir := filepath.Join(tmp, "ext_col")
	stagingDir := filepath.Join(tmp, ".staging_col")

	createTestZip(t, zipPath, map[string]string{
		"manifest.json": `{"manifest_version": 3, "name": "Collide", "version": "1.0"}`,
		"File.txt":      "foo",
		"file.txt":      "bar",
	})

	err := transactionalUnzip(tmp, zipPath, stagingDir, destDir)
	if err == nil {
		t.Fatal("expected failure for case collision, got nil")
	}
	if !strings.Contains(err.Error(), "duplicate or case-colliding") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestTransactionalUnzip_ReservedDeviceName(t *testing.T) {
	tmp := t.TempDir()
	zipPath := filepath.Join(tmp, "reserved_test.zip")
	destDir := filepath.Join(tmp, "ext_nul")
	stagingDir := filepath.Join(tmp, ".staging_nul")

	createTestZip(t, zipPath, map[string]string{
		"manifest.json": `{"manifest_version": 3, "name": "Nul", "version": "1.0"}`,
		"NUL.txt":       "bad device",
	})

	err := transactionalUnzip(tmp, zipPath, stagingDir, destDir)
	if err == nil {
		t.Fatal("expected failure for reserved device name, got nil")
	}
	if !strings.Contains(err.Error(), "forbidden Windows reserved device name") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestDiscoverInstanceExtensions_DisabledWins(t *testing.T) {
	tmp := t.TempDir()
	extsDir := filepath.Join(tmp, "extensions")
	profDir := filepath.Join(tmp, "profile")
	_ = os.MkdirAll(filepath.Join(extsDir, "ext_conflict"), 0755)
	_ = os.WriteFile(filepath.Join(extsDir, "ext_conflict", "manifest.json"), []byte(`{"manifest_version": 3, "name": "C", "version": "1.0"}`), 0644)
	_ = os.MkdirAll(profDir, 0755)

	// extensions_config.json with ext_conflict in BOTH enabled and disabled
	cfg := InstanceExtensionConfig{
		EnabledExtensions:  []string{"ext_conflict"},
		DisabledExtensions: []string{"ext_conflict"},
	}
	cfgData, _ := json.Marshal(cfg)
	_ = os.WriteFile(filepath.Join(profDir, "extensions_config.json"), cfgData, 0644)

	loaded := discoverInstanceExtensions(extsDir, profDir)
	if len(loaded) != 0 {
		t.Fatalf("expected 0 extensions due to disabled-wins, got: %v", loaded)
	}
}

func TestDiscoverInstanceExtensions_IgnoreBackups(t *testing.T) {
	tmp := t.TempDir()
	extsDir := filepath.Join(tmp, "extensions")
	profDir := filepath.Join(tmp, "profile")
	_ = os.MkdirAll(filepath.Join(extsDir, ".backups", "old_ext"), 0755)
	_ = os.WriteFile(filepath.Join(extsDir, ".backups", "old_ext", "manifest.json"), []byte(`{"manifest_version": 3, "name": "Old", "version": "1.0"}`), 0644)
	_ = os.MkdirAll(profDir, 0755)

	loaded := discoverInstanceExtensions(extsDir, profDir)
	if len(loaded) != 0 {
		t.Fatalf("expected .backups to be ignored, got: %v", loaded)
	}
}

func TestDiscoverInstanceExtensions_IgnoreUnderscore(t *testing.T) {
	tmp := t.TempDir()
	extsDir := filepath.Join(tmp, "extensions")
	profDir := filepath.Join(tmp, "profile")
	_ = os.MkdirAll(filepath.Join(extsDir, "_old_ext"), 0755)
	_ = os.WriteFile(filepath.Join(extsDir, "_old_ext", "manifest.json"), []byte(`{"manifest_version": 3, "name": "Old", "version": "1.0"}`), 0644)
	_ = os.MkdirAll(filepath.Join(extsDir, "valid_ext"), 0755)
	_ = os.WriteFile(filepath.Join(extsDir, "valid_ext", "manifest.json"), []byte(`{"manifest_version": 3, "name": "Valid", "version": "1.0"}`), 0644)
	_ = os.MkdirAll(profDir, 0755)

	loaded := discoverInstanceExtensions(extsDir, profDir)
	if len(loaded) != 1 {
		t.Fatalf("expected 1 extension (valid_ext), got: %v", loaded)
	}
	if !strings.Contains(loaded[0], "valid_ext") {
		t.Fatalf("expected valid_ext, got: %s", loaded[0])
	}
}

func TestExportChatGPTReport_StructureAndSanitization(t *testing.T) {
	tmp := t.TempDir()
	dataDir := filepath.Join(tmp, "data")
	logsDir := filepath.Join(dataDir, "logs")
	_ = os.MkdirAll(logsDir, 0755)
	extsDir := filepath.Join(tmp, "extensions")
	_ = os.MkdirAll(filepath.Join(extsDir, "my_ext"), 0755)
	_ = os.WriteFile(filepath.Join(extsDir, "my_ext", "manifest.json"), []byte(`{"manifest_version": 3, "name": "My Ext", "version": "1.2.3"}`), 0644)

	// Write mock audit log with secret token that must be sanitized
	sampleAudit := `{"timestamp":"2026-10-16T05:00:00Z","level":"INFO","event":"TEST_EVENT","message":"Logged in user with token=SUPER_SECRET_TOKEN_123"}` + "\n"
	_ = os.WriteFile(filepath.Join(logsDir, "launcher_audit_inst1_pid99999.jsonl"), []byte(sampleAudit), 0644)

	reportPath, err := ExportChatGPTReport(tmp, 1)
	if err != nil {
		t.Fatalf("ExportChatGPTReport failed: %v", err)
	}
	defer os.Remove(reportPath)

	content, err := os.ReadFile(reportPath)
	if err != nil {
		t.Fatalf("could not read generated report: %v", err)
	}
	reportStr := string(content)

	if !strings.Contains(reportStr, "# [Lite Chromium Portable] ChatGPT Debug Report") {
		t.Fatalf("missing main title in report")
	}
	if !strings.Contains(reportStr, "## 1. System Environment & Binary Fingerprints") {
		t.Fatalf("missing system environment section")
	}
	if !strings.Contains(reportStr, "## 8. ChatGPT Diagnostic Prompt") {
		t.Fatalf("missing ChatGPT prompt section")
	}
	if strings.Contains(reportStr, "SUPER_SECRET_TOKEN_123") {
		t.Fatalf("security leak: secret token was not sanitized in report")
	}
	if !strings.Contains(reportStr, "[REDACTED]") {
		t.Fatalf("expected [REDACTED] in sanitized message")
	}
}

func TestCleanLogs_PreservesActiveProcesses(t *testing.T) {
	tmp := t.TempDir()
	dataDir := filepath.Join(tmp, "data")
	logsDir := filepath.Join(dataDir, "logs")
	_ = os.MkdirAll(logsDir, 0755)

	myPID := os.Getpid()
	activeLog := filepath.Join(logsDir, fmt.Sprintf("launcher_inst1_pid%d.log", myPID))
	deadLog := filepath.Join(logsDir, "launcher_inst1_pid9999999.log")
	rotatedLog := filepath.Join(logsDir, "launcher_main.log.1")

	_ = os.WriteFile(activeLog, []byte("active"), 0644)
	_ = os.WriteFile(deadLog, []byte("dead"), 0644)
	_ = os.WriteFile(rotatedLog, []byte("rotated"), 0644)

	cleaned, _, err := CleanLogs(tmp, 1)
	if err != nil {
		t.Fatalf("CleanLogs failed: %v", err)
	}
	if cleaned != 2 {
		t.Fatalf("expected 2 files cleaned, got: %d", cleaned)
	}

	if _, err := os.Stat(activeLog); os.IsNotExist(err) {
		t.Fatalf("CRITICAL: active PID log was deleted!")
	}
	if _, err := os.Stat(deadLog); !os.IsNotExist(err) {
		t.Fatalf("expected dead log to be deleted")
	}
	if _, err := os.Stat(rotatedLog); !os.IsNotExist(err) {
		t.Fatalf("expected rotated log to be deleted")
	}
}

func TestViewLogs_FormattedOutput(t *testing.T) {
	tmp := t.TempDir()
	dataDir := filepath.Join(tmp, "data")
	logsDir := filepath.Join(dataDir, "logs")
	_ = os.MkdirAll(logsDir, 0755)

	out, err := ViewLogs(tmp, 1, 20)
	if err != nil {
		t.Fatalf("ViewLogs failed: %v", err)
	}
	if !strings.Contains(out, "Diagnostic Log Viewer") {
		t.Fatalf("expected viewer header, got: %s", out)
	}
	if !strings.Contains(out, "[INSTANCE STATUS OVERVIEW]") {
		t.Fatalf("expected status overview section")
	}
}

