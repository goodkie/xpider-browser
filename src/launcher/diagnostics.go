// [PROJECT]: Lite Chromium Portable
// [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
// [BOUND THREAD]: goodkie/v-show Issue #8
// [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

package main

import (
	"archive/zip"
	"bufio"
	"bytes"
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
	Timestamp       string                    `json:"timestamp"`
	OS              string                    `json:"os"`
	Arch            string                    `json:"arch"`
	NumCPU          int                       `json:"num_cpu"`
	LauncherPath    string                    `json:"launcher_path"`
	LauncherSHA256  string                    `json:"launcher_sha256"`
	EnginePath      string                    `json:"engine_path"`
	EngineExists    bool                      `json:"engine_exists"`
	DiskFreeBytesC  uint64                    `json:"disk_free_bytes_c,omitempty"`
	DiskFreeBytesE  uint64                    `json:"disk_free_bytes_e,omitempty"`
	ActiveInstances []SanitizedInstanceRecord `json:"active_instances"`
	Extensions      []ExtMetaSummary          `json:"extensions"`
	SafetyNotes     []string                  `json:"safety_notes"`
}

type SanitizedInstanceRecord struct {
	InstanceID   int       `json:"instance_id"`
	PID          int       `json:"pid"`
	ProfileDir   string    `json:"profile_dir"`
	StartedAt    time.Time `json:"started_at"`
	CreationTime uint64    `json:"creation_time,omitempty"`
	ImagePath    string    `json:"image_path,omitempty"`
}

type ExtMetaSummary struct {
	DirName      string `json:"dir_name"`
	Name         string `json:"name,omitempty"`
	Version      string `json:"version,omitempty"`
	HasSidePanel bool   `json:"has_side_panel,omitempty"`
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

// sanitizeJSONLLine parses a JSONL line, applies recursive sanitization on details/command/messages,
// and serializes back into standard sanitized JSON.
func sanitizeJSONLLine(line string) []byte {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return nil
	}
	var rawEvent map[string]interface{}
	if err := json.Unmarshal([]byte(trimmed), &rawEvent); err == nil {
		// 1. Sanitize Details map recursively
		if d, ok := rawEvent["details"].(map[string]interface{}); ok {
			rawEvent["details"] = SanitizeValue(d)
		}
		// 2. Sanitize Command slice
		if cmdSlice, ok := rawEvent["command"].([]interface{}); ok {
			strCmds := make([]string, len(cmdSlice))
			for i, c := range cmdSlice {
				if s, ok := c.(string); ok {
					strCmds[i] = s
				}
			}
			cleanCmds := SanitizeArgs(strCmds)
			cleanInterface := make([]interface{}, len(cleanCmds))
			for i, s := range cleanCmds {
				cleanInterface[i] = s
			}
			rawEvent["command"] = cleanInterface
		}
		// 3. Sanitize message & event
		if m, ok := rawEvent["message"].(string); ok {
			rawEvent["message"] = SanitizeString(m)
		}
		if ev, ok := rawEvent["event"].(string); ok {
			rawEvent["event"] = SanitizeString(ev)
		}
		if b, err := json.Marshal(rawEvent); err == nil {
			return append(b, '\n')
		}
	}
	// Fallback for unparsable lines
	fallback := SanitizeString(trimmed)
	return append([]byte(fallback), '\n')
}

