package main

import (
	"fmt"
	"path/filepath"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

// Verified process identity (R4-A).
//
// A bare PID is not an identity on Windows (PIDs are reused). An instance owner is identified by:
//   - the process creation time (FILETIME, 100ns ticks) captured at launch,
//   - the actual image path of the process (QueryFullProcessImageNameW),
//   - the actual command line of the process (PEB), which must contain the instance profile dir.
//
// State is tri-valued so that "cannot tell" is never silently treated as "stopped" or "running".

type ProcState int

const (
	ProcStopped ProcState = iota // verified: no such process / exited / PID reused by something else
	ProcRunning                  // verified: creation time + image + profile all match the record
	ProcUnknown                  // cannot be verified (e.g. access denied); caller must report an error
)

func (s ProcState) String() string {
	switch s {
	case ProcRunning:
		return "RUNNING"
	case ProcStopped:
		return "STOPPED"
	}
	return "UNKNOWN"
}

const (
	processQueryLimitedInformation = 0x1000
	processQueryInformation        = 0x0400
	processVMRead                  = 0x0010
	stillActive                    = 259
	errorInvalidParameter          = syscall.Errno(87)
)

var (
	modKernel32                   = syscall.NewLazyDLL("kernel32.dll")
	modNtdll                      = syscall.NewLazyDLL("ntdll.dll")
	procGetProcessTimes           = modKernel32.NewProc("GetProcessTimes")
	procQueryFullProcessImageName = modKernel32.NewProc("QueryFullProcessImageNameW")
	procReadProcessMemory         = modKernel32.NewProc("ReadProcessMemory")
	procNtQueryInformationProcess = modNtdll.NewProc("NtQueryInformationProcess")
)

// processCreationTime returns the process creation FILETIME as a uint64 tick count.
func processCreationTime(h syscall.Handle) (uint64, error) {
	var creation, exit, kernel, user syscall.Filetime
	r1, _, e := procGetProcessTimes.Call(uintptr(h),
		uintptr(unsafe.Pointer(&creation)), uintptr(unsafe.Pointer(&exit)),
		uintptr(unsafe.Pointer(&kernel)), uintptr(unsafe.Pointer(&user)))
	if r1 == 0 {
		return 0, fmt.Errorf("GetProcessTimes: %v", e)
	}
	return uint64(creation.HighDateTime)<<32 | uint64(creation.LowDateTime), nil
}

func processImagePath(h syscall.Handle) (string, error) {
	buf := make([]uint16, 32768)
	size := uint32(len(buf))
	r1, _, e := procQueryFullProcessImageName.Call(uintptr(h), 0,
		uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	if r1 == 0 {
		return "", fmt.Errorf("QueryFullProcessImageNameW: %v", e)
	}
	return syscall.UTF16ToString(buf[:size]), nil
}

// processCommandLine reads the command line out of the target's PEB (x64 layout).
func processCommandLine(pid uint32) (string, error) {
	h, err := syscall.OpenProcess(processQueryInformation|processVMRead, false, pid)
	if err != nil {
		return "", fmt.Errorf("OpenProcess(query+vmread): %w", err)
	}
	defer syscall.CloseHandle(h)

	// PROCESS_BASIC_INFORMATION (x64): Reserved1, PebBaseAddress, Reserved2[2], UniqueProcessId, Reserved3
	var pbi [6]uintptr
	var retLen uint32
	status, _, _ := procNtQueryInformationProcess.Call(uintptr(h), 0,
		uintptr(unsafe.Pointer(&pbi[0])), unsafe.Sizeof(pbi), uintptr(unsafe.Pointer(&retLen)))
	if status != 0 {
		return "", fmt.Errorf("NtQueryInformationProcess status 0x%x", status)
	}
	peb := pbi[1]
	if peb == 0 {
		return "", fmt.Errorf("null PEB address")
	}
	read := func(addr uintptr, dst unsafe.Pointer, n uintptr) error {
		var got uintptr
		r1, _, e := procReadProcessMemory.Call(uintptr(h), addr, uintptr(dst), n, uintptr(unsafe.Pointer(&got)))
		if r1 == 0 || got != n {
			return fmt.Errorf("ReadProcessMemory(0x%x,%d): %v", addr, n, e)
		}
		return nil
	}
	// PEB.ProcessParameters at +0x20; RTL_USER_PROCESS_PARAMETERS.CommandLine (UNICODE_STRING) at +0x70
	var params uintptr
	if err := read(peb+0x20, unsafe.Pointer(&params), unsafe.Sizeof(params)); err != nil {
		return "", err
	}
	var us struct {
		Length, MaximumLength uint16
		_                     uint32
		Buffer                uintptr
	}
	if err := read(params+0x70, unsafe.Pointer(&us), unsafe.Sizeof(us)); err != nil {
		return "", err
	}
	if us.Length == 0 || us.Buffer == 0 {
		return "", fmt.Errorf("implausible command line length %d", us.Length)
	}
	w := make([]uint16, us.Length/2)
	if err := read(us.Buffer, unsafe.Pointer(&w[0]), uintptr(us.Length)); err != nil {
		return "", err
	}
	return string(utf16.Decode(w)), nil
}

func samePath(a, b string) bool {
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

// captureIdentity fills the identity fields of rec from the live process rec.PID.
func captureIdentity(rec *InstanceRecord) error {
	h, err := syscall.OpenProcess(processQueryLimitedInformation, false, uint32(rec.PID))
	if err != nil {
		return fmt.Errorf("cannot open launched process %d for identity capture: %w", rec.PID, err)
	}
	defer syscall.CloseHandle(h)
	ct, err := processCreationTime(h)
	if err != nil {
		return err
	}
	img, err := processImagePath(h)
	if err != nil {
		return err
	}
	rec.CreationTime = ct
	rec.ImagePath = img
	return nil
}

// verifyOwner classifies whether the recorded owner process is still the same live process.
// The returned string explains the classification (for status output and error messages).
func verifyOwner(rec InstanceRecord) (ProcState, string) {
	if rec.PID <= 0 {
		return ProcStopped, "no pid recorded"
	}
	h, err := syscall.OpenProcess(processQueryLimitedInformation, false, uint32(rec.PID))
	if err != nil {
		if en, ok := err.(syscall.Errno); ok && en == errorInvalidParameter {
			return ProcStopped, "no process with that pid"
		}
		return ProcUnknown, fmt.Sprintf("cannot open pid %d: %v", rec.PID, err)
	}
	defer syscall.CloseHandle(h)

	var exitCode uint32
	if err := syscall.GetExitCodeProcess(h, &exitCode); err != nil {
		return ProcUnknown, fmt.Sprintf("GetExitCodeProcess: %v", err)
	}
	if exitCode != stillActive {
		return ProcStopped, fmt.Sprintf("process exited (code %d)", exitCode)
	}
	if rec.CreationTime == 0 || rec.ImagePath == "" {
		return ProcUnknown, "legacy record without process identity (creation time/image path)"
	}
	ct, err := processCreationTime(h)
	if err != nil {
		return ProcUnknown, err.Error()
	}
	if ct != rec.CreationTime {
		return ProcStopped, "pid reused: creation time differs from record"
	}
	img, err := processImagePath(h)
	if err != nil {
		return ProcUnknown, err.Error()
	}
	if !samePath(img, rec.ImagePath) {
		return ProcStopped, "pid reused: image path differs from record"
	}
	cl, err := processCommandLine(uint32(rec.PID))
	if err != nil {
		// Creation time + image path already match; the profile cannot be read back.
		return ProcUnknown, "creation time and image match but command line unreadable: " + err.Error()
	}
	if !strings.Contains(strings.ToLower(cl), strings.ToLower(rec.ProfileDir)) {
		return ProcStopped, "pid reused: command line does not reference the recorded profile dir"
	}
	return ProcRunning, "creation time, image path and profile dir verified"
}
