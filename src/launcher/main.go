package main

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

// InstanceRecord tracks running browser instances
type InstanceRecord struct {
	InstanceID   int       `json:"instance_id"`
	PID          int       `json:"pid"`
	ProfileDir   string    `json:"profile_dir"`
	StartedAt    time.Time `json:"started_at"`
	Executable   string    `json:"executable"`
	ActiveParams []string  `json:"active_params"`
	// Verified process identity (see procid_windows.go); PID alone is never trusted.
	CreationTime uint64 `json:"creation_time,omitempty"`
	ImagePath    string `json:"image_path,omitempty"`
}

// InstanceRegistry maintains the active instances
type InstanceRegistry struct {
	Instances []InstanceRecord `json:"instances"`
}

// InstanceExtensionConfig defines per-instance extension configuration
type InstanceExtensionConfig struct {
	EnabledExtensions  []string `json:"enabled_extensions,omitempty"`
	DisabledExtensions []string `json:"disabled_extensions,omitempty"`
}

func main() {
	instanceFlag := flag.Int("instance", 1, "Instance number to launch (1-100)")
	batchFlag := flag.Int("batch", 0, "Batch launch multiple instances concurrently (1-20)")
	statusFlag := flag.Bool("status", false, "Display status of all active browser instances")
	cleanFlag := flag.Bool("clean-profiles", false, "Clean all instance profiles (permanently disabled)")
	urlFlag := flag.String("url", "", "Optional initial URL to navigate to")
	flag.Parse()

	// Parameter validation (R2)
	if *instanceFlag < 1 || *instanceFlag > 100 {
		fmt.Fprintf(os.Stderr, "Error: --instance must be between 1 and 100\n")
		os.Exit(1)
	}
	if *batchFlag < 0 || *batchFlag > 20 {
		fmt.Fprintf(os.Stderr, "Error: --batch must be between 1 and 20\n")
		os.Exit(1)
	}
	if *urlFlag != "" {
		trimmed := strings.TrimSpace(*urlFlag)
		if strings.HasPrefix(trimmed, "-") {
			fmt.Fprintf(os.Stderr, "Security Error: --url parameter must not begin with '-' or '--' (flag injection prevented)\n")
			os.Exit(1)
		}
		// Basic URL validation
		if !strings.HasPrefix(trimmed, "about:") && !strings.HasPrefix(trimmed, "chrome://") && !strings.HasPrefix(trimmed, "file://") {
			if _, err := url.ParseRequestURI(trimmed); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: --url does not appear to be a standard URI: %s\n", trimmed)
			}
		}
	}

	appRoot, err := getAppRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error resolving app root: %v\n", err)
		os.Exit(1)
	}

	dataDir := filepath.Join(appRoot, "data")
	profilesBase := filepath.Join(dataDir, "profiles")
	registryFile := filepath.Join(dataDir, "instances.json")
	lockFile := filepath.Join(dataDir, "instances.lock")
	extensionsDir := filepath.Join(appRoot, "extensions")

	_ = os.MkdirAll(dataDir, 0755)

	if *statusFlag {
		unknown, err := printStatus(os.Stdout, registryFile, lockFile)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Status error (state unknown): %v\n", err)
			os.Exit(1)
		}
		if unknown > 0 {
			os.Exit(2)
		}
		return
	}

	if *cleanFlag {
		fmt.Fprintf(os.Stderr, "Security Refusal: --clean-profiles is permanently disabled in this release to protect user data\n")
		os.Exit(1)
	}

	engineExe, err := findEngine(appRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Chromium engine error: %v\n", err)
		os.Exit(1)
	}

	// Prepare any zip extensions transactionally (R4). Import failures are reported; browsing continues
	// with the previous extension set (failed archives are retained for retry).
	for _, ierr := range unzipIncomingExtensions(extensionsDir) {
		fmt.Fprintf(os.Stderr, "[LiteChromiumPortable] Extension import error: %v\n", ierr)
	}

	if *batchFlag > 0 {
		fmt.Printf("[LiteChromiumPortable] Batch launching %d instances...\n", *batchFlag)
		var wg sync.WaitGroup
		var launchErrors []string
		var errMu sync.Mutex

		for i := 1; i <= *batchFlag; i++ {
			wg.Add(1)
			go func(instID int) {
				defer wg.Done()
				pDir := filepath.Join(profilesBase, fmt.Sprintf("instance-%d", instID))
				loadedExts := discoverInstanceExtensions(extensionsDir, pDir)
				err := launchInstance(engineExe, pDir, instID, loadedExts, *urlFlag, registryFile, lockFile)
				if err != nil {
					errMu.Lock()
					launchErrors = append(launchErrors, fmt.Sprintf("Instance %d: %v", instID, err))
					errMu.Unlock()
					fmt.Fprintf(os.Stderr, "Failed to launch instance %d: %v\n", instID, err)
				}
			}(i)
			time.Sleep(200 * time.Millisecond) // slight stagger for clean process creation
		}
		wg.Wait()
		if len(launchErrors) > 0 {
			fmt.Fprintf(os.Stderr, "[LiteChromiumPortable] Batch launch completed with %d errors\n", len(launchErrors))
			os.Exit(1)
		}
		fmt.Printf("[LiteChromiumPortable] Batch launch complete.\n")
		return
	}

	// Single instance launch
	pDir := filepath.Join(profilesBase, fmt.Sprintf("instance-%d", *instanceFlag))
	loadedExts := discoverInstanceExtensions(extensionsDir, pDir)
	err = launchInstance(engineExe, pDir, *instanceFlag, loadedExts, *urlFlag, registryFile, lockFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Launch failed: %v\n", err)
		os.Exit(1)
	}
}

