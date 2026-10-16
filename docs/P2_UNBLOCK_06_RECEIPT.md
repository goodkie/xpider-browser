[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

[ANTIGRAVITY][RECEIPT][Lite Chromium Portable][P2-UNBLOCK-06 RESPONSE]

ChatGPT 감사 및 지시 [P2-UNBLOCK-06]에 대한 구체적 결함 수정, 6개 단위 테스트 작성/통과, 공식 VendorId 기반 프로브 코드 커밋 및 원시 증거 보고서입니다.

---

### 1. 경계 검사 결함 수정 및 6개 케이스 단위 테스트 완전 통과

ChatGPT가 지적한 `StartsWith("E:\vivpr\ai\ebrowser")`의 형제 디렉터리(`ebrowser-other\`) 통과 취약점을 즉시 해결했습니다.

1. **코드 수정 내역 ([`setup_build_volume.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/build/setup_build_volume.ps1))**:
   - 정규화된 루트 경로 끝에 디렉터리 구분자를 강제 추가:
     `$canonicalRoot = [System.IO.Path]::GetFullPath($workspaceRoot).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar` (`E:\vivpr\ai\ebrowser\`)
   - 대소문자 무시 `StartsWith($canonicalRoot)` 검사로 형제 prefix 경로 완전 차단
   - 파일 확장자 `.vhdx` 엄격 검사 (`[System.IO.Path]::GetExtension`)
   - 부모 디렉터리 실제 존재 여부 검사 (`Test-Path -PathType Container`)
2. **독립 단위 테스트 작성 및 원격 커밋 ([`tests/test_boundary_validation.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/test_boundary_validation.ps1))**:
   - **실제 실행 출력 (6/6 PASS)**:
     ```text
     [PASS] Normal inside path: Expected=True, Got=True
     [PASS] Normal nested inside path: Expected=True, Got=True
     [PASS] Sibling prefix directory (escape attempt): Expected=False, Got=False
         ABORT: VhdPath 'E:\vivpr\ai\ebrowser-other\test.vhdx' is outside workspace boundary 'E:\vivpr\ai\ebrowser\'.
     [PASS] Parent traversal escape (..): Expected=False, Got=False
         ABORT: VhdPath 'E:\vivpr\ai\outside.vhdx' is outside workspace boundary 'E:\vivpr\ai\ebrowser\'.
     [PASS] Wrong extension (.vhd): Expected=False, Got=False
         ABORT: VhdPath must have '.vhdx' extension. Given: 'E:\vivpr\ai\ebrowser\build.vhd'.
     [PASS] Non-existent parent directory: Expected=False, Got=False
         ABORT: Parent directory 'E:\vivpr\ai\ebrowser\non_existent_dir_12345' does not exist.

     All 6 boundary validation unit tests PASSED.
     ```

---

### 2. 공식 Microsoft VendorId 기반 프로브 소스 커밋 및 실측 검증

이전 보고의 `VendorId` 오타/잘못된 GUID를 공식 Microsoft 상수로 정정하고, 실행 소스를 리포지토리에 파일로 보존했습니다.

1. **공식 명세 반영**:
   - 공식 Microsoft 상수: **`EC984AEC-A0F9-47e9-901F-71415A66345B`** (`VIRTUAL_STORAGE_TYPE_VENDOR_MICROSOFT`)
   - DeviceId: **`3`** (`VIRTUAL_STORAGE_TYPE_DEVICE_VHDX`)
   - ParamVersion: **`2`** (`CREATE_VIRTUAL_DISK_VERSION_2`)
2. **커밋된 프로브 파일**: [`portable-minimal/tests/probe_vhdx_audited.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/probe_vhdx_audited.ps1)
3. **실제 원시 실행 콘솔 출력**:
   ```text
   Calling CreateVirtualDisk with:
     DeviceId: 3 (VIRTUAL_STORAGE_TYPE_DEVICE_VHDX)
     VendorId: ec984aec-a0f9-47e9-901f-71415a66345b (Official Microsoft Vendor GUID)
     ParamVersion: 2
     TargetPath: E:\vivpr\ai\ebrowser\probe_vhdx_audited.vhdx (exFAT)

   DeviceId       : 3
   VendorId       : ec984aec-a0f9-47e9-901f-71415a66345b
   ParamVersion   : 2
   Win32ErrorCode : 0
   Hex            : 0x0
   FileCreated    : True
   FileSize       : 4194304
   HeaderMagic    : vhdxfile
   FileCleanedUp  : True
   ```
   - **입증 확인**:
     - 공식 Microsoft GUID로 호출 시에도 `Win32ErrorCode: 0` (`ERROR_SUCCESS`)로 완벽히 생성됨.
     - 8바이트 매직 시그니처 **`vhdxfile`** 일치 확인.
     - `FileCleanedUp: True`로 테스트 직후 핸들 해제 및 파일 완전 삭제 검증.
   - **상태 구분**:
     - **exFAT 상 VHDX 파일 생성 (호스팅)**: **공식 상수로 실측 검증 완료**
     - **Attach / NTFS 파티셔닝 / 포맷 / 마운트 / 빌드 I/O**: **미실행 HOLD 상태 유지**

---

### 3. 변경 사항 원격 커밋 및 푸시 정보

- **원격 커밋 SHA**: **`94aa477`**
- **커밋 메시지**: `fix(p2-audit): strengthen canonical boundary checks with 6-case unit tests and verify official Microsoft VHDX probe`
- **반영 파일**:
  1. `build/setup_build_volume.ps1` (정밀 경계 검사 적용)
  2. `tests/test_boundary_validation.ps1` (6개 단위 테스트 추가)
  3. `tests/probe_vhdx_audited.ps1` (공식 Microsoft VHDX 프로브 코드 추가)

---

### 4. 현재 상태 및 다음 보고

- 관리자 권한 디스크 조작 및 시스템 설치는 일체 실행하지 않고 **엄격한 HOLD**를 유지하고 있습니다.
- 모든 스크립트와 검증 코드는 경계 내 파일로 커밋되어 원격에 공유되었습니다.
- **다음 보고 시각**: **2026-10-04 23:00 EDT** (약 15분 후 정기 점검)
