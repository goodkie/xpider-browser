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

# 3. NuGet 복원 후 dotnet build 실행 (Release 모드)
$csprojPath = Join-Path $setupProjDir "XpiderSetup.csproj"
Write-Host "Restoring NuGet packages for $csprojPath..."
& dotnet restore $csprojPath

Write-Host "Building $csprojPath..."
& dotnet build $csprojPath -c Release

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build the SFX project."
    exit 1
}

# 4. 빌드된 EXE 파일 복사
# .NET 4.8 타겟이므로 bin\Release\net48\ 에 위치합니다.
$compiledExe = Join-Path $setupProjDir "bin\Release\net48\XPIDER-Setup.exe"
$compiledConfig = Join-Path $setupProjDir "bin\Release\net48\XPIDER-Setup.exe.config"

if (-not (Test-Path $compiledExe)) {
    # 대체 경로 탐색
    $compiledExe    = Join-Path $setupProjDir "bin\Release\XPIDER-Setup.exe"
    $compiledConfig = Join-Path $setupProjDir "bin\Release\XPIDER-Setup.exe.config"
}

if (-not (Test-Path $compiledExe)) {
    Write-Error "Compiled executable not found at $compiledExe"
    exit 1
}

Write-Host "Moving compiled EXE to $exeDestPath"
Copy-Item -Path $compiledExe -Destination $exeDestPath -Force

# 바인딩 리다이렉트 설정 파일도 함께 복사 (System.IO.Compression 버전 충돌 방지 핵심)
$configDestPath = $exeDestPath + ".config"
if (Test-Path $compiledConfig) {
    Write-Host "Copying binding redirect config to $configDestPath"
    Copy-Item -Path $compiledConfig -Destination $configDestPath -Force
} else {
    Write-Warning "No .config file found. Generating minimal binding redirect config..."
    $minimalConfig = @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <startup>
    <supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/>
  </startup>
  <runtime>
    <assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1">
      <dependentAssembly>
        <assemblyIdentity name="System.IO.Compression" publicKeyToken="b77a5c561934e089" culture="neutral"/>
        <bindingRedirect oldVersion="0.0.0.0-4.2.0.0" newVersion="4.2.0.0"/>
      </dependentAssembly>
      <dependentAssembly>
        <assemblyIdentity name="System.IO.Compression.ZipFile" publicKeyToken="b77a5c561934e089" culture="neutral"/>
        <bindingRedirect oldVersion="0.0.0.0-4.0.1.0" newVersion="4.0.1.0"/>
      </dependentAssembly>
    </assemblyBinding>
  </runtime>
</configuration>
"@
    $minimalConfig | Out-File -FilePath $configDestPath -Encoding UTF8
    Write-Host "Minimal binding redirect config created at $configDestPath"
}

Write-Host "Successfully created setup executable: $exeDestPath"