func getAppRoot() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	realPath, err := filepath.EvalSymlinks(exe)
	if err != nil {
		realPath = exe
	}
	return filepath.Dir(realPath), nil
}

func findEngine(appRoot string) (string, error) {
	candidates := []string{
		filepath.Join(appRoot, "engine", "chrome.exe"),
		filepath.Join(appRoot, "engine", "chromium.exe"),
		filepath.Join(appRoot, "chrome-win", "chrome.exe"),
	}
	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && !fi.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("Chromium engine binary not found in %s/engine/", appRoot)
}

// discoverInstanceExtensions finds all valid extensions, strictly controlled by instance configuration (R3)
func discoverInstanceExtensions(extsDir, profileDir string) []string {
	var validExts []string
	if _, err := os.Stat(extsDir); os.IsNotExist(err) {
		_ = os.MkdirAll(extsDir, 0755)
		return validExts
	}

	var cfg InstanceExtensionConfig
	hasConfig := false
	cfgFile := filepath.Join(profileDir, "extensions_config.json")
	if data, err := os.ReadFile(cfgFile); err == nil {
		if err := json.Unmarshal(data, &cfg); err != nil {
			// Fail safely on corrupted or invalid json
			fmt.Fprintf(os.Stderr, "Security Warning: corrupted extensions_config.json in %s (loading zero extensions for safety): %v\n", profileDir, err)
			return validExts
		}
		hasConfig = true
	} else if !os.IsNotExist(err) {
		// Non-absent read failure (e.g. permission error, file lock) must NOT silently fall back to loading all extensions!
		fmt.Fprintf(os.Stderr, "Security Warning: error reading %s (loading zero extensions for safety): %v\n", cfgFile, err)
		return validExts
	}

	entries, err := os.ReadDir(extsDir)
	if err != nil {
		return validExts
	}

	disabledMap := make(map[string]bool)
	if hasConfig {
		for _, d := range cfg.DisabledExtensions {
			disabledMap[strings.ToLower(d)] = true
		}
	}

	// If explicit enabled list is provided (even if empty []), strictly enforce it
	if hasConfig && cfg.EnabledExtensions != nil {
		enabledMap := make(map[string]bool)
		for _, e := range cfg.EnabledExtensions {
			enabledMap[strings.ToLower(e)] = true
		}
		for _, entry := range entries {
			if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") && entry.Name() != "incoming" && entry.Name() != ".staging" && entry.Name() != ".backups" {
				extName := entry.Name()
				lower := strings.ToLower(extName)
				// DISABLED WINS: conflict resolution rule
				if disabledMap[lower] {
					continue
				}
				if enabledMap[lower] {
					manifestPath := filepath.Join(extsDir, extName, "manifest.json")
					if _, err := os.Stat(manifestPath); err == nil {
						validExts = append(validExts, filepath.Join(extsDir, extName))
					}
				}
			}
		}
		return validExts
	}

	for _, entry := range entries {
		if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") && entry.Name() != "incoming" && entry.Name() != ".staging" && entry.Name() != ".backups" {
			extName := entry.Name()
			if disabledMap[strings.ToLower(extName)] {
				continue
			}
			manifestPath := filepath.Join(extsDir, extName, "manifest.json")
			if _, err := os.Stat(manifestPath); err == nil {
				validExts = append(validExts, filepath.Join(extsDir, extName))
			}
		}
	}
	return validExts
}

// renameWithRetry attempts atomic directory rename with backoff retries for Windows file lock tolerance
func renameWithRetry(src, dst string) error {
	var err error
	for attempt := 0; attempt < 10; attempt++ {
		err = os.Rename(src, dst)
		if err == nil {
			return nil
		}
		time.Sleep(time.Duration(25*(attempt+1)) * time.Millisecond)
	}
	return err
}

// validateExtensionDirName rejects archive names that would collide with launcher-internal directories,
// Windows device names, or break the comma-separated --load-extension list.
func validateExtensionDirName(name string) error {
	if name == "" || strings.HasPrefix(name, ".") || strings.HasSuffix(name, " ") || strings.HasSuffix(name, ".") {
		return fmt.Errorf("invalid extension directory name %q", name)
	}
	if strings.EqualFold(name, "incoming") {
		return fmt.Errorf("extension directory name %q is reserved", name)
	}
	if strings.ContainsAny(name, ":*?\"<>|,/\\") {
		return fmt.Errorf("extension directory name %q contains forbidden characters", name)
	}
	switch strings.ToUpper(name) {
	case "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
		"LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9":
		return fmt.Errorf("extension directory name %q is a reserved Windows device name", name)
	}
	return nil
}