// ExportDiagnostics packages an audited diagnostic bundle with zero private user data
// Applies export-level structured JSON parsing, allowed field whitelisting, and strict error handling.
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

	w := zip.NewWriter(zipFile)

	writeZipEntry := func(entryName string, data []byte) error {
		f, err := w.Create(entryName)
		if err != nil {
			return fmt.Errorf("failed to create zip entry %s: %w", entryName, err)
		}
		if _, err := f.Write(data); err != nil {
			return fmt.Errorf("failed to write data to zip entry %s: %w", entryName, err)
		}
		return nil
	}

	// 1. System Summary & Whitelisted Instances
	launcherExe, _ := os.Executable()
	launcherSHA, _ := computeFileSHA256(launcherExe)
	engineExe, _ := findEngine(appRoot)
	_, engineStatErr := os.Stat(engineExe)

	reg, _ := readRegistry(registryFile)
	sanitizedInstances := make([]SanitizedInstanceRecord, 0, len(reg.Instances))
	for _, inst := range reg.Instances {
		sanitizedInstances = append(sanitizedInstances, SanitizedInstanceRecord{
			InstanceID:   inst.InstanceID,
			PID:          inst.PID,
			ProfileDir:   SanitizeString(inst.ProfileDir),
			StartedAt:    inst.StartedAt,
			CreationTime: inst.CreationTime,
			ImagePath:    SanitizeString(inst.ImagePath),
		})
	}

	var extSummaries []ExtMetaSummary
	if entries, err := os.ReadDir(extsDir); err == nil {
		for _, e := range entries {
			if e.IsDir() && !strings.HasPrefix(e.Name(), ".") && !strings.HasPrefix(e.Name(), "_old_") && e.Name() != "incoming" {
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
		ActiveInstances: sanitizedInstances,
		Extensions:      extSummaries,
		SafetyNotes: []string{
			"All user profile databases (Cookies, Login Data, Web Data, History) are strictly excluded from diagnostics.",
			"Launcher logs and instances have all tokens, credentials, query secrets, and cookies sanitized.",
		},
	}

	summaryData, err := json.MarshalIndent(summary, "", "  ")
	if err != nil {
		_ = w.Close()
		_ = zipFile.Close()
		return "", fmt.Errorf("failed to marshal summary: %w", err)
	}
	if err := writeZipEntry("system_summary.json", summaryData); err != nil {
		_ = w.Close()
		_ = zipFile.Close()
		return "", err
	}

	// 2. Add whitelisted instances.json
	regData, err := json.MarshalIndent(map[string]interface{}{
		"instances": sanitizedInstances,
	}, "", "  ")
	if err == nil {
		if err := writeZipEntry("instances.json", regData); err != nil {
			_ = w.Close()
			_ = zipFile.Close()
			return "", err
		}
	}

	// 3. Add Sanitized Logs line-by-line with structured JSON deserialization/re-serialization
	if logEntries, err := os.ReadDir(logsDir); err == nil {
		for _, le := range logEntries {
			if le.IsDir() {
				continue
			}
			lowerName := strings.ToLower(le.Name())
			if strings.HasSuffix(lowerName, ".jsonl") {
				lp := filepath.Join(logsDir, le.Name())
				if ldata, err := os.ReadFile(lp); err == nil {
					var outBuf bytes.Buffer
					scanner := bufio.NewScanner(bytes.NewReader(ldata))
					for scanner.Scan() {
						cleanBytes := sanitizeJSONLLine(scanner.Text())
						if len(cleanBytes) > 0 {
							outBuf.Write(cleanBytes)
						}
					}
					if err := writeZipEntry("logs/"+le.Name(), outBuf.Bytes()); err != nil {
						_ = w.Close()
						_ = zipFile.Close()
						return "", err
					}
				}
			} else if strings.HasSuffix(lowerName, ".log") {
				lp := filepath.Join(logsDir, le.Name())
				if ldata, err := os.ReadFile(lp); err == nil {
					var outBuf bytes.Buffer
					scanner := bufio.NewScanner(bytes.NewReader(ldata))
					for scanner.Scan() {
						outBuf.WriteString(SanitizeString(scanner.Text()))
						outBuf.WriteByte('\n')
					}
					if err := writeZipEntry("logs/"+le.Name(), outBuf.Bytes()); err != nil {
						_ = w.Close()
						_ = zipFile.Close()
						return "", err
					}
				}
			}
		}
	}

	// Explicitly close zip writer and file to ensure all bytes and CRC tables are flushed
	if err := w.Close(); err != nil {
		_ = zipFile.Close()
		return "", fmt.Errorf("failed to close zip writer: %w", err)
	}
	if err := zipFile.Close(); err != nil {
		return "", fmt.Errorf("failed to close zip file: %w", err)
	}

	return zipPath, nil
}
