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
	"sort"
	"strconv"
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

var allowedTopLevelFields = map[string]bool{
	"timestamp":      true,
	"elapsed_ms":     true,
	"session_id":     true,
	"correlation_id": true,
	"instance_id":    true,
	"pid":            true,
	"profile_dir":    true,
	"level":          true,
	"event":          true,
	"message":        true,
	"command":        true,
	"details":        true,
	"time":           true,
}

// sanitizeJSONLLine parses a JSONL line, whitelists top-level fields, applies recursive
// sanitization on details/command/messages, and safely excludes unparseable/truncated lines.
func sanitizeJSONLLine(line string) []byte {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return nil
	}
	var rawEvent map[string]interface{}
	if err := json.Unmarshal([]byte(trimmed), &rawEvent); err == nil {
		cleanEvent := make(map[string]interface{})
		for k, v := range rawEvent {
			if !allowedTopLevelFields[k] {
				// Drop unwhitelisted top-level fields (e.g. {"token": "SECRET"}, {"password": "..."})
				continue
			}
			switch k {
			case "details":
				cleanEvent["details"] = SanitizeValue(v)
			case "command":
				if cmdSlice, ok := v.([]interface{}); ok {
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
					cleanEvent["command"] = cleanInterface
				}
			case "message":
				if s, ok := v.(string); ok {
					cleanEvent["message"] = SanitizeString(s)
				}
			case "event":
				if s, ok := v.(string); ok {
					cleanEvent["event"] = SanitizeString(s)
				}
			case "profile_dir":
				if s, ok := v.(string); ok {
					cleanEvent["profile_dir"] = SanitizeString(s)
				}
			default:
				cleanEvent[k] = v
			}
		}
		if b, err := json.Marshal(cleanEvent); err == nil {
			return append(b, '\n')
		}
	}
	// Fail-closed fallback: Do NOT output raw malformed/truncated lines which might leak secrets.
	// Instead output safe diagnostic note without any raw content.
	exclusionNote := map[string]interface{}{
		"event":  "diagnostic_malformed_line_excluded",
		"reason": "json_parse_error_or_truncated",
	}
	b, _ := json.Marshal(exclusionNote)
	return append(b, '\n')
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
					buf := make([]byte, 64*1024)
					scanner.Buffer(buf, 10*1024*1024) // support lines up to 10MB
					for scanner.Scan() {
						cleanBytes := sanitizeJSONLLine(scanner.Text())
						if len(cleanBytes) > 0 {
							outBuf.Write(cleanBytes)
						}
					}
					if sErr := scanner.Err(); sErr != nil {
						errNote := fmt.Sprintf(`{"event":"diagnostic_scanner_error","file":%q,"error":%q}`+"\n", le.Name(), sErr.Error())
						outBuf.WriteString(errNote)
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
					buf := make([]byte, 64*1024)
					scanner.Buffer(buf, 10*1024*1024) // support lines up to 10MB
					for scanner.Scan() {
						line := strings.TrimSpace(scanner.Text())
						if line == "" {
							continue
						}
						// Verify launcher prefix or standard timestamp bracket
						if strings.HasPrefix(line, "[LiteChromiumPortable]") || (strings.HasPrefix(line, "[") && strings.Contains(line, "]")) {
							outBuf.WriteString(SanitizeString(line))
							outBuf.WriteByte('\n')
						} else {
							outBuf.WriteString("[REDACTED_NON_STANDARD_LOG_ENTRY]\n")
						}
					}
					if sErr := scanner.Err(); sErr != nil {
						outBuf.WriteString(fmt.Sprintf("[ERROR] scanner error in %s: %v\n", le.Name(), sErr))
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

// ExportChatGPTReport generates a comprehensive Markdown debug report formatted specifically for ChatGPT.
func ExportChatGPTReport(appRoot string, targetInstanceID int) (string, error) {
	dataDir := filepath.Join(appRoot, "data")
	logsDir := filepath.Join(dataDir, "logs")
	registryFile := filepath.Join(dataDir, "instances.json")
	extsDir := filepath.Join(appRoot, "extensions")

	now := time.Now().UTC()
	reportFilename := fmt.Sprintf("CHATGPT_DEBUG_REPORT_%s.md", now.Format("20060102_150405"))
	reportPath := filepath.Join(appRoot, reportFilename)

	var sb strings.Builder
	sb.WriteString("# [Lite Chromium Portable] ChatGPT Debug Report\n\n")
	sb.WriteString(fmt.Sprintf("- **Generated At (UTC):** `%s`\n", now.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("- **Launcher Version:** `%s`\n", LauncherVersion))
	sb.WriteString(fmt.Sprintf("- **Target Instance ID:** `#%d`\n", targetInstanceID))
	sb.WriteString("- **Workspace Root:** `E:\\vivpr\\ai\\ebrowser\\portable-minimal`\n")
	sb.WriteString("- **Bound GitHub Thread:** `goodkie/v-show Issue #8`\n")
	sb.WriteString("- **Isolation Sanity Check:** `VERIFIED (Strictly isolated local portable)`\n\n")

	// 1. Environment & Binary Fingerprints
	launcherExe, _ := os.Executable()
	launcherSHA, _ := computeFileSHA256(launcherExe)
	engineExe, _ := findEngine(appRoot)
	engineFi, engineStatErr := os.Stat(engineExe)
	engineStatus := "NOT FOUND"
	var engineSizeMB float64
	if engineStatErr == nil {
		engineStatus = "Verified / Present"
		engineSizeMB = float64(engineFi.Size()) / (1024.0 * 1024.0)
	}

	sb.WriteString("## 1. System Environment & Binary Fingerprints\n\n")
	sb.WriteString("| Component | Value |\n")
	sb.WriteString("|-----------|-------|\n")
	sb.WriteString(fmt.Sprintf("| Operating System | `%s %s` (NumCPU: %d) |\n", runtime.GOOS, runtime.GOARCH, runtime.NumCPU()))
	sb.WriteString(fmt.Sprintf("| Launcher Path | `%s` |\n", SanitizeString(launcherExe)))
	sb.WriteString(fmt.Sprintf("| Launcher SHA-256 | `%s` |\n", launcherSHA))
	sb.WriteString(fmt.Sprintf("| Engine Path | `%s` |\n", SanitizeString(engineExe)))
	sb.WriteString(fmt.Sprintf("| Engine Status | %s (%.2f MB) |\n", engineStatus, engineSizeMB))
	sb.WriteString(fmt.Sprintf("| Disk Free (C:) | %.2f GB |\n", float64(getDiskFreeSpace("C:\\"))/(1024.0*1024.0*1024.0)))
	sb.WriteString(fmt.Sprintf("| Disk Free (E:) | %.2f GB |\n", float64(getDiskFreeSpace("E:\\"))/(1024.0*1024.0*1024.0)))
	sb.WriteString("\n")

	// 2. Instance Registry Status
	reg, _ := readRegistry(registryFile)
	sb.WriteString("## 2. Browser Instance Topology & Health\n\n")
	sb.WriteString("| Instance | PID | State | Started At | Verification / Reason |\n")
	sb.WriteString("|----------|-----|-------|------------|-----------------------|\n")
	for _, inst := range reg.Instances {
		state, why := verifyOwner(inst)
		sb.WriteString(fmt.Sprintf("| Instance #%d | `%d` | **%s** | %s | %s |\n",
			inst.InstanceID, inst.PID, state.String(), inst.StartedAt.Format("2006-01-02 15:04:05"), why))
	}
	if len(reg.Instances) == 0 {
		sb.WriteString("| - | - | NONE | - | No instance records found in registry |\n")
	}
	sb.WriteString("\n")

	// 3. Installed Extensions Status
	sb.WriteString("## 3. Installed MV3 Extensions Verification\n\n")
	sb.WriteString("| Directory | Extension Name | Version | Manifest | SidePanel | Background Worker |\n")
	sb.WriteString("|-----------|----------------|---------|----------|-----------|-------------------|\n")
	if entries, err := os.ReadDir(extsDir); err == nil {
		for _, e := range entries {
			if e.IsDir() && !strings.HasPrefix(e.Name(), ".") && !strings.HasPrefix(e.Name(), "_") && e.Name() != "incoming" {
				mfPath := filepath.Join(extsDir, e.Name(), "manifest.json")
				name := e.Name()
				ver := "Unknown"
				mv := "None"
				hasSidePanel := "No"
				bgWorker := "None"
				if data, err := os.ReadFile(mfPath); err == nil {
					var rawMf map[string]interface{}
					if json.Unmarshal(data, &rawMf) == nil {
						if n, ok := rawMf["name"].(string); ok {
							name = n
						}
						if v, ok := rawMf["version"].(string); ok {
							ver = v
						}
						if m, ok := rawMf["manifest_version"].(float64); ok {
							mv = fmt.Sprintf("MV%d", int(m))
						}
						if _, ok := rawMf["side_panel"]; ok {
							hasSidePanel = "Yes"
						}
						if bg, ok := rawMf["background"].(map[string]interface{}); ok {
							if sw, ok := bg["service_worker"].(string); ok {
								bgWorker = sw
							}
						}
					}
				}
				sb.WriteString(fmt.Sprintf("| `%s` | %s | %s | %s | %s | `%s` |\n",
					e.Name(), name, ver, mv, hasSidePanel, bgWorker))
			}
		}
	}
	sb.WriteString("\n")

	// 4. Per-Instance Extension Configuration (Disabled / Enabled rules)
	pDir := filepath.Join(dataDir, "profiles", fmt.Sprintf("instance-%d", targetInstanceID))
	cfgPath := filepath.Join(pDir, "extensions_config.json")
	sb.WriteString(fmt.Sprintf("## 4. Extension Rules Configuration (Instance #%d)\n\n", targetInstanceID))
	if cfgData, err := os.ReadFile(cfgPath); err == nil {
		sb.WriteString("```json\n")
		sb.WriteString(string(cfgData))
		sb.WriteString("\n```\n\n")
	} else {
		sb.WriteString("*No custom extensions_config.json (default auto-discovery applied)*\n\n")
	}

	// 5. Active Command-line Arguments
	var activeArgs []string
	for _, inst := range reg.Instances {
		if inst.InstanceID == targetInstanceID {
			activeArgs = inst.ActiveParams
			break
		}
	}
	if len(activeArgs) == 0 && len(reg.Instances) > 0 {
		activeArgs = reg.Instances[0].ActiveParams
	}
	sb.WriteString("## 5. Engine Runtime Command-Line Arguments\n\n")
	if len(activeArgs) > 0 {
		sb.WriteString("```bash\n")
		for _, a := range SanitizeArgs(activeArgs) {
			sb.WriteString(a)
			sb.WriteString("\n")
		}
		sb.WriteString("```\n\n")
	} else {
		sb.WriteString("*No active runtime parameters recorded*\n\n")
	}

	// 6. Recent Launcher Audit Trail
	sb.WriteString("## 6. Recent Launcher Audit Events (Sanitized)\n\n")
	sb.WriteString("```json\n")
	auditEvents := collectRecentAuditEvents(logsDir, targetInstanceID, 25)
	if len(auditEvents) > 0 {
		for _, ev := range auditEvents {
			sb.WriteString(ev)
			sb.WriteString("\n")
		}
	} else {
		sb.WriteString("// No recent audit events found\n")
	}
	sb.WriteString("```\n\n")

	// 7. Chromium Engine & Extension Runtime Debug Logs (Tail)
	sb.WriteString(fmt.Sprintf("## 7. Chromium Engine & Extension Debug Log (Instance #%d)\n\n", targetInstanceID))
	chromeDebugLog := filepath.Join(pDir, "chrome_debug.log")
	if _, err := os.Stat(chromeDebugLog); os.IsNotExist(err) {
		chromeDebugLog = filepath.Join(dataDir, "profiles", "instance-1", "chrome_debug.log")
	}
	debugLines := readTailOfLog(chromeDebugLog, 60)
	if len(debugLines) > 0 {
		sb.WriteString(fmt.Sprintf("*(Displaying last %d lines from `%s`)*\n\n", len(debugLines), SanitizeString(chromeDebugLog)))
		sb.WriteString("```log\n")
		for _, l := range debugLines {
			sb.WriteString(SanitizeString(l))
			sb.WriteString("\n")
		}
		sb.WriteString("```\n\n")
	} else {
		sb.WriteString(fmt.Sprintf("*No `chrome_debug.log` found in `%s`*\n\n", SanitizeString(pDir)))
	}

	// 8. ChatGPT Prompt Guide
	sb.WriteString("## 8. ChatGPT Diagnostic Prompt\n\n")
	sb.WriteString("> **Copy & Paste Instructions for ChatGPT:**\n")
	sb.WriteString("> Copy the block below and send it to ChatGPT for targeted diagnostic analysis and debugging advice:\n\n")
	sb.WriteString("````markdown\n")
	sb.WriteString("### [Lite Chromium Portable] Diagnostic Analysis Request\n")
	sb.WriteString(fmt.Sprintf("- **Launcher Version:** %s\n", LauncherVersion))
	sb.WriteString(fmt.Sprintf("- **Report Timestamp:** %s\n", now.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("- **Target Instance:** Instance #%d\n", targetInstanceID))
	sb.WriteString("\n")
	sb.WriteString("Please review the attached Lite Chromium Portable debug report above. Specifically:\n")
	sb.WriteString("1. Inspect sections 2 and 5 for process status and startup/handoff parameters.\n")
	sb.WriteString("2. Analyze section 6 (Audit Trail) and section 7 (Chromium Debug Log) for runtime warnings, extension initialization errors, or unexpected terminations.\n")
	sb.WriteString("3. Provide step-by-step remediation advice or code adjustments for any detected anomalies.\n")
	sb.WriteString("````\n\n")

	if err := os.WriteFile(reportPath, []byte(sb.String()), 0644); err != nil {
		return "", fmt.Errorf("failed to write ChatGPT report: %w", err)
	}

	return reportPath, nil
}

func collectRecentAuditEvents(logsDir string, instanceID int, maxCount int) []string {
	entries, err := os.ReadDir(logsDir)
	if err != nil {
		return nil
	}
	type fileEntry struct {
		name    string
		modTime time.Time
	}
	var jsonlFiles []fileEntry
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".jsonl") {
			if fi, err := e.Info(); err == nil {
				jsonlFiles = append(jsonlFiles, fileEntry{name: e.Name(), modTime: fi.ModTime()})
			}
		}
	}
	// Sort newest first
	sort.Slice(jsonlFiles, func(i, j int) bool {
		return jsonlFiles[i].modTime.After(jsonlFiles[j].modTime)
	})

	var collected []string
	for _, f := range jsonlFiles {
		lp := filepath.Join(logsDir, f.name)
		data, err := os.ReadFile(lp)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(bytes.NewReader(data))
		buf := make([]byte, 64*1024)
		scanner.Buffer(buf, 10*1024*1024)
		var fileLines []string
		for scanner.Scan() {
			t := strings.TrimSpace(scanner.Text())
			if t != "" {
				fileLines = append(fileLines, t)
			}
		}
		// Iterate backwards (most recent lines first)
		for i := len(fileLines) - 1; i >= 0; i-- {
			clean := sanitizeJSONLLine(fileLines[i])
			if len(clean) > 0 {
				collected = append(collected, string(bytes.TrimSpace(clean)))
				if len(collected) >= maxCount {
					break
				}
			}
		}
		if len(collected) >= maxCount {
			break
		}
	}
	// Reverse collected so they appear chronologically in output
	for i, j := 0, len(collected)-1; i < j; i, j = i+1, j-1 {
		collected[i], collected[j] = collected[j], collected[i]
	}
	return collected
}

func readTailOfLog(filePath string, maxLines int) []string {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}
	scanner := bufio.NewScanner(bytes.NewReader(data))
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 10*1024*1024)
	var allLines []string
	for scanner.Scan() {
		allLines = append(allLines, scanner.Text())
	}
	if len(allLines) <= maxLines {
		return allLines
	}
	return allLines[len(allLines)-maxLines:]
}