// Transactional and bounded extension unpacker (R4).
// Imports are serialized with an OS-level lock (released automatically on crash, so no stale lock file can
// block imports); interrupted promotions are recovered first. All errors are returned, never swallowed.
func unzipIncomingExtensions(extsDir string) []error {
	incomingDir := filepath.Join(extsDir, "incoming")
	_, incErr := os.Stat(incomingDir)
	_, bakErr := os.Stat(filepath.Join(extsDir, ".backups"))
	if os.IsNotExist(incErr) && os.IsNotExist(bakErr) {
		return nil
	}

	var errs []error
	lockErr := withFileLock(filepath.Join(extsDir, ".import.lock"), func() error {
		// Collect active staging dirs referenced by any journal to avoid purging in-flight/unresolved staging bytes
		activeStaging := make(map[string]bool)
		if backups, err := os.ReadDir(filepath.Join(extsDir, ".backups")); err == nil {
			for _, b := range backups {
				if strings.HasSuffix(b.Name(), ".journal.json") {
					if data, err := os.ReadFile(filepath.Join(extsDir, ".backups", b.Name())); err == nil {
						var j importJournal
						if err := json.Unmarshal(data, &j); err == nil && j.StagingRel != "" {
							if stg, err := safeResolveExtPath(extsDir, j.StagingRel); err == nil {
								activeStaging[strings.ToLower(filepath.Clean(stg))] = true
							}
						}
					}
				}
			}
		}

		unresolved, recErrs := recoverImportJournals(extsDir)
		errs = append(errs, recErrs...)

		// Clear only orphaned staging dirs that are not part of an active recovery
		stagingRoot := filepath.Join(extsDir, ".staging")
		if sEntries, err := os.ReadDir(stagingRoot); err == nil {
			for _, se := range sEntries {
				sPath := filepath.Join(stagingRoot, se.Name())
				if !activeStaging[strings.ToLower(filepath.Clean(sPath))] {
					_ = os.RemoveAll(sPath)
				}
			}
		}

		entries, err := os.ReadDir(incomingDir)
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return fmt.Errorf("cannot read %s: %w", incomingDir, err)
		}
		if unresolved["*"] {
			errs = append(errs, fmt.Errorf("cannot import any extensions: unreadable backup state or unresolvable journal in %s", extsDir))
			return nil
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".zip") {
				continue
			}
			zipPath := filepath.Join(incomingDir, entry.Name())
			destName := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
			if unresolved[strings.ToLower(destName)] {
				errs = append(errs, fmt.Errorf("%s: destination %s has unresolved recovery journal, skipping import to prevent overwrite", entry.Name(), destName))
				continue
			}
			if err := validateExtensionDirName(destName); err != nil {
				errs = append(errs, fmt.Errorf("%s: %w (incoming archive retained)", entry.Name(), err))
				continue
			}
			destDir := filepath.Join(extsDir, destName)
			stagingDir := filepath.Join(extsDir, ".staging", fmt.Sprintf("%s_%d", destName, time.Now().UnixNano()))

			if err := transactionalUnzip(extsDir, zipPath, stagingDir, destDir); err != nil {
				errs = append(errs, fmt.Errorf("%s: %w (incoming archive retained)", entry.Name(), err))
				continue
			}
			// The archive is the recovery source until promotion is verified (hasManifest checked in promoteStaged).
			if err := os.Remove(zipPath); err != nil {
				errs = append(errs, fmt.Errorf("%s imported but archive could not be removed: %w", entry.Name(), err))
				continue
			}
			fmt.Printf("[LiteChromiumPortable] Successfully imported extension: %s -> %s\n", entry.Name(), destDir)
		}
		return nil
	})
	if lockErr != nil {
		errs = append(errs, fmt.Errorf("import lock: %w", lockErr))
	}
	return errs
}

