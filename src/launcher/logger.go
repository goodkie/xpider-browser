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
	"strings"
	"sync"
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

// Logger provides high-detail structured and rotated logging
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

	sensitiveKeyRegex = regexp.MustCompile(`(?i)(password|passwd|secret|token|apikey|api_key|auth|authorization|access_token|refresh_token|cookie|sentinel)=([^\s&]+)`)
	bearerRegex       = regexp.MustCompile(`(?i)Bearer\s+([A-Za-z0-9\-\._~\+\/]+=*)`)
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

// SanitizeString masks passwords, auth tokens, cookies, and api keys
func SanitizeString(input string) string {
	res := sensitiveKeyRegex.ReplaceAllString(input, `$1=[REDACTED]`)
	res = bearerRegex.ReplaceAllString(res, `Bearer [REDACTED]`)

	// Mask query parameters in URLs if present
	if strings.HasPrefix(input, "http://") || strings.HasPrefix(input, "https://") {
		if parsed, err := url.Parse(input); err == nil {
			q := parsed.Query()
			modified := false
			for k := range q {
				lower := strings.ToLower(k)
				if strings.Contains(lower, "token") || strings.Contains(lower, "key") || strings.Contains(lower, "pass") || strings.Contains(lower, "secret") || strings.Contains(lower, "auth") || strings.Contains(lower, "cookie") {
					q.Set(k, "[REDACTED]")
					modified = true
				}
			}
			if modified {
				parsed.RawQuery = q.Encode()
				return parsed.String()
			}
		}
	}
	return res
}

// SanitizeArgs sanitizes a slice of command line arguments
func SanitizeArgs(args []string) []string {
	clean := make([]string, len(args))
	for i, a := range args {
		clean[i] = SanitizeString(a)
	}
	return clean
}

// Log writes both a human-readable entry and a structured JSONL record
func (l *Logger) Log(level LogLevel, event, msg string, instID, pid int, profileDir string, correlationID string, cmd []string, details map[string]interface{}) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now().UTC()
	elapsed := time.Since(l.startTime).Milliseconds()

	if correlationID == "" {
		correlationID = fmt.Sprintf("corr_%d", now.UnixNano())
	}

	sanitizedCmd := SanitizeArgs(cmd)
	sanitizedMsg := SanitizeString(msg)

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
		Details:       details,
	}

	// 1. Write structured JSONL
	jsonPath := filepath.Join(l.logDir, "launcher_audit.jsonl")
	l.rotateIfNeeded(jsonPath)
	if jsonData, err := json.Marshal(entry); err == nil {
		if f, err := os.OpenFile(jsonPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644); err == nil {
			_, _ = f.Write(append(jsonData, '\n'))
			_ = f.Close()
		}
	}

	// 2. Write Human-readable log
	humanPath := filepath.Join(l.logDir, "launcher.log")
	l.rotateIfNeeded(humanPath)
	humanLine := fmt.Sprintf("[%s] [%-5s] [Inst:%-2d] [PID:%-6d] [%-16s] %s\n",
		now.Format("2006-01-02 15:04:05.000"),
		level,
		instID,
		pid,
		event,
		sanitizedMsg,
	)
	if f, err := os.OpenFile(humanPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644); err == nil {
		_, _ = f.WriteString(humanLine)
		_ = f.Close()
	}

	// Clean older rotated logs if total size exceeds limit
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

func (l *Logger) enforceMaxTotalSize() {
	entries, err := os.ReadDir(l.logDir)
	if err != nil {
		return
	}
	var totalSize int64
	for _, e := range entries {
		if fi, err := e.Info(); err == nil {
			totalSize += fi.Size()
		}
	}
	if totalSize <= l.maxTotalSize {
		return
	}
	// Remove oldest rotated files (.5, .4, etc.)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".log.") || strings.Contains(e.Name(), ".jsonl.") {
			_ = os.Remove(filepath.Join(l.logDir, e.Name()))
		}
	}
}
