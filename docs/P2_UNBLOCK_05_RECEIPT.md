[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

[ANTIGRAVITY][RECEIPT][Lite Chromium Portable][P2-UNBLOCK-05 RESPONSE]

ChatGPT 감사 및 지시 [P2-UNBLOCK-05]에 대한 정확한 기술 검증 원시 로그, preflight 스크립트 수정/커밋 및 근거 보강 보고서입니다.

---

### 1. Win32 VHDX Probe 원본 소스, DeviceId 정정 및 원시 실행 출력

ChatGPT 지적대로 Microsoft 공식 VIRTUAL_STORAGE_TYPE 명세상 `DeviceId = 2`는 VHD(legacy)이며, **`DeviceId = 3`이 VHDX (`VIRTUAL_STORAGE_TYPE_DEVICE_VHDX`)**입니다.
API parameter `Version = 2` (`CREATE_VIRTUAL_DISK_PARAMETERS` struct version for VHDX)와 함께 `DeviceId = 3`으로 즉시 수정하여 실측 probe를 재실행했습니다.

#### A. 실행된 C# / PowerShell 원본 소스 요약
- `DeviceId`: `3` (`VIRTUAL_STORAGE_TYPE_DEVICE_VHDX`)
- `VendorId`: `{ec984aec-aabf-4e96-97e4-41603122c011}` (`VIRTUAL_STORAGE_TYPE_VENDOR_MICROSOFT`)
- `ParamVersion`: `2` (`CREATE_VIRTUAL_DISK_VERSION_2`)
- `Target Path`: `E:\vivpr\ai\ebrowser\probe_vhdx_raw_test.vhdx` (exFAT 볼륨)

#### B. 실제 원시 콘솔 출력 (Raw Output)
```text
DeviceId       : 3
VendorId       : ec984aec-aabf-4e96-97e4-41603122c011
ParamVersion   : 2
Win32ErrorCode : 0
Hex            : 0x0
FileCreated    : True
FileSize       : 4194304
HeaderMagic    : vhdxfile
```
- **해석 및 입증**:
  - `Win32ErrorCode: 0` (`ERROR_SUCCESS`).
  - 생성된 파일의 첫 8바이트 헤더 매직이 **`vhdxfile`** (공식 VHDX 파일 시그니처)임을 확인했습니다.
  - 테스트 직후 핸들 닫기(`CloseHandle`) 및 파일 완전 삭제를 완료하여 잔여물이 남지 않음을 검증했습니다.
- **상태 구분**:
  - **VHDX 파일 생성 (exFAT 호스팅)**: **실측 입증 완료**
  - **Attach / NTFS 초기화 / 마운트 / I/O**: **HOLD 유지 (미실행/미검증)**

---

### 2. Preflight & Script Generator 스크립트 정밀 보강 및 커밋 완료

ChatGPT의 4가지 안전 요구사항을 완전히 반영하여 스크립트를 업데이트하고 원격 push를 완료했습니다.

- **스크립트 파일**: [`portable-minimal/build/setup_build_volume.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/build/setup_build_volume.ps1)
- **원격 커밋 SHA**: `fae09d1` (`fix(p2-build): refine setup_build_volume.ps1 with strict canonical check, WhatIf zero-write, and abort on existing file`)
- **보강된 내용**:
  1. **Canonical 경로 경계 검사**: `[System.IO.Path]::GetFullPath($VhdPath)`가 `E:\vivpr\ai\ebrowser`로 시작하는지 검증, 불일치 시 `throw ABORT`.
  2. **입력 파라미터 엄격 검증**: `DriveLetter` 단일 알파벳 정규식(`^[A-Za-z]$`), `SizeMB` 안전 범위(50,000 ~ 500,000 MB) 검증.
  3. **기존 파일 엄격 중단**: `Test-Path $canonicalVhdPath`가 True이면 신원 불분명 재연결을 시도하지 않고 즉시 `throw ABORT`.
  4. **전체 공간 및 잔여 여유 계산**: 250,000 MB(244.1 GB) 계획 할당 후에도 최소 50 GB 이상의 잔여 여유 공간(실제 계산: **283.4 GB 잔여**)이 남는지 검증.
  5. **WhatIf 시 Zero-Write 보장**: `-WhatIf` 활성화 시 디스크에 `.txt` 스크립트 파일을 일체 쓰지 않고 콘솔 미리보기만 출력 (`Test-Path`로 파일 미작성 실측 검증 완료).

---

### 3. VS/SDK 설치 계획의 추정 구분 및 공식 근거

1. **설치 위치별 용량 구분 (근거 표기)**:
   - Microsoft 공식 문서 ([Command-line parameters to install Visual Studio](https://learn.microsoft.com/en-us/visualstudio/install/use-command-line-parameters-to-install-visual-studio)):
     - `--installPath <dir>`: 제품 핵심 파일 설치 위치 (지정 가능)
     - `--sharedInstallationPath <dir>` / `--packageCachePath <dir>`: 공유 구성요소 및 다운로드 캐시
   - **추정 명시 (ESTIMATE)**:
     - 공식 설치기 동작상 `C:\Program Files (x86)\Microsoft Visual Studio\Installer`와 `C:\ProgramData\Microsoft\VisualStudio\Packages` 및 Windows 레지스트리는 시스템 C: 드라이브에 강제 쓰기가 발생합니다.
     - 따라서 "C: 소모 1.5~2.5GB"는 **동일 워크로드의 일반적 설치 통계에 근거한 현실적 추정치(ESTIMATE)**이며, 실제 설치기 실행 전 확정 수치가 아님을 명시합니다.
2. **Pinned Chromium 도구 요건 공식 링크**:
   - Chromium Windows Build Prerequisites: https://chromium.googlesource.com/chromium/src/+/73c14f6228d7cd537c855007e8f88678969cc0eb/docs/windows_build_instructions.md
   - 공식 요구사항: Windows 10/11 x64, Visual Studio 2022 (>=17.4), Windows 11 SDK (>=10.0.22621.0).

---

### 4. 현재 상태 요약

- **원격 커밋**: `fae09d1` (preflight 스크립트 정밀화) 원격 push 완료
- **Gate**: P1A 완료 유지 / P2 환경 검증 미완료 및 관리자 실행/설치 일체 HOLD 유지
- **다음 보고 시각**: **2026-10-04 23:00 EDT** (약 20분 후 정기 보고 예정)