func transactionalUnzip(extsDir, zipPath, stagingDir, destDir string) error {
	if extsDir == "" {
		extsDir = filepath.Dir(destDir)
	}
	const MaxFiles = 1000
	const MaxBytes = 100 * 1024 * 1024 // 100MB limit

	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("invalid zip file: %w", err)
	}
	defer r.Close()

	if len(r.File) > MaxFiles {
		return fmt.Errorf("archive contains too many files (%d > %d limit)", len(r.File), MaxFiles)
	}

	_ = os.RemoveAll(stagingDir)
	if err := os.MkdirAll(stagingDir, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(stagingDir)

	var totalExtracted int64
	seenPaths := make(map[string]bool)

	for _, f := range r.File {
		cleanName := filepath.Clean(f.Name)
		if strings.HasPrefix(cleanName, "..") || filepath.IsAbs(cleanName) {
			return fmt.Errorf("path traversal attempt detected: %s", f.Name)
		}

		// Windows path validity and case-collision checks
		lowerClean := strings.ToLower(cleanName)
		if seenPaths[lowerClean] {
			return fmt.Errorf("archive contains duplicate or case-colliding path: %s", f.Name)
		}
		seenPaths[lowerClean] = true

		// Check for forbidden Windows characters and device names
		for _, part := range strings.Split(cleanName, string(filepath.Separator)) {
			if strings.ContainsAny(part, ":*?\"<>|") {
				return fmt.Errorf("archive contains forbidden Windows characters in filename: %s", f.Name)
			}
			basePart := strings.ToUpper(strings.TrimSuffix(part, filepath.Ext(part)))
			switch basePart {
			case "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
				"LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9":
				return fmt.Errorf("archive contains forbidden Windows reserved device name: %s", f.Name)
			}
		}

		target := filepath.Join(stagingDir, cleanName)
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(target, 0755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			return err
		}
		outFile, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return err
		}

		written, err := io.Copy(outFile, io.LimitReader(rc, MaxBytes-totalExtracted+1))
		outFile.Close()
		rc.Close()
		if err != nil {
			return err
		}
		totalExtracted += written
		if totalExtracted > MaxBytes {
			return fmt.Errorf("archive uncompressed size exceeded limit of %d bytes", MaxBytes)
		}
	}

	// Validate manifest.json exists in root of stagingDir
	manifestPath := filepath.Join(stagingDir, "manifest.json")
	manifestData, err := os.ReadFile(manifestPath)
	if err != nil {
		return fmt.Errorf("manifest.json not found in archive root")
	}
	var manifestCheck map[string]interface{}
	if err := json.Unmarshal(manifestData, &manifestCheck); err != nil {
		return fmt.Errorf("manifest.json is malformed JSON: %w", err)
	}
	mv, ok := manifestCheck["manifest_version"]
	if !ok {
		return fmt.Errorf("manifest.json is missing required manifest_version field")
	}
	if v, isNum := mv.(float64); !isNum || v != 3 {
		return fmt.Errorf("manifest.json manifest_version must be 3 (got %v); Chromium 154 does not load MV2 extensions", mv)
	}
	for _, field := range []string{"name", "version"} {
		if s, isStr := manifestCheck[field].(string); !isStr || strings.TrimSpace(s) == "" {
			return fmt.Errorf("manifest.json is missing required non-empty %q field", field)
		}
	}

	return promoteStaged(extsDir, stagingDir, destDir)
}

// renameFn is the directory rename primitive used for promotion/rollback; tests replace it to inject failures.
var renameFn = renameWithRetry

// safeRelPath ensures that path is within baseDir and returns clean relative path without escape (..).
func safeRelPath(baseDir, targetPath string) (string, error) {
	cleanBase := filepath.Clean(baseDir)
	cleanTarget := filepath.Clean(targetPath)
	rel, err := filepath.Rel(cleanBase, cleanTarget)
	if err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return "", fmt.Errorf("path %q escapes base directory %q", targetPath, baseDir)
	}
	return rel, nil
}

// updateJournalPhase updates the phase field in a recovery journal file.
func updateJournalPhase(journalPath, phase string) error {
	if journalPath == "" {
		return nil
	}
	data, err := os.ReadFile(journalPath)
	if err != nil {
		return err
	}
	var j importJournal
	if err := json.Unmarshal(data, &j); err != nil {
		return err
	}
	j.Phase = phase
	jd, err := json.Marshal(j)
	if err != nil {
		return err
	}
	return os.WriteFile(journalPath, jd, 0644)
}

// safeResolveExtPath resolves a path (relative or absolute) strictly within extsDir.
// It defends against directory traversal, reparse escape, and foreign absolute paths.
func safeResolveExtPath(extsDir, relOrAbs string) (string, error) {
	cleanExts := filepath.Clean(extsDir)
	var candidate string
	if filepath.IsAbs(relOrAbs) {
		cleanAbs := filepath.Clean(relOrAbs)
		// If it's an absolute path, check if it's already within cleanExts
		if strings.HasPrefix(strings.ToLower(cleanAbs), strings.ToLower(cleanExts)+string(filepath.Separator)) {
			candidate = cleanAbs
		} else {
			// Reject ambiguous foreign absolute paths; do not silently remap by basename!
			return "", fmt.Errorf("foreign absolute path %q cannot be safely mapped into extension root %q", relOrAbs, cleanExts)
		}
	} else {
		candidate = filepath.Join(cleanExts, relOrAbs)
	}
	candidate = filepath.Clean(candidate)
	rel, err := filepath.Rel(cleanExts, candidate)
	if err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return "", fmt.Errorf("resolved path %q escapes extension root %q", candidate, cleanExts)
	}

	// Validate canonical ancestors against cleanExts to ensure no reparse point / symlink escapes
	if realExts, err := filepath.EvalSymlinks(cleanExts); err == nil {
		curr := candidate
		for {
			if _, err := os.Lstat(curr); err == nil {
				if realCurr, err := filepath.EvalSymlinks(curr); err == nil {
					relReal, err := filepath.Rel(realExts, realCurr)
					if err != nil || strings.HasPrefix(relReal, "..") || filepath.IsAbs(relReal) {
						return "", fmt.Errorf("reparse/symlink %q escapes real extension root %q", curr, realExts)
					}
				}
				break
			}
			parent := filepath.Dir(curr)
			if parent == curr || len(parent) < len(cleanExts) {
				break
			}
			curr = parent
		}
	}

	return candidate, nil
}

