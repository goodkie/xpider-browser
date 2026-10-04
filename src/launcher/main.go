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
	cleanFlag := flag.Bool("clean-profiles", false, "Clean all instance profiles in data/profiles/ (requires --confirm-destructive)")
	confirmFlag := flag.Bool("confirm-destructive", false, "Confirmation required for destructive operations like --clean-profiles")
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
		printStatus(registryFile, lockFile)
		return
	}

	if *cleanFlag {
		if !*confirmFlag {
			fmt.Fprintf(os.Stderr, "Security Refusal: --clean-profiles requires explicit --confirm-destructive flag\n")
			os.Exit(1)
		}
		cleanProfiles(profilesBase, registryFile, lockFile)
		return
	}

	engineExe, err := findEngine(appRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Chromium engine error: %v\n", err)
		os.Exit(1)
	}

	// Prepare any zip extensions transactionally (R4)
	unzipIncomingExtensions(extensionsDir)

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

// discoverInstanceExtensions finds all valid extensions, filtered by instance configuration (R2/R4)
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
		if err := json.Unmarshal(data, &cfg); err == nil {
			hasConfig = true
		}
	}

	disabledMap := make(map[string]bool)
	for _, d := range cfg.DisabledExtensions {
		disabledMap[strings.ToLower(d)] = true
	}

	enabledMap := make(map[string]bool)
	for _, e := range cfg.EnabledExtensions {
		enabledMap[strings.ToLower(e)] = true
	}

	entries, err := os.ReadDir(extsDir)
	if err != nil {
		return validExts
	}

	for _, entry := range entries {
		if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") && entry.Name() != "incoming" && entry.Name() != ".staging" {
			extName := entry.Name()
			lowerName := strings.ToLower(extName)

			// If explicit enabled list is provided, only include those
			if hasConfig && len(cfg.EnabledExtensions) > 0 {
				if !enabledMap[lowerName] {
					continue
				}
			}

			// Exclude if disabled
			if disabledMap[lowerName] {
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

// Transactional and bounded extension unpacker (R4)
func unzipIncomingExtensions(extsDir string) {
	incomingDir := filepath.Join(extsDir, "incoming")
	if _, err := os.Stat(incomingDir); os.IsNotExist(err) {
		return
	}
	entries, err := os.ReadDir(incomingDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(strings.ToLower(entry.Name()), ".zip") {
			zipPath := filepath.Join(incomingDir, entry.Name())
			destName := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
			destDir := filepath.Join(extsDir, destName)
			stagingDir := filepath.Join(extsDir, ".staging", fmt.Sprintf("%s_%d", destName, time.Now().UnixNano()))

			err := transactionalUnzip(zipPath, stagingDir, destDir)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[LiteChromiumPortable] Extension unpack error for %s: %v (incoming archive retained)\n", entry.Name(), err)
			} else {
				fmt.Printf("[LiteChromiumPortable] Successfully imported extension: %s -> %s\n", entry.Name(), destDir)
				_ = os.Remove(zipPath)
			}
		}
	}
}

func transactionalUnzip(zipPath, stagingDir, destDir string) error {
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
	for _, f := range r.File {
		cleanName := filepath.Clean(f.Name)
		if strings.HasPrefix(cleanName, "..") || filepath.IsAbs(cleanName) {
			return fmt.Errorf("path traversal attempt detected: %s", f.Name)
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

	// Promote staging to destDir with safe backup and rollback (R2/R4)
	var backupDir string
	if _, err := os.Stat(destDir); err == nil {
		backupDir = destDir + fmt.Sprintf(".backup_%d", time.Now().UnixNano())
		if err := os.Rename(destDir, backupDir); err != nil {
			return fmt.Errorf("failed to backup existing extension before promotion: %w", err)
		}
	}

	promotionErr := os.Rename(stagingDir, destDir)
	if promotionErr != nil {
		// Fallback for cross-device or permission rename failure
		promotionErr = copyDir(stagingDir, destDir)
	}

	if promotionErr != nil {
		// Rollback previous extension if backup was created
		if backupDir != "" {
			_ = os.Rename(backupDir, destDir)
		}
		return fmt.Errorf("failed to promote staged extension to %s (rollback executed): %w", destDir, promotionErr)
	}

	// Promotion succeeded: remove backup directory
	if backupDir != "" {
		_ = os.RemoveAll(backupDir)
	}
	return nil
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		sFile, err := os.Open(path)
		if err != nil {
			return err
		}
		defer sFile.Close()
		dFile, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
		if err != nil {
			return err
		}
		defer dFile.Close()
		_, err = io.Copy(dFile, sFile)
		return err
	})
}

func launchInstance(engineExe, profileDir string, instanceID int, extensions []string, initialURL, registryFile, lockFile string) error {
	if err := os.MkdirAll(profileDir, 0755); err != nil {
		return fmt.Errorf("could not create profile dir: %w", err)
	}

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
	}

	if initialURL != "" {
		args = append(args, initialURL)
	}

	cmd := exec.Command(engineExe, args...)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
		}
	}

	err := cmd.Start()
	if err != nil {
		return fmt.Errorf("starting process failed: %w", err)
	}

	record := InstanceRecord{
		InstanceID:   instanceID,
		PID:          cmd.Process.Pid,
		ProfileDir:   profileDir,
		StartedAt:    time.Now().UTC(),
		Executable:   engineExe,
		ActiveParams: args,
	}

	err = updateRegistryLocked(registryFile, lockFile, record)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to update instance registry: %v\n", err)
	}

	fmt.Printf("[LiteChromiumPortable] Launched Instance #%d [PID: %d] Profile: %s\n", instanceID, cmd.Process.Pid, profileDir)
	return nil
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
		modkernel32 := syscall.NewLazyDLL("kernel32.dll")
		procLockFileEx := modkernel32.NewProc("LockFileEx")
		procUnlockFileEx := modkernel32.NewProc("UnlockFileEx")

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

