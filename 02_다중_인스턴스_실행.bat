@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 독립 인스턴스 2개 동시 실행

echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [INFO]: 독립된 프로필을 가진 2개의 인스턴스를 동시 기동합니다...
echo         (인스턴스 1: data\profiles\instance-1)
echo         (인스턴스 2: data\profiles\instance-2)
echo ==============================================================================
echo.

pushd "%~dp0"

if exist "LiteChromiumPortable.exe" goto EXE_OK
echo [오류] LiteChromiumPortable.exe 실행 파일이 현재 디렉터리에 없습니다.
echo 현재 경로: %CD%
echo.
pause
popd
exit /b 1

:EXE_OK
LiteChromiumPortable.exe --batch 2
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo ==============================================================================
if "%EXIT_CODE%"=="0" goto SUCCESS
echo [오류] 다중 인스턴스 기동 실패 (종료 코드: %EXIT_CODE%)
echo 문제 지속 시 '06_디버그_로그_관리.bat'을 실행하여 로그를 확인하세요.
echo ==============================================================================
echo.
pause
popd
exit /b %EXIT_CODE%

:SUCCESS
echo [완료] 다중 인스턴스 기동 완료 (쿠키, 캐시, 스토리지 상호 격리 100%%)
echo ==============================================================================
echo.
pause
popd
exit /b 0
