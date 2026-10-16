package main

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestComputeExtensionID_Fixture(t *testing.T) {
	fixtureKey := "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2X0zgttU350dtRONITWyAW3L1uJblWImciSzpB8PzGFTEJX7tZEup0JBkptjM+asiC/Q+x8YUH+ahducS6J4xUr8fxGDvk1ConHm8FV4XKaO2zUTVcwAjyDsx/Z0boZbJK+P6Zn1ZLRvmgyeJH22hoaVFZUBTiMDq9zEmHbr2CRJfzDYhYQ7PD3ViQKWictSWepWDNr77598f/N8fO/Nn72HCzp3sfpuNjXoljFu2hP+vo8pU/0Ctej1YrnAv0cHJuUwaMWA+8rCi9ldt5G9XS+4/BMkBi1i8v1gjCmSmizdd3cBzWxNjmX6P6T3hOBWWI8oUHQlueJuM4kJVydlOQIDAQAB"
	expectedID := "mpmmjhlclnpalhaeilhkfkacdjkkhkli"

	decoded, err := base64.StdEncoding.DecodeString(fixtureKey)
	if err != nil {
		t.Fatalf("base64 decode: %v", err)
	}
	h := sha256.Sum256(decoded)
	raw := h[:16]

	var b strings.Builder
	for _, by := range raw {
		b.WriteByte('a' + (by >> 4))
		b.WriteByte('a' + (by & 0x0f))
	}
	actualID := b.String()
	if actualID != expectedID {
		t.Fatalf("Expected ID %s, got %s", expectedID, actualID)
	}

	computed := computeExtensionID(fixtureKey, "")
	if computed != expectedID {
		t.Fatalf("computeExtensionID with key: expected %s, got %s", expectedID, computed)
	}
}

func TestComputeExtensionID_KeylessPath(t *testing.T) {
	testCases := []struct {
		path       string
		expectedID string
	}{
		{
			path:       `E:\vivpr\ai\ebrowser\portable-minimal\extensions\Email_Extractor_Source`,
			expectedID: "ilclknkanjmflccmlobiboakkhbomcmk",
		},
		{
			path:       `E:\vivpr\ai\ebrowser\portable-minimal\extensions\UltraSolverPro`,
			expectedID: "bfgbdhmljeadpfpnigblmdngnaoianla",
		},
		{
			path:       `E:\vivpr\ai\ebrowser\portable-minimal\extensions\proxy`,
			expectedID: "nfikoffdlalelmnkdpbndlkjeekchioh",
		},
	}

	for _, tc := range testCases {
		id := computeExtensionID("", tc.path)
		if id != tc.expectedID {
			t.Errorf("Path %s: expected %s, got %s", tc.path, tc.expectedID, id)
		}
	}
}

func TestGenerateUniquePanelID(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 1000; i++ {
		id := generateUniquePanelID()
		if seen[id] {
			t.Fatalf("Duplicate panel ID generated: %s", id)
		}
		seen[id] = true
	}
}

func TestURLPreservation(t *testing.T) {
	baseRaw := "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/sidepanel.html?existing=true#section1"
	u, err := url.Parse(baseRaw)
	if err != nil {
		t.Fatalf("url.Parse: %v", err)
	}
	q := u.Query()
	q.Set("panel_id", "p_123")
	u.RawQuery = q.Encode()

	finalURL := u.String()
	if !strings.Contains(finalURL, "existing=true") {
		t.Errorf("existing query lost: %s", finalURL)
	}
	if !strings.Contains(finalURL, "panel_id=p_123") {
		t.Errorf("panel_id missing: %s", finalURL)
	}
	if !strings.Contains(finalURL, "#section1") {
		t.Errorf("fragment lost: %s", finalURL)
	}
}

func TestGetTCPListeningPID(t *testing.T) {
	// 1. Open a temporary local TCP listener
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen failed: %v", err)
	}
	defer l.Close()

	port := l.Addr().(*net.TCPAddr).Port

	// 2. Query listener PID via GetExtendedTcpTable
	pid, err := getTCPListeningPID(port)
	if err != nil {
		t.Fatalf("getTCPListeningPID(%d) failed: %v", port, err)
	}
	myPID := uint32(os.Getpid())
	if pid != myPID {
		t.Fatalf("Expected PID %d, got %d", myPID, pid)
	}

	// 3. Query unused port -> expect error
	_, err = getTCPListeningPID(59999)
	if err == nil {
		t.Fatalf("Expected error for unused port 59999, got nil")
	}
}

func TestVerifyInstanceOwnership_AlienProcessRejection(t *testing.T) {
	// 1. Open a TCP listener owned by this test process
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen failed: %v", err)
	}
	defer l.Close()

	port := l.Addr().(*net.TCPAddr).Port

	// 2. Case A: Registry does not have this instance
	tmpDir := t.TempDir()
	regPath := filepath.Join(tmpDir, "instances.json")
	if err := os.WriteFile(regPath, []byte(`{"instances":[]}`), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	err = verifyInstanceOwnership(1, port, regPath)
	if err == nil || !strings.Contains(err.Error(), "refuse to hijack alien process") {
		t.Fatalf("Expected 'refuse to hijack alien process' error, got: %v", err)
	}

	// 3. Case B: Registry has instance 1, but with an alien PID
	fakeAlienPID := os.Getpid() + 99999
	regContent := fmt.Sprintf(`{"instances":[{"instance_id":1,"pid":%d,"profile_dir":"%s"}]}`,
		fakeAlienPID, strings.ReplaceAll(tmpDir, `\`, `\\`))
	if err := os.WriteFile(regPath, []byte(regContent), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	err = verifyInstanceOwnership(1, port, regPath)
	if err == nil || (!strings.Contains(err.Error(), "refuse to control alien process") && !strings.Contains(err.Error(), "refuse to control unverified process")) {
		t.Fatalf("Expected alien/unverified process refusal error, got: %v", err)
	}
}