func updateRegistryLocked(regPath, lockPath string, rec InstanceRecord) error {
	return withFileLock(lockPath, func() error {
		var reg InstanceRegistry
		data, err := os.ReadFile(regPath)
		if err == nil {
			_ = json.Unmarshal(data, &reg)
		}

		var active []InstanceRecord
		for _, inst := range reg.Instances {
			if isProcessAlive(inst.PID) && inst.InstanceID != rec.InstanceID {
				active = append(active, inst)
			}
		}
		active = append(active, rec)
		reg.Instances = active

		bytes, err := json.MarshalIndent(reg, "", "  ")
		if err != nil {
			return err
		}

		// Atomic file write via temp file and Windows MoveFileExW (R2)
		tmpFile := regPath + ".tmp"
		if err := os.WriteFile(tmpFile, bytes, 0644); err != nil {
			return err
		}
		return atomicReplaceFile(tmpFile, regPath)
	})
}

// Windows-safe atomic file replacement without deleting target beforehand (R2)
func atomicReplaceFile(sourcePath, destPath string) error {
	if runtime.GOOS == "windows" {
		modkernel32 := syscall.NewLazyDLL("kernel32.dll")
		procMoveFileExW := modkernel32.NewProc("MoveFileExW")
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
		r1, _, errSys := procMoveFileExW.Call(
			uintptr(unsafe.Pointer(srcPtr)),
			uintptr(unsafe.Pointer(dstPtr)),
			uintptr(MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH),
		)
		if r1 == 0 {
			// Fallback if MoveFileExW fails
			_ = os.Remove(destPath)
			return os.Rename(sourcePath, destPath)
		}
		_ = errSys
		return nil
	}
	_ = os.Remove(destPath)
	return os.Rename(sourcePath, destPath)
}

func printStatus(regPath, lockPath string) {
	_ = withFileLock(lockPath, func() error {
		data, err := os.ReadFile(regPath)
		if err != nil {
			fmt.Println("No instance registry found. No instances running.")
			return nil
		}
		var reg InstanceRegistry
		if err := json.Unmarshal(data, &reg); err != nil {
			fmt.Println("Instance registry is empty or invalid.")
			return nil
		}

		fmt.Printf("Active LiteChromiumPortable Instances:\n")
		fmt.Printf("%-12s %-8s %-20s %s\n", "INSTANCE", "PID", "STARTED_AT", "PROFILE")
		runningCount := 0
		for _, inst := range reg.Instances {
			status := "STOPPED"
			if isProcessAlive(inst.PID) {
				status = "RUNNING"
				runningCount++
			}
			fmt.Printf("%-12s %-8d %-20s %s [%s]\n",
				fmt.Sprintf("instance-%d", inst.InstanceID),
				inst.PID,
				inst.StartedAt.Format("15:04:05"),
				filepath.Base(inst.ProfileDir),
				status,
			)
		}
		if runningCount == 0 {
			fmt.Println("No active running instances.")
		}
		return nil
	})
}

// Safe profile cleanup (R2/R3)
func cleanProfiles(profilesBase, regPath, lockPath string) {
	err := withFileLock(lockPath, func() error {
		data, err := os.ReadFile(regPath)
		if err == nil {
			var reg InstanceRegistry
			if json.Unmarshal(data, &reg) == nil {
				for _, inst := range reg.Instances {
					if isProcessAlive(inst.PID) {
						return fmt.Errorf("cannot clean profiles: instance-%d [PID %d] is currently active", inst.InstanceID, inst.PID)
					}
				}
			}
		}

		// Safety check: ensure profilesBase ends with "profiles"
		if filepath.Base(profilesBase) != "profiles" {
			return errors.New("aborted: profiles path does not end with 'profiles'")
		}

		// Remove profile directories first; only if successful, clear the registry
		if err := os.RemoveAll(profilesBase); err != nil {
			return fmt.Errorf("failed to remove profiles: %w", err)
		}
		_ = os.Remove(regPath)
		fmt.Printf("Successfully cleaned profiles directory: %s\n", profilesBase)
		return nil
	})

	if err != nil {
		fmt.Fprintf(os.Stderr, "Profile cleanup error: %v\n", err)
		os.Exit(1)
	}
}

func isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	if runtime.GOOS == "windows" {
		const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
		h, err := syscall.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
		if err != nil {
			return false
		}
		var exitCode uint32
		_ = syscall.GetExitCodeProcess(h, &exitCode)
		syscall.CloseHandle(h)
		return exitCode == 259 // STILL_ACTIVE
	}
	return proc.Signal(syscall.Signal(0)) == nil
}
