# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Boundary Check Unit Tests for setup_build_volume.ps1

$ErrorActionPreference = "Continue"

$testCases = @(
    @{ Name = "Normal inside path"; Path = "E:\vivpr\ai\ebrowser\build_ntfs.vhdx"; ExpectPass = $true },
    @{ Name = "Normal nested inside path"; Path = "E:\vivpr\ai\ebrowser\portable-minimal\test.vhdx"; ExpectPass = $true },
    @{ Name = "Sibling prefix directory (escape attempt)"; Path = "E:\vivpr\ai\ebrowser-other\test.vhdx"; ExpectPass = $false },
    @{ Name = "Parent traversal escape (..)"; Path = "E:\vivpr\ai\ebrowser\..\outside.vhdx"; ExpectPass = $false },
    @{ Name = "Wrong extension (.vhd)"; Path = "E:\vivpr\ai\ebrowser\build.vhd"; ExpectPass = $false },
    @{ Name = "Non-existent parent directory"; Path = "E:\vivpr\ai\ebrowser\non_existent_dir_12345\test.vhdx"; ExpectPass = $false }
)

$scriptPath = "E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1"

$allPassed = $true
foreach ($tc in $testCases) {
    $out = powershell -ExecutionPolicy Bypass -File $scriptPath -VhdPath $tc.Path -WhatIf 2>&1
    $exitCode = $LASTEXITCODE
    $passed = ($exitCode -eq 0)
    $matchesExpectation = ($passed -eq $tc.ExpectPass)
    
    if (-not $matchesExpectation) { $allPassed = $false }
    
    $statusStr = if ($matchesExpectation) { "PASS" } else { "FAIL" }
    Write-Host ("[{0}] {1}: Expected={2}, Got={3}" -f $statusStr, $tc.Name, $tc.ExpectPass, $passed)
    if (-not $passed) {
        $abortLine = ($out | Select-String "ABORT:").Line
        Write-Host "    $abortLine"
    }
}

if (-not $allPassed) {
    throw "Boundary unit test suite FAILED."
} else {
    Write-Host "`nAll 6 boundary validation unit tests PASSED."
}
