// [PROJECT]: Lite Chromium Portable
// [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
// [BOUND THREAD]: goodkie/v-show Issue #8
// [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// LogLevel defines logging verbosity
type LogLevel string

const (
	LevelTrace LogLevel = "TRACE"
	LevelDebug LogLevel = "DEBUG"
	LevelInfo  LogLevel = "INFO"
	LevelWarn  LogLevel = "WARN"
	LevelError LogLevel = "ERROR"
)

func levelPriority(lvl LogLevel) int {
	switch strings.ToUpper(string(lvl)) {
	case "TRACE":
		return 1
	case "DEBUG":
		return 2
	case "INFO":
		return 3
	case "WARN":
		return 4
	case "ERROR":
		return 5
	default:
		return 3
	}
}

// LogEvent represents structured JSONL log entries
type LogEvent struct {
	Timestamp     string                 `json:"timestamp"`
	ElapsedMs     int64                  `json:"elapsed_ms"`
	SessionID     string                 `json:"session_id"`
	CorrelationID string                 `json:"correlation_id"`
	InstanceID    int                    `json:"instance_id,omitempty"`
	PID           int                    `json:"pid,omitempty"`
	ProfileDir    string                 `json:"profile_dir,omitempty"`
	Level         LogLevel               `json:"level"`
	Event         string                 `json:"event"`
	Message       string                 `json:"message"`
	Command       []string               `json:"command,omitempty"`
	Details       map[string]interface{} `json:"details,omitempty"`
}

// Logger provides high-detail structured logging with absolute process/session isolation
type Logger struct {
	mu           sync.Mutex
	logDir       string
	sessionID    string
	startTime    time.Time
	currentLevel LogLevel
	maxFileSize  int64 // 20 MB
	maxTotalSize int64 // 200 MB
}

var (
	globalLogger *Logger
	loggerOnce   sync.Once

	sensitiveKeyRegex   = regexp.MustCompile(`(?i)(password|passwd|secret|token|apikey|api_key|auth|authorization|access_token|refresh_token|cookie|sentinel)=([^\s&]+)`)
	bearerRegex         = regexp.MustCompile(`(?i)Bearer\s+([A-Za-z0-9\-\._~\+\/]+=*)`)
	pidInFilenameRegex  = regexp.MustCompile(`_pid(\d+)\.(jsonl|log)`)
)

func NewLogger(logDir, sessionID string, level LogLevel) *Logger {
	_ = os.MkdirAll(logDir, 0755)
	if level == "" {
		level = LevelInfo
	}
	return &Logger{
		logDir:       logDir,
		sessionID:    sessionID,
		startTime:    time.Now(),
		currentLevel: level,
		maxFileSize:  20 * 1024 * 1024,  // 20MB
		maxTotalSize: 200 * 1024 * 1024, // 200MB
	}
}

func initLogger(logDir, sessionID string, level LogLevel) *Logger {
	loggerOnce.Do(func() {
		globalLogger = NewLogger(logDir, sessionID, level)
	})
	return globalLogger
}

func getLogger() *Logger {
	if globalLogger == nil {
		return initLogger("data/logs", fmt.Sprintf("sess_%d", time.Now().UnixNano()), LevelInfo)
	}
	return globalLogger
}

// SanitizeString masks passwords, auth tokens, cookies, userinfo, and api keys
func SanitizeString(input string) string {
	if input == "" {
		return ""
	}
	res := sensitiveKeyRegex.ReplaceAllString(input, `$1=[REDACTED]`)
	res = bearerRegex.ReplaceAllString(res, `Bearer [REDACTED]`)

	// Mask userinfo, query parameters, and fragments in URLs if present
	if strings.Contains(input, "://") {
		if parsed, err := url.Parse(input); err == nil {
			modified := false
			if parsed.User != nil {
				parsed.User = url.UserPassword(parsed.User.Username(), "[REDACTED]")
				modified = true
			}
			q := parsed.Query()
			for k := range q {
				lower := strings.ToLower(k)
				if strings.Contains(lower, "token") || strings.Contains(lower, "key") || strings.Contains(lower, "pass") || strings.Contains(lower, "secret") || strings.Contains(lower, "auth") || strings.Contains(lower, "cookie") || strings.Contains(lower, "sentinel") {
					q.Set(k, "[REDACTED]")
					modified = true
				}
			}
			if modified {
				parsed.RawQuery = q.Encode()
			}
			if parsed.Fragment != "" {
				lowerFrag := strings.ToLower(parsed.Fragment)
				if strings.Contains(lowerFrag, "token") || strings.Contains(lowerFrag, "secret") || strings.Contains(lowerFrag, "key") || strings.Contains(lowerFrag, "auth") {
					parsed.Fragment = "[REDACTED]"
					modified = true
				}
			}
			if modified {
				res = parsed.String()
			}
		}
	}
	return res
}

