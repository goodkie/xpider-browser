# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# P2 Build Volume Pre-flight & Safe DiskPart Script Generator
# STRICT AUDIT / DRY-RUN COMPLIANT: Generates script only with explicit parameters, does not write files in Dry-Run mode.

param(
    [string]$VhdPath = "E:\vivpr\ai\ebrowser\build_ntfs.vhdx",
    [string]$DriveLetter = "X",
    [int]$SizeMB = 250000,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

Write-Host "=== P2 VHDX Build Workspace Pre-flight Check ==="

# 1. Canonical Workspace Boundary Validation
$workspaceRoot = "E:\vivpr\ai\ebrowser"
$canonicalRoot = [System.IO.Path]::GetFullPath($workspaceRoot).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$canonicalVhdPath = [System.IO.Path]::GetFullPath($VhdPath)

if (-not $canonicalVhdPath.StartsWith($canonicalRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ABORT: VhdPath '$canonicalVhdPath' is outside workspace boundary '$canonicalRoot'."
}

if ([System.IO.Path]::GetExtension($canonicalVhdPath).ToLowerInvariant() -ne ".vhdx") {
    throw "ABORT: VhdPath must have '.vhdx' extension. Given: '$canonicalVhdPath'."
}

$parentDir = [System.IO.Path]::GetDirectoryName($canonicalVhdPath)
if (-not (Test-Path -LiteralPath $parentDir -PathType Container)) {
    throw "ABORT: Parent directory '$parentDir' does not exist."
}

Write-Host "Canonical Boundary Check: PASS ($canonicalVhdPath)"

# 2. Input Parameter Validation
if ($DriveLetter -notmatch '^[A-Za-z]$') {
    throw "ABORT: Invalid DriveLetter '$DriveLetter'. Must be a single letter A-Z."
}
$DriveLetter = $DriveLetter.ToUpper()

if ($SizeMB -lt 50000 -or $SizeMB -gt 500000) {
    throw "ABORT: SizeMB $SizeMB out of safe bounds (50,000 MB - 500,000 MB)."
}
$requiredBytes = [int64]$SizeMB * 1024 * 1024

# 3. Administrative Elevation Check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Administrative Elevation: $isAdmin"

# 4. Backing Volume & Space Calculations
$backingDrive = [System.IO.Path]::GetPathRoot($canonicalVhdPath).TrimEnd('\')
$backingVol = Get-Volume -DriveLetter $backingDrive[0]
Write-Host "Backing Volume: $($backingVol.DriveLetter): ($($backingVol.FileSystemLabel)) FileSystem: $($backingVol.FileSystem)"
Write-Host "Total Free Space on Backing Volume: $([math]::Round($backingVol.SizeRemaining/1GB, 1)) GB"
Write-Host "Planned Virtual Disk Maximum Size: $([math]::Round($requiredBytes/1GB, 1)) GB"

$projectedRemainingFree = $backingVol.SizeRemaining - $requiredBytes
Write-Host "Projected Free Space after Max Allocation: $([math]::Round($projectedRemainingFree/1GB, 1)) GB"

if ($projectedRemainingFree -lt 50GB) {
    throw "ABORT: Insufficient backing storage margin. Projected free space ($([math]::Round($projectedRemainingFree/1GB, 1)) GB) must remain >= 50GB."
}

# 5. Target Drive Letter Conflict Check
$existingDrive = Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue
if ($existingDrive) {
    throw "ABORT: Target drive letter '$DriveLetter`:' is already in use by $($existingDrive.Description) ($($existingDrive.Root))."
}
Write-Host "Target Drive Letter '$DriveLetter`:' Availability: FREE"

# 6. Existing Backing File Validation (Strict Abort per P2-UNBLOCK-05)
if (Test-Path -LiteralPath $canonicalVhdPath) {
    throw "ABORT: Backing file '$canonicalVhdPath' already exists. Re-attaching without verified identity is prohibited."
}
Write-Host "Backing File Exists Check: NONE (Safe for fresh creation)"

# 7. Safe Script Generation (Dry-Run Guard: Do NOT write file if -WhatIf is set)
$diskpartScriptPath = Join-Path $workspaceRoot "diskpart_p2_mount.txt"

$dpContent = @"
create vdisk file="$canonicalVhdPath" maximum=$SizeMB type=expandable
select vdisk file="$canonicalVhdPath"
attach vdisk
convert gpt
create partition primary
format fs=ntfs quick label="CHROMIUM_BUILD"
assign letter=$DriveLetter
"@

if ($WhatIf) {
    Write-Host "`n[DRY-RUN / HOLD] -WhatIf flag active. No script files written to disk."
    Write-Host "Proposed DiskPart Script Content:"
    $dpContent.Split("`n") | ForEach-Object { "  $_" }
    exit 0
}

Set-Content -LiteralPath $diskpartScriptPath -Value $dpContent -Encoding ASCII
Write-Host "`nGenerated Safe DiskPart Script at: $diskpartScriptPath"
Write-Host "[HOLD] Administrative execution is deferred pending Owner & ChatGPT review."
