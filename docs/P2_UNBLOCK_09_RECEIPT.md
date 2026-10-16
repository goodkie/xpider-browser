[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

[ANTIGRAVITY][RECEIPT][Lite Chromium Portable][P2-UNBLOCK-09 RESPONSE]

ChatGPT 감사 및 지시 [P2-UNBLOCK-09]에 따른 5가지 마운트 실행기 구체적 결함 전면 수정, 가상 디스크 신원 검증 추가, 6/6 단위 테스트 통과 및 원격 커밋 보고서입니다.

---

### 1. 마운트 실행기 5대 결함 완전 수정 내역 ([`setup_build_volume.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/build/setup_build_volume.ps1))

1. **가상 디스크 신원 확인 및 물리 디스크 오인 포맷 방지 로직 구현**:
   - `create vdisk` / `attach vdisk` 실행 후 즉시 `detail vdisk`를 파싱하여 이번 세션이 attach한 **정확한 가상 디스크 번호 (`Disk ### N`)**를 추출.
   - 추출된 디스크 번호가 `Disk 0` (시스템/OS 디스크)이거나 null인 경우 즉시 `throw SAFETY ABORT`로 포맷을 원천 차단.
   - 포맷 시 `select disk $attachedDiskNumber`로 **신원이 입증된 가상 디스크 번호만 지정하여 파티셔닝/포맷** 수행.
2. **`DetachOnly` 실행 가드 통일**:
   - `DetachOnly` 분기를 Execute 가드 내부로 통합하여, 관리자 권한 상태라도 `-Execute` 플래그가 없으면 실제 분리를 하지 않고 Dry-Run 계획만 출력하도록 수정.
3. **Nonce I/O 스모크 테스트 엄격 비교 및 정리 보장**:
   - 고유 난수 GUID Nonce (`LiteChromiumPortable_P2_Nonce_<GUID>`)를 임시 파일에 기록.
   - `Get-Content`로 읽어 들인 문자열이 기록된 Nonce와 완전히 일치하는지 `if ($readContent -ne $testNonce)`로 검증하고 불일치 시 FAIL 발생.
   - `try/finally`를 통해 검증 성공/실패 여부와 무관하게 임시 테스트 파일이 100% 삭제되도록 보장.
4. **Rollback 및 Detach 결과 실측 검증**:
   - DiskPart detach 후 `$LASTEXITCODE`를 확인하고, `Get-PSDrive -Name $DriveLetter`로 드라이브 문자가 실제로 시스템에서 해제되었는지 상태를 검증.
5. **`-WhatIf` 매개변수 바인딩 복원 및 6개 단위 테스트 통과**:
   - 기본 드라이런뿐 아니라 `-WhatIf` 스위치를 명시적으로 지원하도록 파라미터 복원.
   - [`tests/test_boundary_validation.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/test_boundary_validation.ps1) 재실행 결과 **6/6 All PASSED** 확인.

---

### 2. 단계적 마운트 및 실행 계획 (Small Volume First)

대규모 250GB 볼륨 및 VS 설치에 앞서, Owner 및 ChatGPT가 검토할 수 있는 **소규모 볼륨(1GB) 단계화 검증안**을 확정했습니다.

1. **1단계: 소규모 테스트 볼륨 (1,000 MB) 마운트 및 I/O 검증 (관리자 1회 승인 필요)**:
   ```powershell
   # 1GB 소규모 테스트 볼륨으로 attach -> NTFS format -> Nonce IO -> detach 완전 주기 검증
   powershell -ExecutionPolicy Bypass -File E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1 -VhdPath "E:\vivpr\ai\ebrowser\test_smokevol.vhdx" -SizeMB 1000 -DriveLetter X -Execute
   powershell -ExecutionPolicy Bypass -File E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1 -VhdPath "E:\vivpr\ai\ebrowser\test_smokevol.vhdx" -DriveLetter X -DetachOnly -Execute
   ```
2. **2단계: 본 빌드 볼륨 (250 GB) 생성 및 마운트 (1단계 통과 후 진행)**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1 -VhdPath "E:\vivpr\ai\ebrowser\build_ntfs.vhdx" -SizeMB 250000 -DriveLetter X -Execute
   ```
3. **3단계: VS 2022 Build Tools 설치 (마운트 확인 후 별도 분리 진행)**.

---

### 3. Git 원격 반영 정보

- **원격 커밋 SHA**: **`5ebed22`**
- **커밋 메시지**: `fix(p2-build): refine setup_build_volume.ps1 v3 with virtual disk identity assertion, nonce check, and WhatIf binding`
- **반영 파일**: `build/setup_build_volume.ps1`

---

### 4. Gate 및 용어 정정

- **P1A**: ZIP 바이트 기반 개발팀 재계산 증거(SHA256: `a8d4d9d5...667a8`) 완료 유지 (독립 다운로드 검증 대기)
- **P2**: 실행기 v3 안전 결함 전면 수정 완료 / **관리자 실행 및 시스템 설치는 미실행 HOLD 유지**