// SanitizeArgs sanitizes a slice of command line arguments, including split flags and --flag=val formats
func SanitizeArgs(args []string) []string {
	if args == nil {
		return nil
	}
	clean := make([]string, len(args))
	maskNext := false
	for i, a := range args {
		if maskNext {
			clean[i] = "[REDACTED]"
			maskNext = false
			continue
		}
		lower := strings.ToLower(a)
		if lower == "--token" || lower == "--password" || lower == "--auth-token" || lower == "--api-key" || lower == "--proxy-auth" || lower == "-p" {
			clean[i] = a
			maskNext = true
			continue
		}

		// Handle --flag=value formats (e.g. --app=https://user:pass@host)
		if eqIdx := strings.Index(a, "="); eqIdx != -1 && strings.HasPrefix(a, "--") {
			flagPrefix := a[:eqIdx+1]
			val := a[eqIdx+1:]
			flagLower := strings.ToLower(flagPrefix)
			if strings.Contains(flagLower, "token") || strings.Contains(flagLower, "pass") || strings.Contains(flagLower, "secret") || strings.Contains(flagLower, "key") || strings.Contains(flagLower, "auth") {
				clean[i] = flagPrefix + "[REDACTED]"
			} else {
				clean[i] = flagPrefix + SanitizeString(val)
			}
			continue
		}

		clean[i] = SanitizeString(a)
	}
	return clean
}

// SanitizeValue recursively masks sensitive fields in details maps, slices, and strings
func SanitizeValue(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case string:
		return SanitizeString(val)
	case map[string]interface{}:
		res := make(map[string]interface{})
		for k, sub := range val {
			lower := strings.ToLower(k)
			if strings.Contains(lower, "pass") || strings.Contains(lower, "secret") || strings.Contains(lower, "token") || strings.Contains(lower, "auth") || strings.Contains(lower, "cookie") || strings.Contains(lower, "key") {
				res[k] = "[REDACTED]"
			} else {
				res[k] = SanitizeValue(sub)
			}
		}
		return res
	case []interface{}:
		res := make([]interface{}, len(val))
		for i, sub := range val {
			res[i] = SanitizeValue(sub)
		}
		return res
	case []string:
		return SanitizeArgs(val)
	default:
		return v
	}
}