// importJournal records an in-flight promotion so an interrupted import can be recovered on the next run.
type importJournal struct {
	DestRel    string `json:"dest_rel"`
	BackupRel  string `json:"backup_rel"`
	StagingRel string `json:"staging_rel"`
	Phase      string `json:"phase"` // "backed_up", "promoted", "verified"
	Started    string `json:"started"`
	// Backward compatibility fields
	Dest   string `json:"dest,omitempty"`
	Backup string `json:"backup,omitempty"`
}

func hasManifest(dir string) bool {
	fi, err := os.Stat(filepath.Join(dir, "manifest.json"))
	return err == nil && !fi.IsDir()
}

// promoteStaged moves a fully validated staging directory into place.
// The previous version (if any) is kept in extensions/.backups with a root-relative journal until the new version is verified.
// A failed rollback never discards the backup and is reported together with the promotion error.
func promoteStaged(extsDir, stagingDir, destDir string) error {
	destRel, err := safeRelPath(extsDir, destDir)
	if err != nil {
		return err
	}
	stagingRel, err := safeRelPath(extsDir, stagingDir)
	if err != nil {
		return err
	}

	var backupDir, backupRel, journalPath string
	if _, err := os.Stat(destDir); err == nil {
		backupsRoot := filepath.Join(extsDir, ".backups")
		if err := os.MkdirAll(backupsRoot, 0755); err != nil {
			return fmt.Errorf("cannot create backups dir: %w", err)
		}
		backupDir = filepath.Join(backupsRoot, fmt.Sprintf("%s_%d", filepath.Base(destDir), time.Now().UnixNano()))
		backupRel, _ = safeRelPath(extsDir, backupDir)
		journalPath = backupDir + ".journal.json"
		j := importJournal{
			DestRel:    destRel,
			BackupRel:  backupRel,
			StagingRel: stagingRel,
			Phase:      "backed_up",
			Started:    time.Now().UTC().Format(time.RFC3339Nano),
			Dest:       destDir,
			Backup:     backupDir,
		}
		jd, _ := json.Marshal(j)
		if err := os.WriteFile(journalPath, jd, 0644); err != nil {
			return fmt.Errorf("cannot write import recovery journal: %w", err)
		}
		if err := renameFn(destDir, backupDir); err != nil {
			_ = os.Remove(journalPath)
			return fmt.Errorf("failed to backup existing extension before promotion (existing version untouched): %w", err)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("cannot inspect destination %s: %w", destDir, err)
	}

	if promotionErr := renameFn(stagingDir, destDir); promotionErr != nil {
		if backupDir == "" {
			return fmt.Errorf("failed to promote staged extension to %s (no previous version existed): %w", destDir, promotionErr)
		}
		rbErr := renameFn(backupDir, destDir)
		if rbErr == nil && !hasManifest(destDir) {
			rbErr = fmt.Errorf("restore verification failed: %s has no manifest.json after rollback", destDir)
		}
		if rbErr != nil {
			return errors.Join(
				fmt.Errorf("CRITICAL: promotion to %s failed: %w", destDir, promotionErr),
				fmt.Errorf("rollback failed: %w; previous version preserved at %s (recovery journal %s)", rbErr, backupDir, journalPath))
		}
		_ = os.Remove(journalPath)
		return fmt.Errorf("failed to promote staged extension to %s; previous version restored and verified: %w", destDir, promotionErr)
	}

	_ = updateJournalPhase(journalPath, "promoted")

	if !hasManifest(destDir) {
		return fmt.Errorf("promotion verification failed: %s has no manifest.json (backup kept at %s)", destDir, backupDir)
	}

	_ = updateJournalPhase(journalPath, "verified")

	if backupDir != "" {
		if err := os.RemoveAll(backupDir); err != nil {
			fmt.Fprintf(os.Stderr, "[LiteChromiumPortable] Warning: could not remove verified-obsolete backup %s: %v (journal kept for cleanup)\n", backupDir, err)
			return nil
		}
		_ = os.Remove(journalPath)
	}
	return nil
}

// recoverImportJournals completes or reverts imports interrupted by a crash. Caller holds the import lock.
// Returns a map of destination names that remain unresolved (to block destructive overwrites) and errors encountered.
func recoverImportJournals(extsDir string) (map[string]bool, []error) {
	unresolved := make(map[string]bool)
	var errs []error
	backupsRoot := filepath.Join(extsDir, ".backups")
	entries, err := os.ReadDir(backupsRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return unresolved, nil
		}
		unresolved["*"] = true
		return unresolved, []error{fmt.Errorf("cannot read %s: %w (blocking all imports for safety)", backupsRoot, err)}
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".journal.json") {
			continue
		}
		jp := filepath.Join(backupsRoot, e.Name())

		// Extract candidate destination name from filename in case journal JSON is unreadable or malformed
		base := strings.TrimSuffix(e.Name(), ".journal.json")
		destCandidate := base
		if idx := strings.LastIndex(base, "_"); idx != -1 {
			destCandidate = base[:idx]
		}
		destKey := strings.ToLower(destCandidate)

		data, err := os.ReadFile(jp)
		if err != nil {
			unresolved[destKey] = true
			errs = append(errs, fmt.Errorf("cannot read import journal %s (preserved, destination %s blocked): %w", jp, destCandidate, err))
			continue
		}
		var j importJournal
		if err := json.Unmarshal(data, &j); err != nil {
			unresolved[destKey] = true
			errs = append(errs, fmt.Errorf("malformed import journal %s (preserved, destination %s blocked): %w", jp, destCandidate, err))
			continue
		}
		destField := j.DestRel
		if destField == "" {
			destField = j.Dest
		}
		backupField := j.BackupRel
		if backupField == "" {
			backupField = j.Backup
		}
		if destField == "" || backupField == "" {
			unresolved[destKey] = true
			errs = append(errs, fmt.Errorf("journal %s missing destination or backup fields (preserved, destination %s blocked)", jp, destCandidate))
			continue
		}

		resolvedDest, err := safeResolveExtPath(extsDir, destField)
		if err != nil {
			unresolved[destKey] = true
			errs = append(errs, fmt.Errorf("journal %s dest invalid: %w (preserved, destination %s blocked)", jp, err, destCandidate))
			continue
		}
		resolvedBackup, err := safeResolveExtPath(extsDir, backupField)
		if err != nil {
			unresolved[destKey] = true
			errs = append(errs, fmt.Errorf("journal %s backup invalid: %w (preserved, destination %s blocked)", jp, err, destCandidate))
			continue
		}

		canonicalDestKey := strings.ToLower(filepath.Base(resolvedDest))

		_, backupErr := os.Stat(resolvedBackup)
		if backupErr != nil {
			if os.IsNotExist(backupErr) {
				// Backup was already consumed or deleted
				_ = os.Remove(jp)
				continue
			}
			// Unknown error (permission/IO): preserve journal and backup!
			unresolved[canonicalDestKey] = true
			errs = append(errs, fmt.Errorf("unknown error inspecting backup %s: %w (journal and backup preserved)", resolvedBackup, backupErr))
			continue
		}

		// Backup exists. Check journal phase and manifest verification
		if j.Phase == "verified" || (j.Phase == "promoted" && hasManifest(resolvedDest)) {
			// New version is in place and verified; obsolete backup can be removed
			if err := os.RemoveAll(resolvedBackup); err != nil {
				unresolved[canonicalDestKey] = true
				errs = append(errs, fmt.Errorf("cannot remove obsolete backup %s: %w (journal preserved)", resolvedBackup, err))
				continue
			}
			_ = os.Remove(jp)
		} else {
			// Promotion never completed cleanly or phase was backed_up: restore the previous version
			_ = os.RemoveAll(resolvedDest)
			if err := renameFn(resolvedBackup, resolvedDest); err != nil || !hasManifest(resolvedDest) {
				unresolved[canonicalDestKey] = true
				errs = append(errs, fmt.Errorf("recovery of %s failed (backup preserved at %s): %v", resolvedDest, resolvedBackup, err))
				continue
			}
			_ = os.Remove(jp)
			fmt.Fprintf(os.Stderr, "[LiteChromiumPortable] Recovered previous version of %s from interrupted import\n", resolvedDest)
		}
	}
	return unresolved, errs
}

