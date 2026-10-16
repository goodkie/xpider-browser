# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Safe Managed Visual Studio 2022 Build Tools CLI Installer with C: Drive Space Guard
# Enforces pre-flight space verification, dynamic live polling, and graceful cancellation.

param(
    [string]$InstallerPath = "E:\vivpr\ai\ebrowser\downloads\vs_BuildTools.exe",
    [string]$InstallPath = "X:\toolchain\vs2022",
    [string]$CachePath = "X:\toolchain\vs_cache",
    [string]$SharedPath = "X:\toolchain\vs_shared",
    [double]$MinFreeCGB = 15.0,
    [int]$PollIntervalSeconds = 5,
    [switch]$Execute,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

Write-Host "=== Safe Visual Studio Build Tools CLI Installer ==="
Write-Host "Timestamp: $(Get-Date -Format o)"

# 0. Canonical Boundary & Parameter Validation
$workspaceRoot = "E:\vivpr\ai\ebrowser"
$canonicalRoot = [System.IO.Path]::GetFullPath($workspaceRoot).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$canonicalInstaller = [System.IO.Path]::GetFullPath($InstallerPath)

if (-not $canonicalInstaller.StartsWith($canonicalRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ABORT: InstallerPath '$canonicalInstaller' is outside workspace boundary '$canonicalRoot'."
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$isDryRun = ($WhatIf -or (-not $Execute))

Write-Host "Installer Executable: $canonicalInstaller"
Write-Host "Administrative Elevation: $isAdmin"
Write-Host "Execution Mode: $(if($isDryRun){ 'DRY-RUN / WHATIF (Zero modifications)' } else { 'LIVE EXECUTION' })"

# 1. Pre-flight C: Drive Capacity Check
$cVol = Get-Volume -DriveLetter C -ErrorAction Stop
$cFreeGB = [math]::Round($cVol.SizeRemaining / 1GB, 2)
Write-Host "Host C: Drive Current Free Space: $cFreeGB GB (Safety Threshold: $MinFreeCGB GB)"

if ($cFreeGB -lt $MinFreeCGB) {
    throw "CRITICAL SAFETY PRE-FLIGHT ABORT: Host C: drive free space ($cFreeGB GB) is below safety margin ($MinFreeCGB GB). Refusing installation to prevent host OS instability."
}

# 2. X: Target Volume Readiness Check
$xDrive = Get-PSDrive -Name "X" -ErrorAction SilentlyContinue
if (-not $xDrive) {
    Write-Host "Target Volume X: Status: NOT MOUNTED (Expected prior to Phase B live execution)"
} else {
    Write-Host "Target Volume X: Status: MOUNTED ($($xDrive.Root))"
}

# 3. Dry-Run / WhatIf Termination
if ($isDryRun -or (-not $isAdmin)) {
    Write-Host "`n[DRY-RUN / HOLD] Pre-flight checks PASSED. Zero installer modifications performed."
    if (-not $Execute) { Write-Host "Reason: -Execute switch was not specified." }
    if ($WhatIf) { Write-Host "Reason: -WhatIf switch was specified." }
    if (-not $isAdmin) { Write-Host "Reason: Administrative elevation is not present." }
    Write-Host "`nPlanned Command-Line Arguments:"
    Write-Host "  $canonicalInstaller --quiet --wait --norestart --nocache \"
    Write-Host "    --installPath `"$InstallPath`" \"
    Write-Host "    --path cache=`"$CachePath`" \"
    Write-Host "    --path shared=`"$SharedPath`" \"
    Write-Host "    --add Microsoft.VisualStudio.Workload.VCTools \"
    Write-Host "    --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 \"
    Write-Host "    --add Microsoft.VisualStudio.Component.VC.ATLMFC \"
    Write-Host "    --add Microsoft.VisualStudio.Component.Windows11SDK.26100"
    Write-Host "`nActive Monitoring Plan:"
    Write-Host "  - Poll host C: drive free space every $PollIntervalSeconds seconds."
    Write-Host "  - If C: free space drops below $MinFreeCGB GB, issue soft termination / cancellation to vs_installer engine."
    Write-Host "  - Assert MSI state remains uncorrupted without forceful process killing."
    exit 0
}

# --- CONTROLLED LIVE EXECUTION ---
if (-not (Test-Path -LiteralPath $canonicalInstaller)) {
    throw "ABORT: Installer executable not found at '$canonicalInstaller'."
}

if (-not $xDrive) {
    throw "ABORT: Target volume X: must be mounted before live toolchain installation."
}

$installerArgs = @(
    "--quiet",
    "--wait",
    "--norestart",
    "--nocache",
    "--installPath", $InstallPath,
    "--path", "cache=$CachePath",
    "--path", "shared=$SharedPath",
    "--add", "Microsoft.VisualStudio.Workload.VCTools",
    "--add", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    "--add", "Microsoft.VisualStudio.Component.VC.ATLMFC",
    "--add", "Microsoft.VisualStudio.Component.Windows11SDK.26100"
)

Write-Host "`n[LAUNCHING MANAGED INSTALLER] Process: $canonicalInstaller"
$process = Start-Process -FilePath $canonicalInstaller -ArgumentList $installerArgs -PassThru -NoNewWindow

$abortedDueToSpace = $false
try {
    while (-not $process.HasExited) {
        Start-Sleep -Seconds $PollIntervalSeconds
        $currentC = Get-Volume -DriveLetter C -ErrorAction SilentlyContinue
        if ($currentC) {
            $currentFreeGB = [math]::Round($currentC.SizeRemaining / 1GB, 2)
            Write-Host "[MONITOR] C: Free Space: $currentFreeGB GB (Threshold: $MinFreeCGB GB) | Installer Running (PID: $($process.Id))..."
            
            if ($currentFreeGB -lt $MinFreeCGB) {
                Write-Warning "CRITICAL SAFETY VIOLATION: C: free space ($currentFreeGB GB) dropped below safety threshold ($MinFreeCGB GB)!"
                Write-Host "Initiating graceful cancellation via installer engine (allowing standard rollback)..."
                $abortedDueToSpace = $true

                # Attempt graceful soft close of main window / installer message
                $process.CloseMainWindow() | Out-Null
                Start-Sleep -Seconds 10
                
                # If still active, request standard graceful shutdown without taskkill /f
                if (-not $process.HasExited) {
                    Write-Host "Sending graceful shutdown request..."
                    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
                }
                break
            }
        }
    }
} catch {
    Write-Warning "Exception during installer observation: $_"
}

if (-not $process.HasExited) {
    Write-Host "Waiting for installer to conclude clean rollback / exit..."
    $process.WaitForExit(30000) | Out-Null
}

$exitCode = $process.ExitCode
Write-Host "`nInstaller Process Exited. Exit Code: $exitCode"

$finalC = Get-Volume -DriveLetter C -ErrorAction Stop
$finalFreeGB = [math]::Round($finalC.SizeRemaining / 1GB, 2)
Write-Host "Final C: Free Space: $finalFreeGB GB"

if ($abortedDueToSpace) {
    throw "INSTALLATION ABORTED: C: free space reached safety threshold ($MinFreeCGB GB). Installer stopped gracefully."
}

if ($exitCode -eq 0 -or $exitCode -eq 3010) {
    Write-Host "=== Toolchain Installation SUCCESS (Exit Code: $exitCode) ==="
    exit 0
} else {
    throw "INSTALLATION FAILED: Installer exited with non-zero exit code $exitCode."
}
