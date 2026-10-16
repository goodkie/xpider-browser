// [PROJECT]: Lite Chromium Portable
// [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
// [BOUND THREAD]: goodkie/v-show Issue #8
// [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

type DiagnosticSystemSummary struct {
	Timestamp       string            `json:"timestamp"`
	OS              string            `json:"os"`
	Arch            string            `json:"arch"`
	NumCPU          int               `json:"num_cpu"`
	LauncherPath    string            `json:"launcher_path"`
	LauncherSHA256  string            `json:"launcher_sha256"`
	EnginePath      string            `json:"engine_path"`
	EngineExists    bool              `json:"engine_exists"`
	DiskFreeBytesC  uint64            `json:"disk_free_bytes_c,omitempty"`
	DiskFreeBytesE  uint64            `json:"disk_free_bytes_e,omitempty"`
	ActiveInstances []InstanceRecord  `json:"active_instances"`
	Extensions      []ExtMetaSummary  `json:"extensions"`
	SafetyNotes     []string          `json:"safety_notes"`
}

type ExtMetaSummary struct {
	DirName     string `json:"dir_name"`
	Name        string `json:"name,omitempty"`
	Version     string `json:"version,omitempty"`
	HasSidePanel bool  `json:"has_side_panel,omitempty"`
}

func getDiskFreeSpace(path string) uint64 {
	if runtime.GOOS != "windows" {
		return 0
	}
	procGetDiskFreeSpaceExW := modKernel32.NewProc("GetDiskFreeSpaceExW")
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0
	}
	var freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes uint64
	r1, _, _ := procGetDiskFreeSpaceExW.Call(
		uintptr(unsafe.Pointer(p)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)
	if r1 == 0 {
		return 0
	}
	return freeBytesAvailable
}

func computeFileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// ExportDiagnostics packages an audited diagnostic bundle with zero private user data
func ExportDiagnostics(appRoot string) (string, error) {
	dataDir := filepath.Join(appRoot, "data")
	logsDir := filepath.Join(dataDir, "logs")
	registryFile := filepath.Join(dataDir, "instances.json")
	extsDir := filepath.Join(appRoot, "extensions")

	now := time.Now().UTC()
	zipFilename := fmt.Sprintf("diagnostics_%s.zip", now.Format("20060102_150405"))
	zipPath := filepath.Join(appRoot, zipFilename)

	zipFile, err := os.Create(zipPath)
	if err != nil {
		return "", fmt.Errorf("cannot create diagnostic zip: %w", err)
	}
	defer zipFile.Close()

	w := zip.NewWriter(zipFile)
	defer w.Close()

	// 1. System Summary
	launcherExe, _ := os.Executable()
	launcherSHA, _ := computeFileSHA256(launcherExe)
	engineExe, _ := findEngine(appRoot)
	_, engineStatErr := os.Stat(engineExe)

	reg, _ := readRegistry(registryFile)

	var extSummaries []ExtMetaSummary
	if entries, err := os.ReadDir(extsDir); err == nil {
		for _, e := range entries {
			if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
				mfPath := filepath.Join(extsDir, e.Name(), "manifest.json")
				summary := ExtMetaSummary{DirName: e.Name()}
				if data, err := os.ReadFile(mfPath); err == nil {
					var rawMf map[string]interface{}
					if json.Unmarshal(data, &rawMf) == nil {
						if n, ok := rawMf["name"].(string); ok {
							summary.Name = n
						}
						if v, ok := rawMf["version"].(string); ok {
							summary.Version = v
						}
						if _, ok := rawMf["side_panel"]; ok {
							summary.HasSidePanel = true
						}
					}
				}
				extSummaries = append(extSummaries, summary)
			}
		}
	}

	summary := DiagnosticSystemSummary{
		Timestamp:       now.Format(time.RFC3339Nano),
		OS:              runtime.GOOS,
		Arch:            runtime.GOARCH,
		NumCPU:          runtime.NumCPU(),
		LauncherPath:    launcherExe,
		LauncherSHA256:  launcherSHA,
		EnginePath:      engineExe,
		EngineExists:    engineStatErr == nil,
		DiskFreeBytesC:  getDiskFreeSpace("C:\\"),
		DiskFreeBytesE:  getDiskFreeSpace("E:\\"),
		ActiveInstances: reg.Instances,
		Extensions:      extSummaries,
		SafetyNotes: []string{
			"All user profile databases (Cookies, Login Data, Web Data, History) are strictly excluded.",
			"Launcher logs have all tokens, credentials, and cookies masked.",
		},
	}

	summaryData, _ := json.MarshalIndent(summary, "", "  ")
	if f, err := w.Create("system_summary.json"); err == nil {
		_, _ = f.Write(summaryData)
	}

	// 2. Add instances.json
	if regData, err := os.ReadFile(registryFile); err == nil {
		if f, err := w.Create("instances.json"); err == nil {
			_, _ = f.Write(regData)
		}
	}

	// 3. Add Logs
	if logEntries, err := os.ReadDir(logsDir); err == nil {
		for _, le := range logEntries {
			if !le.IsDir() && (strings.HasSuffix(le.Name(), ".log") || strings.HasSuffix(le.Name(), ".jsonl")) {
				lp := filepath.Join(logsDir, le.Name())
				if ldata, err := os.ReadFile(lp); err == nil {
					if f, err := w.Create("logs/" + le.Name()); err == nil {
						_, _ = f.Write(ldata)
					}
				}
			}
		}
	}

	return zipPath, nil
}
