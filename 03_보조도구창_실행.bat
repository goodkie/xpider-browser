@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 확장 프로그램 보조 도구창 관리자 (v0.2.6)

pushd "%~dp0"

if exist "LiteChromiumPortable.exe" goto EXE_OK
echo [오류] LiteChromiumPortable.exe 실행 파일이 현재 디렉터리에 없습니다.
echo 현재 경로: %CD%
echo.
pause
popd
exit /b 1

:EXE_OK
set "INST=1"

if "%~1"=="" goto MENU_TOP
LiteChromiumPortable.exe --instance %INST% --launch-panel "%~1"
pause
goto EXIT_BAT

:MENU_TOP
cls
echo ==============================================================================
echo [Lite Chromium Portable] 확장 프로그램 보조 도구창 관리자
echo ==============================================================================
echo [현재 대상 브라우저 인스턴스]: #%INST%
echo [기술 안내]: 단일 창 내부 네이티브 사이드바 다중 도킹은 Chromium C++ Views
echo              레이아웃 한계로 UNMET 상태이며, 본 도구창 관리자를 통해 동일 확장의
echo              복제 패널 및 복수 확장을 독립된 도구창(윈도우)으로 실행합니다.
echo ==============================================================================
echo.

LiteChromiumPortable.exe --instance %INST% --list-extensions

echo [보조 도구창 실행 및 관리 명령어]
echo ------------------------------------------------------------------------------
echo  [1-10]     : 해당 번호의 확장 프로그램 도구창 실행 (기본 패널)
echo  [C 번호]   : 동일 확장 프로그램 "새 패널 추가(복제)" (예: C 4)
echo  [L]        : 현재 인스턴스 #%INST%에 열려 있는 보조 도구창 목록 확인
echo  [K 타깃ID] : 특정 보조 도구창 닫기 (예: K DC55F5B8874774A254E596E46C92E8D0)
echo  [I]        : 대상 인스턴스 번호 변경 (현재: #%INST%)
echo  [0]        : 종료
echo ------------------------------------------------------------------------------
echo.

set "CMD="
set /p "CMD=명령어를 입력하세요: "
if "%CMD%"=="" goto MENU_TOP

if "%CMD%"=="0" goto EXIT_BAT
if /i "%CMD%"=="Q" goto EXIT_BAT

if /i "%CMD%"=="I" goto CHANGE_INST
if /i "%CMD%"=="L" goto LIST_PANELS

if /i "%CMD:~0,2%"=="C " goto CLONE_PANEL
if /i "%CMD:~0,2%"=="c " goto CLONE_PANEL

if /i "%CMD:~0,2%"=="K " goto CLOSE_PANEL
if /i "%CMD:~0,2%"=="k " goto CLOSE_PANEL

echo.
echo [보조 도구창 실행 요청 중...] (인스턴스 #%INST%, 확장: %CMD%)
LiteChromiumPortable.exe --instance %INST% --launch-panel "%CMD%"
echo.
pause
goto MENU_TOP

:CLONE_PANEL
set "EXT_NUM=%CMD:~2%"
echo.
echo [동일 확장 프로그램 새 패널 추가 요청 중...] (인스턴스 #%INST%, 확장: %EXT_NUM%)
LiteChromiumPortable.exe --instance %INST% --launch-panel "%EXT_NUM%"
echo.
pause
goto MENU_TOP

:LIST_PANELS
echo.
LiteChromiumPortable.exe --instance %INST% --list-panels
echo.
pause
goto MENU_TOP

:CLOSE_PANEL
set "TGT_ID=%CMD:~2%"
echo.
echo [보조 도구창 닫기 요청 중...] (인스턴스 #%INST%, Target: %TGT_ID%)
LiteChromiumPortable.exe --instance %INST% --close-panel "%TGT_ID%"
echo.
pause
goto MENU_TOP

:CHANGE_INST
echo.
set "NEW_INST="
set /p "NEW_INST=변경할 인스턴스 번호를 입력하세요 (1-100, 현재: %INST%): "
if not "%NEW_INST%"=="" set "INST=%NEW_INST%"
goto MENU_TOP

:EXIT_BAT
popd
exit /b 0
