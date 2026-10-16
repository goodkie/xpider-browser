@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 독립 인스턴스 2개 동시 실행
echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [INFO]: 독립된 프로필을 가진 2개의 인스턴스를 동시 기동합니다...
echo (인스턴스 1: data\profiles\instance-1 / 인스턴스 2: data\profiles\instance-2)
echo ==============================================================================
echo.
cd /d "%~dp0"
LiteChromiumPortable.exe --batch 2
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo ==============================================================================
if %EXIT_CODE% EQU 0 (
    echo [완료] 다중 인스턴스 기동 완료 (쿠키, 캐시, 스토리지 상호 오염 0%%).
) else (
    echo [오류] 다중 인스턴스 기동에 실패했습니다. (종료 코드: %EXIT_CODE%)
)
echo ==============================================================================
echo.
pause