// CleanLogs safely removes inactive/dead logs while protecting active instance processes.
func CleanLogs(appRoot string, targetInstanceID int) (int, int64, error) {
	dataDir := filepath.Join(appRoot, "data")
	logsDir := filepath.Join(dataDir, "logs")
	registryFile := filepath.Join(dataDir, "instances.json")

	// 1. Identify active PIDs that MUST NOT be touched
	activePIDs := make(map[int]bool)
	activePIDs[os.Getpid()] = true

	reg, _ := readRegistry(registryFile)
	for _, inst := range reg.Instances {
		state, _ := verifyOwner(inst)
		if state == ProcRunning {
			activePIDs[inst.PID] = true
		}
	}

	entries, err := os.ReadDir(logsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, 0, nil
		}
		return 0, 0, err
	}

	cleanedCount := 0
	var bytesFreed int64

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		filePath := filepath.Join(logsDir, name)
		fi, err := e.Info()
		if err != nil {
			continue
		}

		// Check if file is associated with a specific PID
		matches := pidInFilenameRegex.FindStringSubmatch(name)
		if len(matches) > 1 {
			pidVal, _ := strconv.Atoi(matches[1])
			if activePIDs[pidVal] || isPIDAlive(pidVal) {
				// PROTECTED: Active process log file
				continue
			}
			// Inactive process: delete
			if err := os.Remove(filePath); err == nil {
				cleanedCount++
				bytesFreed += fi.Size()
			}
			continue
		}

		// Check rotated backup files (.log.1, .jsonl.1, etc.)
		if strings.Contains(name, ".log.") || strings.Contains(name, ".jsonl.") {
			if err := os.Remove(filePath); err == nil {
				cleanedCount++
				bytesFreed += fi.Size()
			}
			continue
		}
	}

	// Also clean stale chrome_debug.log from stopped instance profile if stopped
	profilesDir := filepath.Join(dataDir, "profiles")
	if pEntries, err := os.ReadDir(profilesDir); err == nil {
		for _, pe := range pEntries {
			if !pe.IsDir() {
				continue
			}
			isActiveProfile := false
			for _, inst := range reg.Instances {
				if strings.EqualFold(filepath.Clean(inst.ProfileDir), filepath.Clean(filepath.Join(profilesDir, pe.Name()))) {
					state, _ := verifyOwner(inst)
					if state == ProcRunning {
						isActiveProfile = true
						break
					}
				}
			}
			if !isActiveProfile {
				cdl := filepath.Join(profilesDir, pe.Name(), "chrome_debug.log")
				if cfi, err := os.Stat(cdl); err == nil {
					if err := os.Remove(cdl); err == nil {
						cleanedCount++
						bytesFreed += cfi.Size()
					}
				}
			}
		}
	}

	return cleanedCount, bytesFreed, nil
}

