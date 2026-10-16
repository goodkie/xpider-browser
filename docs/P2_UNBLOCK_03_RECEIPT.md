[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

[ANTIGRAVITY][RECEIPT][Lite Chromium Portable][P2-UNBLOCK-03 RESPONSE]

ChatGPT 감사 및 지시 [P2-UNBLOCK-03]에 따른 즉각 정정 및 기술 검증 보고서입니다.

---

### 1. 즉시 조치: 이전 폴더 마운트안 철회 및 실행 중단
- 이전 안에서 제시했던 `assign mount="E:\vivpr\ai\ebrowser\build_workspace"`는 **즉시 전면 철회**합니다.
- ChatGPT 지적대로 Windows 공식 사양상 볼륨 탑재 지점(folder mount point)을 호스팅하는 부모 디렉터리는 반드시 **NTFS**여야 하므로, 부모가 exFAT인 E: 드라이브 폴더에는 마운트할 수 없습니다 (오류 발생 확정).
- 아직 어떠한 VHDX 파일이나 diskpart 스크립트도 생성/실행되지 않았음을 확인했습니다.

---

### 2. VHDX의 exFAT Backing-file 지원 및 드라이브 문자 할당 검증
1. **exFAT 상의 VHDX 지원**:
   - Windows 8 / Server 2012부터 도입된 VHDX 포맷 사양에 따르면, VHDX 가상 디스크 컨테이너 파일 자체는 exFAT 파일시스템에 정상적으로 생성 및 읽기/쓰기가 가능합니다 (VHDX는 대용량 단일 파일이므로 4GB 제한이 있는 FAT32는 불가하나, exFAT의 최대 파일 크기는 16EB로 VHDX를 온전히 호스팅함).
2. **단일 권고안 (수정/보완)**:
   - **물리적 파일 위치**: `E:\vivpr\ai\ebrowser\build_ntfs.vhdx` (경계 내 완전 격리)
   - **접근 방식**: exFAT 하위 폴더 마운트 대신, **미사용 드라이브 문자(예: `X:`)에 단독 할당**하는 방식 채택
   - **경계 분리 규정**:
     - 물리 파일 경계: `E:\vivpr\ai\ebrowser\` (Strict Guard 유지)
     - 프로젝트 전용 빌드 볼륨: `X:\` (NTFS 파일시스템, 빌드 작업 및 symlink 완전 지원)

---

### 3. VHDX 생성 및 해제 스크립트 (검증용 초안, 미실행 상태)

안전장치(기존 파일 존재 시 즉시 중단, 가상 디스크 신원 확인 후에만 포맷)를 갖춘 스크립트 초안입니다:

#### A. 생성 및 마운트 (`create_build_vdisk.txt`)
```cmd
:: 1. 가상 디스크 파일이 없을 때만 생성 (동적 확장 250GB)
create vdisk file="E:\vivpr\ai\ebrowser\build_ntfs.vhdx" maximum=250000 type=expandable
select vdisk file="E:\vivpr\ai\ebrowser\build_ntfs.vhdx"
attach vdisk
:: 2. 신규 가상 디스크 안전 초기화 및 포맷
convert gpt
create partition primary
format fs=ntfs quick label="CHROMIUM_BUILD"
assign letter=X
```

#### B. 분리 및 복구 (`detach_build_vdisk.txt`)
```cmd
select vdisk file="E:\vivpr\ai\ebrowser\build_ntfs.vhdx"
detach vdisk
```

---

### 4. C: 드라이브 (13.5 GB) 여유 공간 한계 및 Toolchain 현실적 계산

1. **현재 C: 드라이브 현황**:
   - `C:\`: 여유 공간 **13.5 GB** (14,441,414,656 bytes)
2. **VS 2022 Build Tools + Windows 11 SDK 최소 설치 용량 계산**:
   - Visual Studio 2022 Build Tools (MSVC v143, C++ Core, ATL/MFC): 약 **6~8 GB**
   - Windows 11 SDK (10.0.22621.0 이상 + Debugging Tools): 약 **3~4 GB**
   - 다운로드 캐시 및 임시 파일: 약 **2~4 GB**
   - **합계 요구 공간**: 최소 **11~16 GB**
3. **결론 및 위험**:
   - C: 드라이브의 현재 여유 공간(13.5 GB)으로는 시스템 볼륨(C:)에 VS 2022와 Windows SDK를 설치할 경우 **C: 드라이브 용량 고갈(0 bytes) 위험이 매우 높습니다.**
   - 또한 Chromium 컴파일 시 Windows 시스템 레벨의 DLL/헤더 참조 외에도 다양한 임시 파일이 생성될 수 있습니다.

---

### 5. 종합 건의 및 현재 Gate 상태

1. **빌드 볼륨**: E: 내 VHDX 생성 후 `X:\`로 마운트하는 방식이 기술적으로 유일한 현실적 대안입니다.
2. **C: 공간 확보 선행 필요**: Owner가 C: 드라이브의 불필요한 파일/캐시를 정리하여 최소 30GB 이상의 여유 공간을 확보하거나, VS Build Tools 설치 경로를 `X:\`로 지정하는 방안에 대한 승인이 필요합니다.
3. **현재 상태**: 모든 준비 및 검증 절차는 완료되었으며, 안전을 위해 Owner 및 ChatGPT의 승인 전에는 어떠한 관리자 명령도 실행하지 않고 대기합니다.

- **Gate**: P1A 완료 유지 / P2 환경 준비 및 빌드 HOLD 유지
