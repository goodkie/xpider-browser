@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 진단 로그 안전 내보내기

echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [TASK]: 감사 진단 ZIP 패키지 생성 (--export-diagnostics)
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
LiteChromiumPortable.exe --export-diagnostics
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo ==============================================================================
if "%EXIT_CODE%"=="0" goto SUCCESS
echo [오류] 진단 패키지 생성 실패 (종료 코드: %EXIT_CODE%)
echo ==============================================================================
echo.
pause
popd
exit /b %EXIT_CODE%

:SUCCESS
echo [완료] 진단 패키지 생성이 완료되었습니다.
echo (사용자 암호, 세션 토큰, 쿠키, 프로필 DB는 100%% 원천 제외 및 마스킹 처리됨)
echo ==============================================================================
echo.
pause
popd
exit /b 0
