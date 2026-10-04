package main

import (
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
			if strings.HasPrefix(a, "--user-data-dir=") {
				profile = strings.TrimPrefix(a, "--user-data-dir=")
			}
		}
		switch mode {
		case "exit1":
			os.Exit(1)
		case "owner":
			f, err := os.OpenFile(filepath.Join(profile, "FAKE_OWNER"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
			if err != nil {
				os.Exit(0) // handoff to existing owner
			}
			fmt.Fprintf(f, "%d", os.Getpid())
			f.Close()
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

func TestLaunch_SameInstanceTwice_PreservesOwner(t *testing.T) {
	exe := fakeEnv(t, "owner")
	tmp := t.TempDir()
	reg, lock := filepath.Join(tmp, "instances.json"), filepath.Join(tmp, "instances.lock")
	prof := filepath.Join(tmp, "profiles", "instance-1")
	defer killRecorded(t, reg)

	if err := launchInstance(exe, prof, 1, nil, "", reg, lock); err != nil {
		t.Fatal(err)
	}
	first, _ := readRegistry(reg)
	if err := launchInstance(exe, prof, 1, nil, "", reg, lock); err != nil {
		t.Fatalf("second launch (handoff) must succeed: %v", err)
	}
	second, _ := readRegistry(reg)
	if len(second.Instances) != 1 || second.Instances[0].PID != first.Instances[0].PID ||
		second.Instances[0].CreationTime != first.Instances[0].CreationTime {
		t.Fatalf("live owner record was replaced: before=%+v after=%+v", first, second)
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
	dest := filepath.Join(tmp, "ext")
	staging := filepath.Join(tmp, ".staging", "ext_1")
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
	err := promoteStaged(staging, dest)
	if err == nil || !strings.Contains(err.Error(), "restored and verified") {
		t.Fatalf("expected verified rollback error, got %v", err)
	}
	b, _ := os.ReadFile(filepath.Join(dest, "manifest.json"))
	if !strings.Contains(string(b), `"1.0"`) {
		t.Fatalf("previous version not restored: %s", b)
	}
	if left, _ := filepath.Glob(filepath.Join(tmp, ".backups", "*")); len(left) != 0 {
		t.Fatalf("backup/journal should be gone after verified rollback: %v", left)
	}
}

func TestPromote_FailedRollbackPreservesBackupAndReportsBoth(t *testing.T) {
	tmp := t.TempDir()
	dest := filepath.Join(tmp, "ext")
	staging := filepath.Join(tmp, ".staging", "ext_1")
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
	err := promoteStaged(staging, dest)
	if err == nil || !strings.Contains(err.Error(), "promotion") || !strings.Contains(err.Error(), "rollback failed") {
		t.Fatalf("both errors must be reported, got %v", err)
	}
	matches, _ := filepath.Glob(filepath.Join(tmp, ".backups", "ext_*"))
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
	if errs := recoverImportJournals(tmp); len(errs) != 0 {
		t.Fatalf("recovery errors: %v", errs)
	}
	b, _ := os.ReadFile(filepath.Join(dest, "manifest.json"))
	if !strings.Contains(string(b), `"1.0"`) {
		t.Fatalf("recovery did not restore previous version: %s", b)
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
