@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 인스턴스 실행 상태 점검

echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [TASK]: 활성 브라우저 인스턴스 레지스트리 점검 (--status)
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
LiteChromiumPortable.exe --status
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo ==============================================================================
pause
popd
exit /b %EXIT_CODE%
