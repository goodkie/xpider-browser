$ErrorActionPreference = "Stop"

Write-Host "Starting SFX Build process using standard C# project..."

# 1. 포터블 ZIP 파일 찾기
$zipFile = Get-ChildItem "out\make\zip\win32\x64\*.zip" | Select-Object -First 1

if (-not $zipFile) {
    $zipFile = Get-ChildItem "out\make\*.zip" -Recurse | Select-Object -First 1
}

if (-not $zipFile) {
    Write-Error "ZIP file not found."
    exit 1
}

$zipPath = $zipFile.FullName
Write-Host "Found ZIP file: $zipPath"

$exeName = $zipFile.Name.Replace(".zip", "-Setup.exe")
$exeDestPath = Join-Path $zipFile.DirectoryName $exeName

# 2. XpiderSetup 리소스 폴더에 복사
$setupProjDir = "src\deploy\XpiderSetup"
$resourcesDir = Join-Path $setupProjDir "Resources"

if (-not (Test-Path $resourcesDir)) {
    New-Item -ItemType Directory -Path $resourcesDir | Out-Null
}

$targetZip = Join-Path $resourcesDir "app.zip"
Write-Host "Copying ZIP to Resources folder: $targetZip"
Copy-Item -Path $zipPath -Destination $targetZip -Force

# 3. dotnet build 실행 (Release 모드)
$csprojPath = Join-Path $setupProjDir "XpiderSetup.csproj"
Write-Host "Building $csprojPath..."

# Build using dotnet CLI
& dotnet build $csprojPath -c Release

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build the SFX project."
    exit 1
}

# 4. 빌드된 EXE 파일 복사
# .NET 4.8 타겟이므로 bin\Release\net48\ 에 위치합니다.
$compiledExe = Join-Path $setupProjDir "bin\Release\net48\XPIDER-Setup.exe"

if (-not (Test-Path $compiledExe)) {
    # 대체 경로 탐색
    $compiledExe = Join-Path $setupProjDir "bin\Release\XPIDER-Setup.exe"
}

if (-not (Test-Path $compiledExe)) {
    Write-Error "Compiled executable not found at $compiledExe"
    exit 1
}

Write-Host "Moving compiled EXE to $exeDestPath"
Copy-Item -Path $compiledExe -Destination $exeDestPath -Force

Write-Host "Successfully created setup executable: $exeDestPath"
