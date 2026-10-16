@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 보조 도구창 (Companion Tool Window) 실행

echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [TASK]: 보조 도구창(Companion Tool Window, --app-url) 실행기
echo [안내]: 네이티브 사이드바 단일 프레임 도킹은 250GB Chromium C++ 빌드 전까지 미충족이며,
echo         본 도구창 모드를 통해 다중 확장 패널을 충돌 없이 동시 실행할 수 있습니다.
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
set "TARGET_URL=%~1"
if not "%TARGET_URL%"=="" goto LAUNCH

echo [실행할 확장프로그램 도구창을 선택하거나 직접 URL을 입력하세요]
echo.
echo  1. MV3 Fixture SidePanel (chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/sidepanel.html)
echo  2. MV3 Fixture Popup     (chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/popup.html)
echo  3. 직접 URL 또는 확장 경로 입력 (예: chrome-extension://[EXTENSION_ID]/sidepanel.html)
echo.
set /p "CHOICE=선택 번호 (1-3, 기본값 1): "
if defined CHOICE set "CHOICE=%CHOICE: =%"

if "%CHOICE%"=="2" goto CHOOSE_POPUP
if "%CHOICE%"=="3" goto CHOOSE_CUSTOM
set "TARGET_URL=chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/sidepanel.html"
goto LAUNCH

:CHOOSE_POPUP
set "TARGET_URL=chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/popup.html"
goto LAUNCH

:CHOOSE_CUSTOM
set /p "TARGET_URL=도구창 URL을 입력하세요: "
goto LAUNCH

:LAUNCH
echo.
echo [기동 시작]: LiteChromiumPortable.exe --instance 1 --app-url "%TARGET_URL%"
LiteChromiumPortable.exe --instance 1 --app-url "%TARGET_URL%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo ==============================================================================
if "%EXIT_CODE%"=="0" goto SUCCESS
echo [오류] 보조 도구창 기동 실패 (종료 코드: %EXIT_CODE%)
echo 문제 지속 시 '06_디버그_로그_관리.bat'을 실행하여 로그를 확인하세요.
echo ==============================================================================
echo.
pause
popd
exit /b %EXIT_CODE%

:SUCCESS
echo [완료] 보조 도구창이 성공적으로 기동되었습니다.
echo ==============================================================================
echo.
pause
popd
exit /b 0