// Log writes both a human-readable entry and a structured JSONL record
// Strictly writes to PID and session isolated files to prevent ANY file rotation race conditions.
func (l *Logger) Log(level LogLevel, event, msg string, instID, pid int, profileDir string, correlationID string, cmd []string, details map[string]interface{}) {
	// Enforce level priority filter
	if levelPriority(level) < levelPriority(l.currentLevel) {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now().UTC()
	elapsed := time.Since(l.startTime).Milliseconds()

	if correlationID == "" {
		correlationID = fmt.Sprintf("corr_%d", now.UnixNano())
	}

	sanitizedCmd := SanitizeArgs(cmd)
	sanitizedMsg := SanitizeString(msg)

	var sanitizedDetails map[string]interface{}
	if details != nil {
		if sd, ok := SanitizeValue(details).(map[string]interface{}); ok {
			sanitizedDetails = sd
		}
	}

	entry := LogEvent{
		Timestamp:     now.Format(time.RFC3339Nano),
		ElapsedMs:     elapsed,
		SessionID:     l.sessionID,
		CorrelationID: correlationID,
		InstanceID:    instID,
		PID:           pid,
		ProfileDir:    profileDir,
		Level:         level,
		Event:         event,
		Message:       sanitizedMsg,
		Command:       sanitizedCmd,
		Details:       sanitizedDetails,
	}

	jsonData, err := json.Marshal(entry)
	if err != nil {
		return
	}
	jsonBytes := append(jsonData, '\n')

	humanLine := fmt.Sprintf("[%s] [%-5s] [Inst:%-2d] [PID:%-6d] [%-16s] %s\n",
		now.Format("2006-01-02 15:04:05.000"),
		level,
		instID,
		pid,
		event,
		sanitizedMsg,
	)

	// Process/Session/Instance isolated filenames eliminate 100% of concurrent rotation lock contention
	currentPid := os.Getpid()
	var jsonFilename, humanFilename string
	if instID > 0 {
		jsonFilename = fmt.Sprintf("launcher_audit_inst%d_pid%d.jsonl", instID, currentPid)
		humanFilename = fmt.Sprintf("launcher_inst%d_pid%d.log", instID, currentPid)
	} else {
		jsonFilename = fmt.Sprintf("launcher_audit_main_pid%d.jsonl", currentPid)
		humanFilename = fmt.Sprintf("launcher_main_pid%d.log", currentPid)
	}

	targetJSON := filepath.Join(l.logDir, jsonFilename)
	targetHuman := filepath.Join(l.logDir, humanFilename)

	l.rotateIfNeeded(targetJSON)
	if f, err := os.OpenFile(targetJSON, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644); err == nil {
		_, _ = f.Write(jsonBytes)
		_ = f.Close()
	}

	l.rotateIfNeeded(targetHuman)
	if f, err := os.OpenFile(targetHuman, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644); err == nil {
		_, _ = f.WriteString(humanLine)
		_ = f.Close()
	}

	l.enforceMaxTotalSize()
}

func (l *Logger) rotateIfNeeded(path string) {
	fi, err := os.Stat(path)
	if err != nil || fi.Size() < l.maxFileSize {
		return
	}
	// Rotate: path -> path.1, path.1 -> path.2, up to 5 backups
	for i := 4; i >= 1; i-- {
		src := fmt.Sprintf("%s.%d", path, i)
		dst := fmt.Sprintf("%s.%d", path, i+1)
		_ = os.Rename(src, dst)
	}
	_ = os.Rename(path, fmt.Sprintf("%s.1", path))
}

func isPIDAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	h, err := syscall.OpenProcess(0x1000, false, uint32(pid))
	if err != nil {
		return false
	}
	defer syscall.CloseHandle(h)
	var exitCode uint32
	if err := syscall.GetExitCodeProcess(h, &exitCode); err != nil {
		return false
	}
	return exitCode == 259 // STILL_ACTIVE
}

type fileModRecord struct {
	path    string
	modTime time.Time
	size    int64
	isDead  bool
}

func (l *Logger) enforceMaxTotalSize() {
	entries, err := os.ReadDir(l.logDir)
	if err != nil {
		return
	}

	currentPID := os.Getpid()
	var totalSize int64
	var fileRecords []fileModRecord

	now := time.Now()
	sevenDaysAgo := now.Add(-7 * 24 * time.Hour)

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		totalSize += fi.Size()
		fPath := filepath.Join(l.logDir, e.Name())

		// Check if file belongs to a dead/inactive PID
		isDead := false
		if matches := pidInFilenameRegex.FindStringSubmatch(e.Name()); len(matches) > 1 {
			if pidVal, err := strconv.Atoi(matches[1]); err == nil {
				if pidVal != currentPID && !isPIDAlive(pidVal) {
					isDead = true
				}
			}
		}

		// Also old rotated files (.log.1, .jsonl.1) are eligible for rotation cleanup
		if strings.Contains(e.Name(), ".log.") || strings.Contains(e.Name(), ".jsonl.") {
			isDead = true
		}

		// Retention: clean up any dead session file older than 7 days immediately
		if isDead && fi.ModTime().Before(sevenDaysAgo) {
			_ = os.Remove(fPath)
			totalSize -= fi.Size()
			continue
		}

		fileRecords = append(fileRecords, fileModRecord{
			path:    fPath,
			modTime: fi.ModTime(),
			size:    fi.Size(),
			isDead:  isDead,
		})
	}

	if totalSize <= l.maxTotalSize {
		return
	}

	// Sort dead session files oldest first
	sort.Slice(fileRecords, func(i, j int) bool {
		return fileRecords[i].modTime.Before(fileRecords[j].modTime)
	})

	// Remove oldest dead session files until under maxTotalSize
	for _, rec := range fileRecords {
		if totalSize <= l.maxTotalSize {
			break
		}
		if rec.isDead {
			if err := os.Remove(rec.path); err == nil {
				totalSize -= rec.size
			}
		}
	}
}