// ---- Instance launch / registry (R4-A) ----

var (
	// startupGrace: an engine process that exits within this window did not become an instance owner.
	startupGrace = 1000 * time.Millisecond
	// handoffTimeout: bound for the Chromium "new window in existing owner" forwarding process.
	handoffTimeout = 15 * time.Second
)

func buildEngineArgs(profileDir string, extensions []string, initialURL string) []string {
	args := []string{
		"--user-data-dir=" + profileDir,
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-sync",
		"--disable-component-update",
		"--disable-background-networking",
		"--disable-breakpad",
		"--disable-features=Translate,OptimizationHints,MediaRouter",
	}
	if len(extensions) > 0 {
		args = append(args, "--load-extension="+strings.Join(extensions, ","))
		args = append(args, "--disable-extensions-except="+strings.Join(extensions, ","))
	} else {
		args = append(args, "--disable-extensions")
	}
	if initialURL != "" {
		args = append(args, initialURL)
	}
	return args
}

func startEngine(engineExe string, args []string) (*exec.Cmd, error) {
	cmd := exec.Command(engineExe, args...)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("starting process failed: %w", err)
	}
	return cmd, nil
}

// launchInstance starts (or forwards to) the owner of one instance.
//
// The registry lock is held from the ownership check until the new record is durable, so concurrent launchers
// cannot both become owners of the same instance. Every failure path is an error (nonzero exit upstream):
//   - unreadable/malformed registry or UNKNOWN owner state: refuse to launch, nothing is modified;
//   - live verified owner: documented behavior is Chromium's own handoff (new window in the existing owner);
//     the owner's record is preserved untouched;
//   - engine exits during startup: no record is written (owner unknown);
//   - registry write failure after start: the process this launcher just created is terminated and the error returned.
func launchInstance(engineExe, profileDir string, instanceID int, extensions []string, initialURL, registryFile, lockFile string) error {
	if err := os.MkdirAll(profileDir, 0755); err != nil {
		return fmt.Errorf("could not create profile dir: %w", err)
	}
	args := buildEngineArgs(profileDir, extensions, initialURL)

	return withFileLock(lockFile, func() error {
		reg, err := readRegistry(registryFile)
		if err != nil {
			return fmt.Errorf("instance registry is unreadable; refusing to launch instance %d (state unknown): %w", instanceID, err)
		}
		for _, inst := range reg.Instances {
			if inst.InstanceID != instanceID {
				continue
			}
			state, why := verifyOwner(inst)
			switch state {
			case ProcRunning:
				return handoffToOwner(engineExe, args, inst)
			case ProcUnknown:
				return fmt.Errorf("instance %d owner state UNKNOWN (pid %d): %s; refusing to launch a second owner", instanceID, inst.PID, why)
			}
		}

		cmd, err := startEngine(engineExe, args)
		if err != nil {
			return err
		}
		exited := make(chan error, 1)
		go func() { exited <- cmd.Wait() }()
		select {
		case werr := <-exited:
			return fmt.Errorf("engine exited %s after start (result: %v); instance %d has no verified owner and was not registered", startupGrace, werr, instanceID)
		case <-time.After(startupGrace):
		}

		ct, img, err := verifyLaunchedProcess(cmd.Process.Pid, engineExe, profileDir)
		if err != nil {
			_ = cmd.Process.Kill()
			return fmt.Errorf("could not verify identity/profile of the launched process (terminated it): %w", err)
		}

		rec := InstanceRecord{
			InstanceID:   instanceID,
			PID:          cmd.Process.Pid,
			ProfileDir:   profileDir,
			StartedAt:    time.Now().UTC(),
			Executable:   img,
			ActiveParams: args,
			CreationTime: ct,
			ImagePath:    img,
		}
		if err := mergeRecord(registryFile, reg, rec); err != nil {
			killErr := cmd.Process.Kill()
			return fmt.Errorf("failed to record instance %d (launched pid %d terminated, kill result: %v): %w", instanceID, rec.PID, killErr, err)
		}
		fmt.Printf("[LiteChromiumPortable] Launched Instance #%d [PID: %d] Profile: %s\n", instanceID, rec.PID, profileDir)
		return nil
	})
}

