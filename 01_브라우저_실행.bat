@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 기본 브라우저 실행 (인스턴스 1)

echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [INFO]: 인스턴스 1 브라우저를 기동합니다...
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
LiteChromiumPortable.exe --instance 1
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo ==============================================================================
if "%EXIT_CODE%"=="0" goto SUCCESS
echo [오류] 브라우저 실행 실패 (종료 코드: %EXIT_CODE%)
echo 문제 지속 시 '06_디버그_로그_관리.bat'을 실행하여 로그를 확인하세요.
echo ==============================================================================
echo.
pause
popd
exit /b %EXIT_CODE%

:SUCCESS
echo [완료] 브라우저 프로세스가 시작되었습니다. (PID 및 동작 로그 기록됨)
echo ==============================================================================
echo.
pause
popd
exit /b 0
