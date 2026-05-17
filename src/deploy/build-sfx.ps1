$ErrorActionPreference = "Stop"

Write-Host "=== XPIDER SFX Build ===" -ForegroundColor Cyan

# 1. 포터블 ZIP 파일 찾기
$zipFile = Get-ChildItem "out\make\zip\win32\x64\*.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $zipFile) {
    $zipFile = Get-ChildItem "out\make\*.zip" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
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

# 3. NuGet 복원 + Release 빌드
$csprojPath = Join-Path $setupProjDir "XpiderSetup.csproj"
Write-Host "Restoring packages..." -ForegroundColor Yellow
& dotnet restore $csprojPath --verbosity quiet

Write-Host "Building (Release)..." -ForegroundColor Yellow
& dotnet build $csprojPath -c Release --no-restore

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

# 6. .exe.config 파일 복사 (바인딩 리다이렉트 - 핵심!)
#    없으면 app.config 직접 사용
$configDestPath = $exeDestPath + ".config"

if (Test-Path $compiledConfig) {
    Write-Host "Copying .exe.config -> $configDestPath" -ForegroundColor Green
    Copy-Item -Path $compiledConfig -Destination $configDestPath -Force
} else {
    Write-Warning ".exe.config not found. Writing fallback binding redirect config..."
    $src_appConfig = Join-Path $setupProjDir "app.config"
    if (Test-Path $src_appConfig) {
        Copy-Item -Path $src_appConfig -Destination $configDestPath -Force
        Write-Host "Copied app.config -> $configDestPath" -ForegroundColor Green
    }
}

# 7. 검증
Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Cyan
Write-Host "  EXE    : $exeDestPath ($([math]::Round((Get-Item $exeDestPath).Length/1MB,1)) MB)"
if (Test-Path $configDestPath) {
    Write-Host "  CONFIG : $configDestPath (OK)" -ForegroundColor Green
} else {
    Write-Warning "  CONFIG : NOT FOUND - users may hit System.IO.Compression error!"
}
