package main

import (
	"archive/zip"
	"encoding/json"
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