// handoffToOwner runs the engine with the same profile; Chromium forwards the request to the live owner
// (opening a new window there) and exits 0. The owner record is not modified.
func handoffToOwner(engineExe string, args []string, owner InstanceRecord) error {
	// Explicitly request Chromium to open a new window in the existing owner instance
	handoffArgs := append([]string{"--new-window"}, args...)
	cmd, err := startEngine(engineExe, handoffArgs)
	if err != nil {
		return err
	}
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()
	select {
	case werr := <-exited:
		if werr != nil {
			return fmt.Errorf("handoff to live owner of instance %d (pid %d) failed: %w", owner.InstanceID, owner.PID, werr)
		}
		fmt.Printf("[LiteChromiumPortable] Instance #%d already running [PID: %d]; opened a new window in the existing owner\n", owner.InstanceID, owner.PID)
		return nil
	case <-time.After(handoffTimeout):
		killErr := cmd.Process.Kill()
		return fmt.Errorf("handoff to live owner of instance %d (pid %d) did not finish within %s (forwarding process terminated: %v)", owner.InstanceID, owner.PID, handoffTimeout, killErr)
	}
}

// readRegistry returns an empty registry only when the file does not exist.
// Any other read failure and any malformed/empty content is an error: it must never be overwritten silently.
func readRegistry(regPath string) (InstanceRegistry, error) {
	var reg InstanceRegistry
	data, err := os.ReadFile(regPath)
	if err != nil {
		if os.IsNotExist(err) {
			return reg, nil
		}
		return reg, fmt.Errorf("cannot read registry %s: %w", regPath, err)
	}
	if err := json.Unmarshal(data, &reg); err != nil {
		return reg, fmt.Errorf("registry %s is malformed (%v); repair or remove it after confirming no instances are running", regPath, err)
	}
	return reg, nil
}

