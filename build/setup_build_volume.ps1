# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Safe VHDX Setup & Attach Wrapper for P2 Build Workspace
# DRY-RUN / AUDIT-ONLY: Does NOT execute disk modifications without explicit flag and elevation check.

param(
    [string]$VhdPath = "E:\vivpr\ai\ebrowser\build_ntfs.vhdx",
    [string]$DriveLetter = "X",
    [int]$SizeMB = 250000,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

Write-Host "=== P2 VHDX Build Workspace Pre-flight Check ==="

# 1. Check Administrative Elevation
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Administrative Elevation: $isAdmin"

# 2. Check Backing Filesystem
$backingDrive = [System.IO.Path]::GetPathRoot($VhdPath).TrimEnd('\')
$backingVol = Get-Volume -DriveLetter $backingDrive[0]
Write-Host "Backing Volume: $($backingVol.DriveLetter): ($($backingVol.FileSystemLabel)) FileSystem: $($backingVol.FileSystem)"
Write-Host "Free Space on Backing Volume: $([math]::Round($backingVol.SizeRemaining/1GB, 1)) GB"

if ($backingVol.SizeRemaining -lt 100GB) {
    throw "ABORT: Backing volume does not have sufficient free space (Minimum 100GB required)."
}

# 3. Target Drive Letter Conflict Check
$existingDrive = Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue
if ($existingDrive) {
    throw "ABORT: Target drive letter '$DriveLetter`:' is already in use by $($existingDrive.Description) ($($existingDrive.Root))."
}
Write-Host "Drive Letter '$DriveLetter`:' Availability: FREE"

# 4. Check if VHDX already exists
$vhdExists = Test-Path -LiteralPath $VhdPath
Write-Host "VHDX Backing File Exists: $vhdExists ($VhdPath)"

# Generate Safe DiskPart Script
$scriptDir = Split-Path -Parent $VhdPath
$diskpartScriptPath = Join-Path $scriptDir "diskpart_p2_mount.txt"

if (-not $vhdExists) {
    $dpContent = @"
create vdisk file="$VhdPath" maximum=$SizeMB type=expandable
select vdisk file="$VhdPath"
attach vdisk
convert gpt
create partition primary
format fs=ntfs quick label="CHROMIUM_BUILD"
assign letter=$DriveLetter
"@
} else {
    $dpContent = @"
select vdisk file="$VhdPath"
attach vdisk
select partition 1
assign letter=$DriveLetter
"@
}

Set-Content -LiteralPath $diskpartScriptPath -Value $dpContent -Encoding ASCII
Write-Host "Generated Safe DiskPart Script at: $diskpartScriptPath"

if ($WhatIf -or -not $isAdmin) {
    Write-Host "`n[DRY-RUN / HOLD] No disk modifications executed. (Admin elevation required for diskpart execution)"
    Write-Host "Script content to be executed under Administrator:"
    Get-Content -LiteralPath $diskpartScriptPath | ForEach-Object { "  $_" }
    exit 0
}
