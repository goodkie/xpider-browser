@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 기본 브라우저 실행 (인스턴스 1)
echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [INFO]: 인스턴스 1 브라우저를 기동합니다...
echo ==============================================================================
echo.
cd /d "%~dp0"
LiteChromiumPortable.exe --instance 1
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo ==============================================================================
if %EXIT_CODE% EQU 0 (
    echo [완료] 브라우저 프로세스가 시작되었습니다. (PID 및 동작 로그가 기록됨)
) else (
    echo [오류] 브라우저 실행에 실패했습니다. (종료 코드: %EXIT_CODE%)
)
echo ==============================================================================
echo.
pause
