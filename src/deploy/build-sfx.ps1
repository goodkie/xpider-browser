$ErrorActionPreference = "Stop"

Write-Host "=== XPIDER SFX Build ===" -ForegroundColor Cyan

# 1. 포터블 ZIP 파일 찾기 (가장 최근에 생성/수정된 파일 우선 정렬)
$zipFile = Get-ChildItem "out\make\zip\win32\x64\*.zip" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $zipFile) {
    $zipFile = Get-ChildItem "out\make\*.zip" -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $zipFile) {
    Write-Error "ZIP file not found."
    exit 1
}

$zipPath = $zipFile.FullName
Write-Host "Found ZIP: $zipPath" -ForegroundColor Green

$exeName   = $zipFile.Name.Replace(".zip", "-Setup.exe")
$exeDestPath = Join-Path $zipFile.DirectoryName $exeName

# 2. 리소스 폴더에 ZIP 복사
$setupProjDir = "src\deploy\XpiderSetup"
$resourcesDir = Join-Path $setupProjDir "Resources"
if (-not (Test-Path $resourcesDir)) { New-Item -ItemType Directory -Path $resourcesDir | Out-Null }

$targetZip = Join-Path $resourcesDir "app.zip"
Write-Host "Copying ZIP to resources: $targetZip"
Copy-Item -Path $zipPath -Destination $targetZip -Force

# 3. Release 빌드 (내장 MSBuild.exe 활용)
$csprojPath = Join-Path $setupProjDir "XpiderSetup.csproj"
$msbuildPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe"

Write-Host "Building C# Setup with internal MSBuild (Release)..." -ForegroundColor Yellow
& $msbuildPath $csprojPath /p:Configuration=Release /t:Rebuild

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build FAILED."
    exit 1
}

# 4. 빌드 결과물 찾기
$buildDir   = Join-Path $setupProjDir "bin\Release\net48"
$compiledExe    = Join-Path $buildDir "XPIDER-Setup.exe"
$compiledConfig = Join-Path $buildDir "XPIDER-Setup.exe.config"

if (-not (Test-Path $compiledExe)) {
    $buildDir   = Join-Path $setupProjDir "bin\Release"
    $compiledExe    = Join-Path $buildDir "XPIDER-Setup.exe"
    $compiledConfig = Join-Path $buildDir "XPIDER-Setup.exe.config"
}
if (-not (Test-Path $compiledExe)) {
    Write-Error "Compiled EXE not found at $compiledExe"
    exit 1
}

# 5. EXE 복사
Write-Host "Copying EXE -> $exeDestPath" -ForegroundColor Green
Copy-Item -Path $compiledExe -Destination $exeDestPath -Force

# 6. 검증
Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Cyan
Write-Host "  EXE    : $exeDestPath ($([math]::Round((Get-Item $exeDestPath).Length/1MB,1)) MB)"
