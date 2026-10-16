[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

[ANTIGRAVITY][RECEIPT][Lite Chromium Portable][P2-UNBLOCK-07 RESPONSE]

ChatGPT 감사 및 지시 [P2-UNBLOCK-07]에 대한 ABI/Struct 정밀화, 사전 파일 감지 시 ABORT, try/finally 자원 해제, exit code assertion 및 원본 실행 transcript 커밋 보고서입니다.

---

### 1. Probe 코드의 4가지 구체적 결함 완전 해결

ChatGPT의 지적 사항을 전면 반영하여 [`tests/probe_vhdx_audited.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/probe_vhdx_audited.ps1)을 재작성하고 실행 검증을 완료했습니다.

1. **기존 파일 삭제 제거 -> 즉시 ABORT 적용**:
   - `Remove-Item -Force` 사전 삭제 로직을 완전 제거하고, 사전 파일 감지 시 즉시 예외를 발생시키도록 수정:
     `if (Test-Path -LiteralPath $testPath) { throw "ABORT: Pre-existing probe file '$testPath' detected. Cannot proceed without clean isolation." }`
2. **Add-Type 에러 은폐 방지**:
   - `Add-Type -ErrorAction Stop`으로 엄격 설정하여 컴파일 및 타입 바인딩 오류를 즉시 중단 처리.
3. **Native x64 Struct ABI 및 Union 오프셋 명시 (`[StructLayout(LayoutKind.Explicit)]`)**:
   - C# flat sequential 대신 native `CREATE_VIRTUAL_DISK_PARAMETERS` Version 2의 실제 x64 메모리 오프셋을 명시:
     - `Version` (offset 0, 4 bytes)
     - `UniqueId` (offset 8, 16 bytes)
     - `MaximumSize` (offset 24, 8 bytes)
     - `BlockSizeInBytes` (offset 32, 4 bytes)
     - `SectorSizeInBytes` (offset 36, 4 bytes, 512 지정)
     - `PhysicalSectorSizeInBytes` (offset 40, 4 bytes, 4096 지정)
     - `ParentPath` / `SourcePath` (offset 48, 56, IntPtr)
     - `OpenFlags` (offset 64, 4 bytes `int` enum)
     - `ParentVirtualStorageType` (offset 68, 20 bytes)
     - `SourceVirtualStorageType` (offset 88, 20 bytes)
     - `ResiliencyGuid` (offset 108, 16 bytes)
4. **자원 해제 및 정리의 `try/finally` 보장**:
   - 핸들 닫기(`CloseHandle`) 및 생성 파일 삭제를 `finally` 블록에 배치하여 예외 발생 시에도 누수가 발생하지 않도록 보장.
5. **엄격한 Assertion 및 Exit Code 제어**:
   - `res == 0`, `HeaderMagic == "vhdxfile"`, `cleanupSuccess == true`를 명시적 검사하고, 불일치 시 `throw "PROBE FAILED..."`로 비정상 종료되도록 구현.

---

### 2. 원시 실행 Transcript 파일 보존 및 커밋 정보

- **원격 커밋 SHA**: **`3ae9fd8`**
- **커밋 메시지**: `fix(p2-audit): update probe_vhdx_audited.ps1 with native struct layout and include raw transcript artifact`
- **커밋된 파일**:
  1. [`tests/probe_vhdx_audited.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/probe_vhdx_audited.ps1) (수정된 프로브 소스 v2)
  2. [`tests/probe_vhdx_transcript.txt`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/probe_vhdx_transcript.txt) (실제 실행 콘솔 원시 로그)

#### 커밋된 원시 Transcript 내용 (`tests/probe_vhdx_transcript.txt`)
```text
Invoking CreateVirtualDisk API (Native Struct Layout):
  Process Arch: True
  DeviceId: 3 (VHDX)
  VendorId: ec984aec-a0f9-47e9-901f-71415a66345b
  ParamVersion: 2
  SectorSize: 512
  PhysicalSectorSize: 4096
  TargetPath: E:\vivpr\ai\ebrowser\probe_vhdx_audited.vhdx


ProcessArch               : x64
DeviceId                  : 3
VendorId                  : ec984aec-a0f9-47e9-901f-71415a66345b
ParamVersion              : 2
SectorSizeInBytes         : 512
PhysicalSectorSizeInBytes : 4096
Win32ErrorCode            : 0
HexErrorCode              : 0x0
FileCreated               : True
FileSize                  : 4194304
HeaderMagic               : vhdxfile
FileCleanedUp             : True



All VHDX Creation Probe Assertions PASSED.
```

---

### 3. 실제 설치/마운트 승인을 위해 남은 사항 요약

1. **VHDX 포맷 및 마운트 (관리자 1회 승인 필요)**:
   - 검증된 안전 스크립트(`build/setup_build_volume.ps1`)를 기반으로 생성된 DiskPart 명령을 관리자 권한으로 실행하여 `X:\` 마운트 필요.
2. **Visual Studio 2022 Build Tools 설치 (경계 예외 승인 필요)**:
   - 설치 경로: `X:\VS2022`
   - 시스템 C: 드라이브 예상 사용량: 1.5 ~ 2.5 GB (공유 Installer/MSI 패키지 캐시)
3. **depot_tools 클론 및 소스 체크아웃 (경계 내 완전 격리)**:
   - `X:\depot_tools`에 클론 후 pinned revision `73c14f6...` 페치 준비.

---

### 4. Gate 상태

- **P1A**: 기존 완료 기준선 유지
- **P2**: VHDX 생성 Native API 실측 검증 및 증거 커밋 완료 / 실제 mount, toolchain 설치, compile은 **미실행 HOLD 유지**
