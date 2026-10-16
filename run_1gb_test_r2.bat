@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 1GB Live Test Runner (R2)

echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [TASK]: 1GB Live Virtual Disk Execution Test (P2-1GB-LIVE-02)
echo ==============================================================================
echo.

:: Check for Administrator elevation
net session >nul 2>&1
if %errorlevel% equ 0 goto :RUN_TEST

echo [안내] 1GB 가상 디스크(VHDX) 테스트는 Windows 관리자 권한이 필요합니다.
echo.
echo ==============================================================================
echo [실행 방법]:
echo 1) run_1gb_test_r2.bat 파일에 마우스 우클릭을 합니다.
echo 2) [관리자 권한으로 실행]을 클릭해주세요.
echo ==============================================================================
echo.
echo 창을 닫으려면 아무 키나 누르세요...
pause >nul
exit /b

:RUN_TEST
echo [상태] 관리자 권한 확인 완료 (Elevated Administrator).
echo [진행] 1GB Live 테스트 (R2)를 시작합니다...
echo.

cd /d "E:\vivpr\ai\ebrowser\portable-minimal"
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\vivpr\ai\ebrowser\portable-minimal\tests\run_1gb_live_test_r2.ps1"
set TEST_EXIT=%errorlevel%

echo.
echo ==============================================================================
if %TEST_EXIT% equ 0 (
    echo [RESULT] 1GB Live Test (R2) PASSED successfully (Exit Code: 0).
) else (
    echo [RESULT] 1GB Live Test (R2) FAILED (Exit Code: %TEST_EXIT%).
)
echo Transcript: E:\vivpr\ai\ebrowser\portable-minimal\tests\1gb_live_test_r2_raw_transcript.txt
echo ==============================================================================
echo.
echo 테스트가 완료되었습니다. 창을 닫으려면 아무 키나 누르세요...
pause >nul