// mergeRecord writes reg with rec as the sole record for rec.InstanceID.
// Records whose owner is verifiably stopped are dropped; running and UNKNOWN records are preserved.
// A different live/UNKNOWN owner for the same instance is never replaced. Caller holds the registry lock.
func mergeRecord(regPath string, reg InstanceRegistry, rec InstanceRecord) error {
	var keep []InstanceRecord
	for _, inst := range reg.Instances {
		state, why := verifyOwner(inst)
		if inst.InstanceID == rec.InstanceID {
			if state != ProcStopped && inst.PID != rec.PID {
				return fmt.Errorf("instance %d already has a %s owner (pid %d: %s); refusing to replace it", inst.InstanceID, state, inst.PID, why)
			}
			continue
		}
		if state != ProcStopped {
			keep = append(keep, inst)
		}
	}
	reg.Instances = append(keep, rec)

	out, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return err
	}
	// Atomic file write via temp file and Windows MoveFileExW (R2)
	tmpFile := regPath + ".tmp"
	if err := os.WriteFile(tmpFile, out, 0644); err != nil {
		return fmt.Errorf("cannot write registry temp file: %w", err)
	}
	return atomicReplaceFile(tmpFile, regPath)
}

func updateRegistryLocked(regPath, lockPath string, rec InstanceRecord) error {
	return withFileLock(lockPath, func() error {
		reg, err := readRegistry(regPath)
		if err != nil {
			return err
		}
		return mergeRecord(regPath, reg, rec)
	})
}

// Windows cross-process file locking for registry concurrency (R2)
func withFileLock(lockPath string, fn func() error) error {
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0666)
	if err != nil {
		return fmt.Errorf("cannot open lock file: %w", err)
	}
	defer f.Close()

	if runtime.GOOS == "windows" {
		handle := syscall.Handle(f.Fd())
		var overlapped syscall.Overlapped
		// LockFileEx with LOCKFILE_EXCLUSIVE_LOCK = 2
		procLockFileEx := modKernel32.NewProc("LockFileEx")
		procUnlockFileEx := modKernel32.NewProc("UnlockFileEx")

		r1, _, errSys := procLockFileEx.Call(
			uintptr(handle),
			uintptr(2), // LOCKFILE_EXCLUSIVE_LOCK
			0,
			1, 0, // 1 byte
			uintptr(unsafe.Pointer(&overlapped)),
		)
		if r1 == 0 {
			return fmt.Errorf("failed to acquire LockFileEx: %v", errSys)
		}
		defer procUnlockFileEx.Call(
			uintptr(handle),
			0,
			1, 0,
			uintptr(unsafe.Pointer(&overlapped)),
		)
	}

	return fn()
}

// Windows-safe atomic file replacement without deleting target beforehand (R2)
func atomicReplaceFile(sourcePath, destPath string) error {
	if runtime.GOOS == "windows" {
		procMoveFileExW := modKernel32.NewProc("MoveFileExW")
		srcPtr, err := syscall.UTF16PtrFromString(sourcePath)
		if err != nil {
			return err
		}
		dstPtr, err := syscall.UTF16PtrFromString(destPath)
		if err != nil {
			return err
		}
		const MOVEFILE_REPLACE_EXISTING = 0x1
		const MOVEFILE_WRITE_THROUGH = 0x8
		var lastErr error
		for attempt := 0; attempt < 10; attempt++ {
			r1, _, errSys := procMoveFileExW.Call(
				uintptr(unsafe.Pointer(srcPtr)),
				uintptr(unsafe.Pointer(dstPtr)),
				uintptr(MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH),
			)
			if r1 != 0 {
				return nil
			}
			lastErr = errSys
			time.Sleep(25 * time.Millisecond)
		}
		return fmt.Errorf("MoveFileExW atomic replace failed after retries (target preserved): %v", lastErr)
	}
	return os.Rename(sourcePath, destPath)
}

// printStatus reports every recorded instance with a verified RUNNING/STOPPED/UNKNOWN state.
// A missing registry means "no instances"; lock, read or parse failures are returned as errors.
// unknown counts instances whose state could not be verified.
func printStatus(w io.Writer, regPath, lockPath string) (unknown int, err error) {
	err = withFileLock(lockPath, func() error {
		reg, rerr := readRegistry(regPath)
		if rerr != nil {
			return rerr
		}
		if len(reg.Instances) == 0 {
			fmt.Fprintln(w, "No instances recorded.")
			return nil
		}
		fmt.Fprintf(w, "LiteChromiumPortable Instances:\n")
		fmt.Fprintf(w, "%-12s %-8s %-20s %s\n", "INSTANCE", "PID", "STARTED_AT", "PROFILE")
		running := 0
		for _, inst := range reg.Instances {
			state, why := verifyOwner(inst)
			switch state {
			case ProcRunning:
				running++
			case ProcUnknown:
				unknown++
			}
			fmt.Fprintf(w, "%-12s %-8d %-20s %s [%s] %s\n",
				fmt.Sprintf("instance-%d", inst.InstanceID), inst.PID,
				inst.StartedAt.Format("15:04:05"), filepath.Base(inst.ProfileDir), state, why)
		}
		if running == 0 {
			fmt.Fprintln(w, "No verified running instances.")
		}
		return nil
	})
	return unknown, err
}
