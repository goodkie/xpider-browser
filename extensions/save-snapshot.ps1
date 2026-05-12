# ============================================================
# XPIDER Extension Snapshot Saver
# 사용법: .\save-snapshot.ps1 [-Memo "설명"]
# ============================================================
param(
    [string]$Memo = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExtDir      = $PSScriptRoot
$SnapshotBase = Join-Path $ExtDir "_snapshots"

# 백업할 익스텐션 폴더 목록
$Targets = @(
    "google_maps_extension_source",
    "bing_map_source",
    "Email_Extractor_Source"
)

# 타임스탬프 폴더명 생성
$ts      = Get-Date -Format "yyyyMMdd_HHmmss"
$suffix  = if ($Memo) { "_" + ($Memo -replace '[\\/:*?"<>|]', '_') } else { "" }
$snapDir = Join-Path $SnapshotBase ($ts + $suffix)

New-Item -ItemType Directory -Path $snapDir -Force | Out-Null

$saved = @()

foreach ($target in $Targets) {
    $src = Join-Path $ExtDir $target
    if (-not (Test-Path $src)) {
        Write-Host "  ⚠️  '$target' 폴더 없음, 건너뜀" -ForegroundColor Yellow
        continue
    }
    $dst = Join-Path $snapDir $target
    Write-Host "  📁 복사 중: $target → $snapDir" -ForegroundColor Cyan
    Copy-Item -Path $src -Destination $dst -Recurse -Force
    $saved += $target
}

$metaDict = @{}
$metaDict.timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
$metaDict.memo = $Memo
$metaDict.saved = $saved
$metaDict.snapshotDir = $snapDir
$meta = $metaDict | ConvertTo-Json -Depth 3
$meta | Set-Content -Path (Join-Path $snapDir "_meta.json") -Encoding UTF8

# ── 스냅샷 폴더 전체를 읽기 전용으로 잠금 ──────────────────
Write-Host "`n  🔒 스냅샷 폴더를 읽기 전용으로 잠그는 중..." -ForegroundColor Magenta
Get-ChildItem -Path $snapDir -Recurse -File | ForEach-Object {
    $_.IsReadOnly = $true
}

Write-Host "`n  ✅ 스냅샷 저장 완료!" -ForegroundColor Green
Write-Host "  📂 위치: $snapDir" -ForegroundColor White
Write-Host "  🗂️  저장된 폴더: $($saved -join ', ')" -ForegroundColor White

$snapshots = @(Get-ChildItem -Path $SnapshotBase -Directory | Sort-Object Name)
Write-Host "Total Snapshots: $($snapshots.Count)" -ForegroundColor DarkGray
