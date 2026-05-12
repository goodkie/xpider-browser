# ============================================================
# XPIDER Full Project Restore Point Creator
# ============================================================
$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$SnapshotBase = Join-Path $ProjectRoot "_snapshots_full"

# Create snapshot base directory if it doesn't exist
if (-not (Test-Path $SnapshotBase)) {
    New-Item -ItemType Directory -Path $SnapshotBase -Force | Out-Null
}

# Timestamp for the snapshot
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$snapDir = Join-Path $SnapshotBase ("FullSnapshot_" + $ts)

New-Item -ItemType Directory -Path $snapDir -Force | Out-Null

Write-Host "🚀 Creating full restore point in: $snapDir" -ForegroundColor Cyan

# Items to copy from root
$Targets = @(
    "src",
    "extensions",
    "package.json",
    "package-lock.json",
    "forge.config.js",
    "index.html",
    ".github"
)

foreach ($target in $Targets) {
    $src = Join-Path $ProjectRoot $target
    if (Test-Path $src) {
        $dst = Join-Path $snapDir $target
        Write-Host "  📦 Backing up: $target" -ForegroundColor Gray
        
        if ($target -eq "extensions") {
            # Copy extensions but exclude existing snapshots to avoid recursion
            New-Item -ItemType Directory -Path $dst -Force | Out-Null
            Get-ChildItem -Path $src -Exclude "_snapshots" | ForEach-Object {
                Copy-Item -Path $_.FullName -Destination $dst -Recurse -Force
            }
        } else {
            Copy-Item -Path $src -Destination $dst -Recurse -Force
        }
    }
}

# Create metadata
$meta = @{
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    description = "Full project restore point (Browser + Extensions)"
    version = "4.9.0"
} | ConvertTo-Json

$meta | Set-Content -Path (Join-Path $snapDir "_meta.json") -Encoding UTF8

# Lock the snapshot (Read-only)
Write-Host "  🔒 Locking snapshot files..." -ForegroundColor DarkGray
Get-ChildItem -Path $snapDir -Recurse -File | ForEach-Object {
    $_.IsReadOnly = $true
}

Write-Host "`n✅ Full Restore Point created successfully!" -ForegroundColor Green
Write-Host "📂 Path: $snapDir" -ForegroundColor White
