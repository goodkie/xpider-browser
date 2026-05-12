$ErrorActionPreference = 'Stop';
$SnapshotPath = 'e:\vivpr\ai\browser\_snapshots_full\FullSnapshot_20260504_174311';
$TargetDir = 'e:\vivpr\ai\browser';

Write-Host "🗑️ Cleaning up current files for snapshot restoration...";
$ItemsToRestore = @('src', 'extensions', '.github', 'package.json', 'package-lock.json', 'forge.config.js');

foreach ($item in $ItemsToRestore) {
    $p = Join-Path $TargetDir $item
    if (Test-Path $p) {
        Write-Host "  Removing: $item"
        Remove-Item -Path $p -Recurse -Force
    }
}

Write-Host "📦 Restoring from snapshot: 20260504_174311...";
foreach ($item in $ItemsToRestore) {
    $src = Join-Path $SnapshotPath $item
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $TargetDir -Recurse -Force
    }
}

Write-Host "✅ Restoration from snapshot complete!";
