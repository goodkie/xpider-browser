package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

// TestMain doubles as a fake Chromium engine when LCW_FAKE_ENGINE is set (UNIT / FIXTURE only).
//
//	owner:   first process for a profile becomes the owner (creates FAKE_OWNER exclusively) and sleeps;
//	         later processes for the same profile behave like Chromium handoff: exit 0 immediately.
//	exit1:   exits with status 1 immediately.
func TestMain(m *testing.M) {
	if mode := os.Getenv("LCW_FAKE_ENGINE"); mode != "" {
		var profile string
		for _, a := range os.Args[1:] {
			clean := strings.Trim(a, "\"")
			if strings.HasPrefix(clean, "--user-data-dir=") {
				profile = strings.Trim(clean[len("--user-data-dir="):], "\"")
			}
		}
		switch mode {
		case "exit1":
			os.Exit(1)
		case "owner":
			if profile != "" {
				_ = os.MkdirAll(profile, 0755)
				f, err := os.OpenFile(filepath.Join(profile, "FAKE_OWNER"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
				if err != nil {
					// Handoff: if --new-window is passed, note it
					for _, a := range os.Args[1:] {
						if a == "--new-window" {
							_ = os.WriteFile(filepath.Join(profile, "HANDOFF_NEW_WINDOW"), []byte("ok"), 0644)
						}
					}
					os.Exit(0) // handoff to existing owner
				}
				fmt.Fprintf(f, "%d", os.Getpid())
				f.Close()
			}
			time.Sleep(60 * time.Second)
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func fakeEnv(t *testing.T, mode string) string {
	t.Helper()
	t.Setenv("LCW_FAKE_ENGINE", mode)
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	return exe
}

func killRecorded(t *testing.T, reg string) {
	t.Helper()
	r, err := readRegistry(reg)
	if err != nil {
		return
	}
	for _, inst := range r.Instances {
		if p, err := os.FindProcess(inst.PID); err == nil {
			_ = p.Kill()
		}
	}
}

func TestLaunch_RecordsVerifiedIdentity(t *testing.T) {
	exe := fakeEnv(t, "owner")
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	prof := filepath.Join(tmp, "profiles", "instance-1")
	defer killRecorded(t, reg)

	if err := launchInstance(exe, prof, 1, nil, "", reg, lock); err != nil {
		t.Fatalf("launch: %v", err)
	}
	r, err := readRegistry(reg)
	if err != nil || len(r.Instances) != 1 {
		t.Fatalf("registry: %v %+v", err, r)
	}
	rec := r.Instances[0]
	if rec.CreationTime == 0 || rec.ImagePath == "" {
		t.Fatalf("identity not captured: %+v", rec)
	}
	if st, why := verifyOwner(rec); st != ProcRunning {
		t.Fatalf("expected RUNNING, got %v (%s)", st, why)
	}
	// PID reuse simulation: same pid, wrong creation time => STOPPED, never RUNNING
	bad := rec
	bad.CreationTime++
	if st, _ := verifyOwner(bad); st != ProcStopped {
		t.Fatalf("wrong creation time must be STOPPED, got %v", st)
	}
	// wrong profile => STOPPED
	bad = rec
	bad.ProfileDir = filepath.Join(tmp, "other-profile")
	if st, _ := verifyOwner(bad); st != ProcStopped {
		t.Fatalf("wrong profile must be STOPPED, got %v", st)
	}
	// legacy record without identity => UNKNOWN, not RUNNING
	bad = rec
	bad.CreationTime, bad.ImagePath = 0, ""
	if st, _ := verifyOwner(bad); st != ProcUnknown {
		t.Fatalf("legacy record must be UNKNOWN, got %v", st)
	}
}

func TestExactProfileIdentity_PrefixAndQuotedSpaces(t *testing.T) {
	// 1. Exact parameter parsing verification
	cmd1 := `chrome.exe --user-data-dir="C:\Profiles with spaces\instance-1" --no-first-run`
	parsed1 := parseUserDataDir(cmd1)
	expected1 := filepath.Clean(`C:\Profiles with spaces\instance-1`)
	if parsed1 != expected1 {
		t.Fatalf("parseUserDataDir failed for quoted spaces: got %q, expected %q", parsed1, expected1)
	}

	cmd2 := `chrome.exe "--user-data-dir=C:\Profiles with spaces\instance-1" --no-first-run`
	parsed2 := parseUserDataDir(cmd2)
	if parsed2 != expected1 {
		t.Fatalf("parseUserDataDir failed for outer-quoted arg: got %q, expected %q", parsed2, expected1)
	}

	// 2. URL containing substring must NOT match as profile dir
	cmd3 := `chrome.exe --user-data-dir=C:\profiles\instance-1 --url="https://example.com/?q=--user-data-dir=C:\profiles\instance-10"`
	parsed3 := parseUserDataDir(cmd3)
	expected3 := filepath.Clean(`C:\profiles\instance-1`)
	if parsed3 != expected3 {
		t.Fatalf("parseUserDataDir failed with embedded URL: got %q, expected %q", parsed3, expected3)
	}

	// 3. Prefix collision: instance-1 must NOT match instance-10
	exe := fakeEnv(t, "owner")
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	prof1 := filepath.Join(tmp, "profiles", "instance-1")
	defer killRecorded(t, reg)

	if err := launchInstance(exe, prof1, 1, nil, "", reg, lock); err != nil {
		t.Fatalf("launch: %v", err)
	}
	r, _ := readRegistry(reg)
	rec := r.Instances[0]

	// Simulate querying with instance-10 profile dir (prefix match would have falsely passed in old contains check)
	collidingRec := rec
	collidingRec.ProfileDir = filepath.Join(tmp, "profiles", "instance-10")
	if st, why := verifyOwner(collidingRec); st != ProcStopped {
		t.Fatalf("prefix collision (instance-1 vs instance-10) must be STOPPED, got %v (%s)", st, why)
	}
}

func TestLaunch_SameInstanceTwice_PreservesOwnerAndPassesNewWindow(t *testing.T) {
	exe := fakeEnv(t, "owner")
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	prof := filepath.Join(tmp, "profiles", "instance-1")
	defer killRecorded(t, reg)

	if err := launchInstance(exe, prof, 1, nil, "", reg, lock); err != nil {
		t.Fatal(err)
	}
	first, _ := readRegistry(reg)

	// Second launch performs handoff to existing owner with --new-window
	if err := launchInstance(exe, prof, 1, nil, "", reg, lock); err != nil {
		t.Fatalf("second launch (handoff) must succeed: %v", err)
	}
	second, _ := readRegistry(reg)
	if len(second.Instances) != 1 || second.Instances[0].PID != first.Instances[0].PID ||
		second.Instances[0].CreationTime != first.Instances[0].CreationTime {
		t.Fatalf("live owner record was replaced: before=%+v after=%+v", first, second)
	}

	// Verify handoff process received --new-window flag
	handoffMarker := filepath.Join(prof, "HANDOFF_NEW_WINDOW")
	if _, err := os.Stat(handoffMarker); err != nil {
		t.Fatalf("expected handoff to pass --new-window, marker missing: %v", err)
	}
}

func TestLaunch_ConcurrentLaunchersSameInstance_OneOwner(t *testing.T) {
	exe := fakeEnv(t, "owner")
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	prof := filepath.Join(tmp, "profiles", "instance-1")
	defer killRecorded(t, reg)

	var wg sync.WaitGroup
	errs := make([]error, 4)
	for i := range errs {
		wg.Add(1)
		go func(i int) { defer wg.Done(); errs[i] = launchInstance(exe, prof, 1, nil, "", reg, lock) }(i)
	}
	wg.Wait()
	for i, e := range errs {
		if e != nil {
			t.Fatalf("launcher %d: %v", i, e)
		}
	}
	r, err := readRegistry(reg)
	if err != nil || len(r.Instances) != 1 {
		t.Fatalf("expected exactly one record, got %v %+v", err, r)
	}
	if st, why := verifyOwner(r.Instances[0]); st != ProcRunning {
		t.Fatalf("owner not running: %v %s", st, why)
	}
}

func TestLaunch_DistinctInstancesConcurrent(t *testing.T) {
	exe := fakeEnv(t, "owner")
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	defer killRecorded(t, reg)
	var wg sync.WaitGroup
	errs := make([]error, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs[i] = launchInstance(exe, filepath.Join(tmp, "profiles", fmt.Sprintf("instance-%d", i+1)), i+1, nil, "", reg, lock)
		}(i)
	}
	wg.Wait()
	for _, e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	r, _ := readRegistry(reg)
	if len(r.Instances) != 3 {
		t.Fatalf("expected 3 records, got %d", len(r.Instances))
	}
}

func TestLaunch_MalformedRegistry_RefusesAndPreserves(t *testing.T) {
	exe := fakeEnv(t, "owner")
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	_ = os.WriteFile(reg, []byte("{not json"), 0644)
	err := launchInstance(exe, filepath.Join(tmp, "p"), 1, nil, "", reg, lock)
	if err == nil || !strings.Contains(err.Error(), "malformed") {
		t.Fatalf("expected malformed-registry error, got %v", err)
	}
	if b, _ := os.ReadFile(reg); string(b) != "{not json" {
		t.Fatalf("malformed registry was overwritten: %q", b)
	}
	if _, err := os.Stat(filepath.Join(tmp, "p", "FAKE_OWNER")); err == nil {
		t.Fatal("engine must not have been started")
	}
}

func TestLaunch_RegistryUnreadable_Refuses(t *testing.T) {
	exe := fakeEnv(t, "owner")
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	_ = os.Mkdir(reg, 0755) // reading a directory as a file fails with a non-NotExist error
	if err := launchInstance(exe, filepath.Join(tmp, "p"), 1, nil, "", reg, lock); err == nil {
		t.Fatal("expected error for unreadable registry")
	}
}

func TestLaunch_RegistryWriteDenied_KillsOwnProcessAndErrors(t *testing.T) {
	exe := fakeEnv(t, "owner")
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	_ = os.Mkdir(reg+".tmp", 0755) // temp file path is a directory: write is denied
	prof := filepath.Join(tmp, "p")
	err := launchInstance(exe, prof, 1, nil, "", reg, lock)
	if err == nil || !strings.Contains(err.Error(), "failed to record instance") {
		t.Fatalf("expected record failure, got %v", err)
	}
	b, rerr := os.ReadFile(filepath.Join(prof, "FAKE_OWNER"))
	if rerr != nil {
		t.Fatalf("engine should have started before the write failure: %v", rerr)
	}
	var pid int
	fmt.Sscanf(string(b), "%d", &pid)
	time.Sleep(300 * time.Millisecond)
	if st, _ := verifyOwner(InstanceRecord{PID: pid, ProfileDir: prof}); st == ProcRunning {
		t.Fatalf("launched process %d must have been terminated", pid)
	}
	h, oerr := syscall.OpenProcess(0x1000, false, uint32(pid))
	if oerr == nil {
		var code uint32
		_ = syscall.GetExitCodeProcess(h, &code)
		syscall.CloseHandle(h)
		if code == stillActive {
			t.Fatalf("process %d still active", pid)
		}
	}
}

func TestLaunch_EngineExitsDuringStartup_ErrorNoRecord(t *testing.T) {
	exe := fakeEnv(t, "exit1")
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	err := launchInstance(exe, filepath.Join(tmp, "p"), 1, nil, "", reg, lock)
	if err == nil {
		t.Fatal("expected error when engine exits during startup")
	}
	if _, serr := os.Stat(reg); serr == nil {
		t.Fatal("no registry must be written for an unowned instance")
	}
}

func TestStatus_ErrorsAreReported(t *testing.T) {
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	var sb strings.Builder
	if _, err := printStatus(&sb, reg, lock); err != nil {
		t.Fatalf("missing registry is not an error: %v", err)
	}
	_ = os.WriteFile(reg, []byte("garbage"), 0644)
	if _, err := printStatus(&sb, reg, lock); err == nil {
		t.Fatal("malformed registry must be an error")
	}
	// lock path that cannot be opened
	if _, err := printStatus(&sb, reg, filepath.Join(tmp, "nodir", "x.lock")); err == nil {
		t.Fatal("lock failure must be an error")
	}
}

func TestMergeRecord_RefusesReplacingUnknownOwner(t *testing.T) {
	tmp := t.TempDir()
	reg := filepath.Join(tmp, "instances.json")
	legacy := InstanceRecord{InstanceID: 1, PID: os.Getpid(), ProfileDir: "x"} // live pid, no identity => UNKNOWN
	err := mergeRecord(reg, InstanceRegistry{Instances: []InstanceRecord{legacy}}, InstanceRecord{InstanceID: 1, PID: 999999999, ProfileDir: "x"})
	if err == nil {
		t.Fatal("must not replace an UNKNOWN/live owner")
	}
}

// ---- extension transaction failure evidence ----

func writeExt(t *testing.T, dir, ver string) {
	t.Helper()
	_ = os.MkdirAll(dir, 0755)
	_ = os.WriteFile(filepath.Join(dir, "manifest.json"), []byte(fmt.Sprintf(`{"manifest_version":3,"name":"E","version":"%s"}`, ver)), 0644)
}

func TestPromote_FailureRollsBackAndVerifies(t *testing.T) {
	tmp := t.TempDir()
	exts := filepath.Join(tmp, "extensions")
	dest := filepath.Join(exts, "ext")
	staging := filepath.Join(exts, ".staging", "ext_1")
	writeExt(t, dest, "1.0")
	writeExt(t, staging, "2.0")

	orig := renameFn
	defer func() { renameFn = orig }()
	renameFn = func(src, dst string) error {
		if src == staging {
			return errors.New("injected promotion failure")
		}
		return orig(src, dst)
	}
	err := promoteStaged(exts, staging, dest)
	if err == nil || !strings.Contains(err.Error(), "restored and verified") {
		t.Fatalf("expected verified rollback error, got %v", err)
	}
	b, _ := os.ReadFile(filepath.Join(dest, "manifest.json"))
	if !strings.Contains(string(b), `"1.0"`) {
		t.Fatalf("previous version not restored: %s", b)
	}
	if left, _ := filepath.Glob(filepath.Join(exts, ".backups", "*")); len(left) != 0 {
		t.Fatalf("backup/journal should be gone after verified rollback: %v", left)
	}
}

func TestPromote_FailedRollbackPreservesBackupAndReportsBoth(t *testing.T) {
	tmp := t.TempDir()
	exts := filepath.Join(tmp, "extensions")
	dest := filepath.Join(exts, "ext")
	staging := filepath.Join(exts, ".staging", "ext_1")
	writeExt(t, dest, "1.0")
	writeExt(t, staging, "2.0")

	orig := renameFn
	defer func() { renameFn = orig }()
	renameFn = func(src, dst string) error {
		if src == staging {
			return errors.New("injected promotion failure")
		}
		if dst == dest && strings.Contains(src, ".backups") {
			return errors.New("injected rollback failure")
		}
		return orig(src, dst)
	}
	err := promoteStaged(exts, staging, dest)
	if err == nil || !strings.Contains(err.Error(), "promotion") || !strings.Contains(err.Error(), "rollback failed") {
		t.Fatalf("both errors must be reported, got %v", err)
	}
	matches, _ := filepath.Glob(filepath.Join(exts, ".backups", "ext_*"))
	var haveBackup, haveJournal bool
	for _, m := range matches {
		if strings.HasSuffix(m, ".journal.json") {
			haveJournal = true
		} else if hasManifest(m) {
			haveBackup = true
		}
	}
	if !haveBackup || !haveJournal {
		t.Fatalf("backup (%v) and journal (%v) must be preserved: %v", haveBackup, haveJournal, matches)
	}

	// Recovery on the next run restores the previous version.
	renameFn = orig
	unresolved, errs := recoverImportJournals(exts)
	if len(errs) != 0 || len(unresolved) != 0 {
		t.Fatalf("recovery failed: unresolved=%v errs=%v", unresolved, errs)
	}
	b, _ := os.ReadFile(filepath.Join(dest, "manifest.json"))
	if !strings.Contains(string(b), `"1.0"`) {
		t.Fatalf("recovery did not restore previous version: %s", b)
	}
}

func TestRecoveryJournal_MovedRoot(t *testing.T) {
	// Create an import journal with root-relative paths in original root
	tmp1 := t.TempDir()
	exts1 := filepath.Join(tmp1, "extensions")
	backups1 := filepath.Join(exts1, ".backups")
	_ = os.MkdirAll(backups1, 0755)

	backupDir1 := filepath.Join(backups1, "myext_12345")
	writeExt(t, backupDir1, "1.0")

	journalPath1 := backupDir1 + ".journal.json"
	j := importJournal{
		DestRel:    "myext",
		BackupRel:  filepath.Join(".backups", "myext_12345"),
		StagingRel: filepath.Join(".staging", "myext_12345"),
		Phase:      "backed_up",
		Started:    time.Now().UTC().Format(time.RFC3339Nano),
		Dest:       `C:\old_location\extensions\myext`,
		Backup:     `C:\old_location\extensions\.backups\myext_12345`,
	}
	jd, _ := json.Marshal(j)
	_ = os.WriteFile(journalPath1, jd, 0644)

	// Move the entire extensions directory to a new root (simulating portable folder relocation)
	tmp2 := t.TempDir()
	exts2 := filepath.Join(tmp2, "relocated_extensions")
	if err := os.Rename(exts1, exts2); err != nil {
		t.Fatalf("failed to relocate extensions dir: %v", err)
	}

	// Run recovery on the new relocated root
	unresolved, errs := recoverImportJournals(exts2)
	if len(errs) != 0 || len(unresolved) != 0 {
		t.Fatalf("recovery on relocated root failed: unresolved=%v errs=%v", unresolved, errs)
	}

	// Verify myext was recovered to new root and does NOT point to old location
	recoveredDest := filepath.Join(exts2, "myext")
	b, err := os.ReadFile(filepath.Join(recoveredDest, "manifest.json"))
	if err != nil || !strings.Contains(string(b), `"1.0"`) {
		t.Fatalf("recovery did not properly restore previous version at relocated destination: %v %s", err, b)
	}
}

func TestRecoveryJournal_BlocksSubsequentImportOnUnresolved(t *testing.T) {
	tmp := t.TempDir()
	exts := filepath.Join(tmp, "extensions")
	incoming := filepath.Join(exts, "incoming")
	backups := filepath.Join(exts, ".backups")
	_ = os.MkdirAll(incoming, 0755)
	_ = os.MkdirAll(backups, 0755)

	// An existing unresolved backup where recovery fails (simulate locked destination)
	dest := filepath.Join(exts, "locked_ext")
	_ = os.MkdirAll(dest, 0755)
	backupDir := filepath.Join(backups, "locked_ext_999")
	writeExt(t, backupDir, "1.0")

	journalPath := backupDir + ".journal.json"
	j := importJournal{
		DestRel:    "locked_ext",
		BackupRel:  filepath.Join(".backups", "locked_ext_999"),
		StagingRel: filepath.Join(".staging", "locked_ext_999"),
		Phase:      "backed_up",
	}
	jd, _ := json.Marshal(j)
	_ = os.WriteFile(journalPath, jd, 0644)

	// Make restore fail
	orig := renameFn
	defer func() { renameFn = orig }()
	renameFn = func(src, dst string) error {
		if strings.Contains(src, "locked_ext_999") && strings.Contains(dst, "locked_ext") {
			return errors.New("simulated destination locked")
		}
		return orig(src, dst)
	}

	// Provide a new incoming ZIP for locked_ext
	createTestZip(t, filepath.Join(incoming, "locked_ext.zip"), map[string]string{
		"manifest.json": `{"manifest_version":3,"name":"locked_ext","version":"2.0"}`,
	})

	errs := unzipIncomingExtensions(exts)
	if len(errs) == 0 {
		t.Fatal("expected error blocking import of unresolved destination")
	}

	var foundBlock bool
	for _, e := range errs {
		if strings.Contains(e.Error(), "has unresolved recovery journal") {
			foundBlock = true
			break
		}
	}
	if !foundBlock {
		t.Fatalf("expected blocked import error, got: %v", errs)
	}

	// Incoming ZIP must be preserved
	if _, err := os.Stat(filepath.Join(incoming, "locked_ext.zip")); err != nil {
		t.Fatalf("incoming zip must be retained when import is blocked: %v", err)
	}
}

func TestImport_SimultaneousImportersSerialize(t *testing.T) {
	tmp := t.TempDir()
	exts := filepath.Join(tmp, "extensions")
	_ = os.MkdirAll(filepath.Join(exts, "incoming"), 0755)
	for _, n := range []string{"a", "b", "c"} {
		createTestZip(t, filepath.Join(exts, "incoming", n+".zip"), map[string]string{
			"manifest.json": `{"manifest_version":3,"name":"` + n + `","version":"1"}`,
		})
	}
	var wg sync.WaitGroup
	allErrs := make([][]error, 4)
	for i := range allErrs {
		wg.Add(1)
		go func(i int) { defer wg.Done(); allErrs[i] = unzipIncomingExtensions(exts) }(i)
	}
	wg.Wait()
	for i, e := range allErrs {
		if len(e) != 0 {
			t.Fatalf("importer %d errors: %v", i, e)
		}
	}
	for _, n := range []string{"a", "b", "c"} {
		if !hasManifest(filepath.Join(exts, n)) {
			t.Fatalf("extension %s missing", n)
		}
	}
	if zs, _ := filepath.Glob(filepath.Join(exts, "incoming", "*.zip")); len(zs) != 0 {
		t.Fatalf("zips should be consumed: %v", zs)
	}
}

func TestImport_RejectsBadNamesAndMV2(t *testing.T) {
	tmp := t.TempDir()
	exts := filepath.Join(tmp, "extensions")
	_ = os.MkdirAll(filepath.Join(exts, "incoming"), 0755)
	createTestZip(t, filepath.Join(exts, "incoming", ".staging.zip"), map[string]string{"manifest.json": `{"manifest_version":3,"name":"x","version":"1"}`})
	createTestZip(t, filepath.Join(exts, "incoming", "a,b.zip"), map[string]string{"manifest.json": `{"manifest_version":3,"name":"x","version":"1"}`})
	createTestZip(t, filepath.Join(exts, "incoming", "mv2.zip"), map[string]string{"manifest.json": `{"manifest_version":2,"name":"x","version":"1"}`})
	errs := unzipIncomingExtensions(exts)
	if len(errs) != 3 {
		t.Fatalf("expected 3 rejections, got %v", errs)
	}
	if zs, _ := filepath.Glob(filepath.Join(exts, "incoming", "*.zip")); len(zs) != 3 {
		t.Fatalf("rejected archives must be retained: %v", zs)
	}
}

func TestDiscover_BackupDirsNeverLoaded_ConfigReadFailureLoadsNone(t *testing.T) {
	tmp := t.TempDir()
	exts := filepath.Join(tmp, "extensions")
	prof := filepath.Join(tmp, "profile")
	writeExt(t, filepath.Join(exts, "good"), "1")
	writeExt(t, filepath.Join(exts, ".backups", "good_123"), "0")
	_ = os.MkdirAll(prof, 0755)
	if got := discoverInstanceExtensions(exts, prof); len(got) != 1 {
		t.Fatalf("expected only 'good', got %v", got)
	}
	// extensions_config.json that is a directory => read error other than NotExist => load none
	_ = os.Mkdir(filepath.Join(prof, "extensions_config.json"), 0755)
	if got := discoverInstanceExtensions(exts, prof); len(got) != 0 {
		t.Fatalf("config read failure must load zero extensions, got %v", got)
	}
}

func TestRecoveryJournal_MalformedBlocksImport(t *testing.T) {
	tmp := t.TempDir()
	exts := filepath.Join(tmp, "extensions")
	incoming := filepath.Join(exts, "incoming")
	backups := filepath.Join(exts, ".backups")
	_ = os.MkdirAll(incoming, 0755)
	_ = os.MkdirAll(backups, 0755)

	// Write a malformed journal for "myext"
	_ = os.WriteFile(filepath.Join(backups, "myext_12345.journal.json"), []byte("{malformed json"), 0644)

	// An incoming archive for "myext" must be blocked from overwriting
	createTestZip(t, filepath.Join(incoming, "myext.zip"), map[string]string{
		"manifest.json": `{"manifest_version":3,"name":"myext","version":"2.0"}`,
	})

	errs := unzipIncomingExtensions(exts)
	if len(errs) == 0 {
		t.Fatalf("expected error from malformed journal or blocked destination, got none")
	}

	// Incoming archive must be preserved
	if _, err := os.Stat(filepath.Join(incoming, "myext.zip")); err != nil {
		t.Fatalf("incoming archive must be retained when blocked: %v", err)
	}
}

func TestRecoveryJournal_PreservesReferencedStaging(t *testing.T) {
	tmp := t.TempDir()
	exts := filepath.Join(tmp, "extensions")
	backups := filepath.Join(exts, ".backups")
	staging := filepath.Join(exts, ".staging")
	_ = os.MkdirAll(backups, 0755)
	_ = os.MkdirAll(staging, 0755)

	// Staging dir referenced by journal
	refStaging := filepath.Join(staging, "active_123")
	_ = os.MkdirAll(refStaging, 0755)
	_ = os.WriteFile(filepath.Join(refStaging, "bytes.bin"), []byte("important_bytes"), 0644)

	// Orphaned staging dir not referenced by any journal
	orphanStaging := filepath.Join(staging, "orphan_456")
	_ = os.MkdirAll(orphanStaging, 0755)

	// Write journal referencing active_123 and create a backup dir that leaves transaction unresolved
	_ = os.MkdirAll(filepath.Join(backups, "ext_123"), 0755)
	j := importJournal{
		DestRel:    "ext",
		BackupRel:  filepath.Join(".backups", "ext_123"),
		StagingRel: filepath.Join(".staging", "active_123"),
		Phase:      "backed_up",
	}
	jd, _ := json.Marshal(j)
	_ = os.WriteFile(filepath.Join(backups, "ext_123.journal.json"), jd, 0644)

	// Run unzipIncomingExtensions
	_ = unzipIncomingExtensions(exts)

	// Referenced staging directory must still exist!
	if _, err := os.Stat(filepath.Join(refStaging, "bytes.bin")); err != nil {
		t.Fatalf("referenced staging bytes must be preserved: %v", err)
	}

	// Orphaned staging directory should have been cleaned
	if _, err := os.Stat(orphanStaging); !os.IsNotExist(err) {
		t.Fatalf("orphaned staging dir should be cleaned: %v", err)
	}
}

func TestSafeResolveExtPath_RejectsForeignAbsoluteAndEscapes(t *testing.T) {
	tmp := t.TempDir()
	exts := filepath.Join(tmp, "extensions")
	_ = os.MkdirAll(exts, 0755)

	// Foreign absolute path must be rejected
	if _, err := safeResolveExtPath(exts, `C:\Windows\System32\malicious`); err == nil {
		t.Fatalf("foreign absolute path must be rejected")
	}

	// Traversal escape must be rejected
	if _, err := safeResolveExtPath(exts, `..\..\other`); err == nil {
		t.Fatalf("traversal escape must be rejected")
	}

	// Valid relative path must succeed
	resolved, err := safeResolveExtPath(exts, "valid_ext")
	if err != nil || resolved != filepath.Join(exts, "valid_ext") {
		t.Fatalf("valid relative path resolution failed: %v, %s", err, resolved)
	}
}

