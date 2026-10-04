package main

import (
	"archive/zip"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
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

func main() {
	instanceFlag := flag.Int("instance", 1, "Instance number to launch (e.g. 1, 2, 3...)")
	batchFlag := flag.Int("batch", 0, "Batch launch multiple instances concurrently (e.g. 3 or 5)")
	statusFlag := flag.Bool("status", false, "Display status of all active browser instances")
	cleanFlag := flag.Bool("clean-profiles", false, "Clean all instance profiles in data/profiles/")
	urlFlag := flag.String("url", "", "Optional initial URL to navigate to")
	flag.Parse()

	appRoot, err := getAppRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error resolving app root: %v\n", err)
		os.Exit(1)
	}

	dataDir := filepath.Join(appRoot, "data")
	profilesBase := filepath.Join(dataDir, "profiles")
	registryFile := filepath.Join(dataDir, "instances.json")
	extensionsDir := filepath.Join(appRoot, "extensions")

	if *statusFlag {
		printStatus(registryFile)
		return
	}

	if *cleanFlag {
		cleanProfiles(profilesBase, registryFile)
		return
	}

	engineExe, err := findEngine(appRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Chromium engine error: %v\n", err)
		os.Exit(1)
	}

	// Prepare any zip extensions in extensions/
	unzipIncomingExtensions(extensionsDir)

	// Collect unpacked extension paths
	loadedExts := discoverExtensions(extensionsDir)

	if *batchFlag > 0 {
		fmt.Printf("[LiteChromiumPortable] Batch launching %d instances...\n", *batchFlag)
		var wg sync.WaitGroup
		for i := 1; i <= *batchFlag; i++ {
			wg.Add(1)
			go func(instID int) {
				defer wg.Done()
				pDir := filepath.Join(profilesBase, fmt.Sprintf("instance-%d", instID))
				err := launchInstance(engineExe, pDir, instID, loadedExts, *urlFlag, registryFile)
				if err != nil {
					fmt.Fprintf(os.Stderr, "Failed to launch instance %d: %v\n", instID, err)
				}
			}(i)
			time.Sleep(300 * time.Millisecond) // slight stagger for clean process creation
		}
		wg.Wait()
		fmt.Printf("[LiteChromiumPortable] Batch launch complete.\n")
		return
	}

	// Single instance launch
	pDir := filepath.Join(profilesBase, fmt.Sprintf("instance-%d", *instanceFlag))
	err = launchInstance(engineExe, pDir, *instanceFlag, loadedExts, *urlFlag, registryFile)
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

func discoverExtensions(extsDir string) []string {
	var validExts []string
	if _, err := os.Stat(extsDir); os.IsNotExist(err) {
		_ = os.MkdirAll(extsDir, 0755)
		return validExts
	}

	entries, err := os.ReadDir(extsDir)
	if err != nil {
		return validExts
	}

	for _, entry := range entries {
		if entry.IsDir() {
			manifestPath := filepath.Join(extsDir, entry.Name(), "manifest.json")
			if _, err := os.Stat(manifestPath); err == nil {
				validExts = append(validExts, filepath.Join(extsDir, entry.Name()))
			}
		}
	}
	return validExts
}

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
			if err := unzipFile(zipPath, destDir); err == nil {
				fmt.Printf("[LiteChromiumPortable] Auto-unpacked extension: %s -> %s\n", entry.Name(), destDir)
				_ = os.Remove(zipPath)
			}
		}
	}
}

func unzipFile(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()

	_ = os.MkdirAll(dest, 0755)
	for _, f := range r.File {
		fpath := filepath.Join(dest, f.Name)
		if !strings.HasPrefix(fpath, filepath.Clean(dest)+string(os.PathSeparator)) {
			continue
		}
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(fpath, os.ModePerm)
			continue
		}
		if err = os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
			return err
		}
		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}
		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func launchInstance(engineExe, profileDir string, instanceID int, extensions []string, initialURL, registryFile string) error {
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

	updateRegistry(registryFile, record)
	fmt.Printf("[LiteChromiumPortable] Launched Instance #%d [PID: %d] Profile: %s\n", instanceID, cmd.Process.Pid, profileDir)
	return nil
}

func updateRegistry(regPath string, rec InstanceRecord) {
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
	if err == nil {
		_ = os.WriteFile(regPath, bytes, 0644)
	}
}

func printStatus(regPath string) {
	data, err := os.ReadFile(regPath)
	if err != nil {
		fmt.Println("No instance registry found. No instances running.")
		return
	}
	var reg InstanceRegistry
	_ = json.Unmarshal(data, &reg)

	fmt.Printf("Active LiteChromiumPortable Instances:\n")
	fmt.Printf("%-12s %-8s %-20s %s\n", "INSTANCE", "PID", "STARTED_AT", "PROFILE")
	for _, inst := range reg.Instances {
		status := "STOPPED"
		if isProcessAlive(inst.PID) {
			status = "RUNNING"
		}
		fmt.Printf("%-12s %-8d %-20s %s [%s]\n",
			fmt.Sprintf("instance-%d", inst.InstanceID),
			inst.PID,
			inst.StartedAt.Format("15:04:05"),
			filepath.Base(inst.ProfileDir),
			status,
		)
	}
}

func cleanProfiles(profilesBase, regPath string) {
	_ = os.Remove(regPath)
	err := os.RemoveAll(profilesBase)
	if err != nil {
		fmt.Printf("Failed to clean profiles: %v\n", err)
	} else {
		fmt.Printf("Cleaned profiles directory: %s\n", profilesBase)
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
		// On Windows, FindProcess always succeeds. Check if still active via OpenProcess query
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
