package main

import (
	"crypto/sha256"
	"encoding/base64"
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
}
