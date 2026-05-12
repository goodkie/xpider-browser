# ============================================================
# XPIDER Extension Snapshot Restorer
# 사용법: .\restore-snapshot.ps1
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExtDir      = $PSScriptRoot
$SnapshotBase = Join-Path $ExtDir "_snapshots"

if (-not (Test-Path $SnapshotBase)) {
    Write-Host "❌ 스냅샷 폴더가 존재하지 않습니다 ($SnapshotBase)" -ForegroundColor Red
    exit
}

$snapshots = Get-ChildItem -Path $SnapshotBase -Directory | Sort-Object Name -Descending

if ($snapshots.Count -eq 0) {
    Write-Host "❌ 저장된 스냅샷이 없습니다." -ForegroundColor Red
    exit
}

Write-Host "`n  📦 저장된 스냅샷 목록:" -ForegroundColor Cyan
for ($i = 0; $i -lt $snapshots.Count; $i++) {
    $snap = $snapshots[$i]
    $metaFile = Join-Path $snap.FullName "_meta.json"
    $memo = ""
    if (Test-Path $metaFile) {
        try {
            $meta = Get-Content $metaFile -Raw | ConvertFrom-Json
            $memo = if ($meta.memo) { " - $($meta.memo)" } else { "" }
        } catch {}
    }
    Write-Host "  [$i] $($snap.Name)$memo"
}

Write-Host ""
$choice = Read-Host "  ▶ 복원할 스냅샷 번호를 입력하세요 (취소: Enter)"
if ([string]::IsNullOrWhiteSpace($choice)) {
    Write-Host "  취소되었습니다." -ForegroundColor Yellow
    exit
}

$idx = [int]$choice
if ($idx -lt 0 -or $idx -ge $snapshots.Count) {
    Write-Host "❌ 잘못된 번호입니다." -ForegroundColor Red
    exit
}

$selectedSnap = $snapshots[$idx]

$confirm = Read-Host "  ⚠️ 현재 폴더의 내용은 삭제되고, [$($selectedSnap.Name)] 버전으로 덮어씁니다. 진행하시겠습니까? (y/N)"
if ($confirm -notmatch "^y|Y$") {
    Write-Host "  취소되었습니다." -ForegroundColor Yellow
    exit
}

# ── 복원 진행 ────────────────────────────────────────────────
$Targets = @(
    "google_maps_extension_source",
    "bing_map_source",
    "Email_Extractor_Source"
)

foreach ($target in $Targets) {
    $src = Join-Path $selectedSnap.FullName $target
    $dst = Join-Path $ExtDir $target

    if (Test-Path $src) {
        Write-Host "  ♻️  복원 중: $target..." -ForegroundColor Cyan
        
        # 기존 폴더 삭제
        if (Test-Path $dst) {
            Remove-Item -Path $dst -Recurse -Force
        }
        
        # 복사
        Copy-Item -Path $src -Destination $dst -Recurse -Force

        # ── 복원된 폴더의 읽기 전용 속성 해제 (편집 가능하게 만듦) ──
        Get-ChildItem -Path $dst -Recurse -File | ForEach-Object {
            $_.IsReadOnly = $false
        }
    }
}

Write-Host "`n  ✅ 복원 완료! (이제 코드를 편집할 수 있습니다)" -ForegroundColor Green