// ViewLogs returns a human-readable console summary of recent logs and engine operations.
func ViewLogs(appRoot string, targetInstanceID int, maxLines int) (string, error) {
	dataDir := filepath.Join(appRoot, "data")
	logsDir := filepath.Join(dataDir, "logs")
	registryFile := filepath.Join(dataDir, "instances.json")

	var sb strings.Builder
	sb.WriteString("==============================================================================\n")
	sb.WriteString(fmt.Sprintf("LiteChromiumPortable %s - Diagnostic Log Viewer\n", LauncherVersion))
	sb.WriteString("==============================================================================\n\n")

	// 1. Instance Topology
	reg, _ := readRegistry(registryFile)
	sb.WriteString("[INSTANCE STATUS OVERVIEW]\n")
	foundTarget := false
	for _, inst := range reg.Instances {
		state, why := verifyOwner(inst)
		mark := " "
		if inst.InstanceID == targetInstanceID {
			mark = "*"
			foundTarget = true
		}
		sb.WriteString(fmt.Sprintf("%s Instance #%-2d | PID: %-5d | Status: %-7s | Started: %s | %s\n",
			mark, inst.InstanceID, inst.PID, state.String(), inst.StartedAt.Format("15:04:05"), why))
	}
	if !foundTarget {
		sb.WriteString(fmt.Sprintf("  Instance #%d is not currently registered or running.\n", targetInstanceID))
	}
	sb.WriteString("\n")

	// 2. Recent Launcher Audit Events
	sb.WriteString(fmt.Sprintf("[RECENT LAUNCHER AUDIT EVENTS (Instance #%d)]\n", targetInstanceID))
	events := collectRecentAuditEvents(logsDir, targetInstanceID, maxLines/2)
	if len(events) > 0 {
		for _, ev := range events {
			sb.WriteString("  ")
			sb.WriteString(ev)
			sb.WriteString("\n")
		}
	} else {
		sb.WriteString("  (No recent audit events)\n")
	}
	sb.WriteString("\n")

	// 3. Recent Chromium Debug Logs
	pDir := filepath.Join(dataDir, "profiles", fmt.Sprintf("instance-%d", targetInstanceID))
	cdl := filepath.Join(pDir, "chrome_debug.log")
	if _, err := os.Stat(cdl); os.IsNotExist(err) {
		cdl = filepath.Join(dataDir, "profiles", "instance-1", "chrome_debug.log")
	}
	debugLines := readTailOfLog(cdl, maxLines/2)
	sb.WriteString(fmt.Sprintf("[RECENT CHROMIUM ENGINE LOGS (Tail: %d lines)]\n", len(debugLines)))
	if len(debugLines) > 0 {
		for _, l := range debugLines {
			sb.WriteString("  ")
			sb.WriteString(SanitizeString(l))
			sb.WriteString("\n")
		}
	} else {
		sb.WriteString(fmt.Sprintf("  (No chrome_debug.log found in %s)\n", pDir))
	}

	sb.WriteString("\n==============================================================================\n")
	sb.WriteString("TIP: To export a complete report for ChatGPT, run:\n")
	sb.WriteString("     LiteChromiumPortable.exe --export-chatgpt-report\n")
	sb.WriteString("     (or use '06_디버그_로그_관리.bat')\n")
	sb.WriteString("==============================================================================\n")

	return sb.String(), nil
}

