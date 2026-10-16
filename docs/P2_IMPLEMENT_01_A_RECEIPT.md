[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

[ANTIGRAVITY][RECEIPT][Lite Chromium Portable][P2-IMPLEMENT-01 / A + E]

수집 시각: 2026-10-04 21:06–21:08 EDT. 아래 값은 모두 이번 세션에서 실제 실행한 명령 출력입니다.

## A-1. 경계 증거

| 항목 | 결과 |
|---|---|
| canonical root | `E:\vivpr\ai\ebrowser` (`Get-Item`·`GetFullPath` 동일) |
| cwd | `E:\vivpr\ai\ebrowser` |
| git top-level | `E:/vivpr/ai/ebrowser/portable-minimal` |
| remote | `https://github.com/goodkie/xpider-browser.git` |
| branch | `feature/lcw-portable-chromium` |
| local HEAD | `2d84b49ede6f305ca3fa8040033b49ae5f1caa3e` (remote 대비 +1, 미push) |
| remote HEAD (`git ls-remote`) | `44926aa81038701d5316d0718dc317d1c84b54d1` |
| working tree | clean (`git status --short` 0 lines) |
| reparse point (재귀) | 0건. 단 **E: 파일시스템이 exFAT**이라 reparse point 자체를 지원하지 않음 (아래 BLOCKER-2) |
| source/build/cache/output | 현재 모두 `portable-minimal\` 하위. Chromium source·build·cache 경로는 **아직 존재하지 않음** |
| 루트 AGENTS.md | OCA-DEV-1.1 가드 반영 확인 (`E:\vivpr\ai\ebrowser\AGENTS.md`) |

로컬 커밋 `2d84b49` (P1A-R4 ZIP 패키징, patch REVIEW_READY, P1A_R4_RECEIPT.md)는 원격에 없습니다. 지시에 따라 경계 안에서 보존했습니다.

- 복구 지점: `E:\vivpr\ai\ebrowser\_RESTORE_POINTS\P2_PRE_IMPLEMENT\`
  - HEAD_SHA.txt, STATUS.txt
  - `portable-minimal_2d84b49.bundle` (296,768,966 B). `git bundle verify` 결과: "The bundle records a complete history."

## A-2. source / toolchain 준비 상태

| 요소 | 상태 |
|---|---|
| Chromium source `73c14f6228d7cd537c855007e8f88678969cc0eb` | **없음** (checkout·`.gclient` 0건) |
| depot_tools / gclient / gn / ninja | **NOT FOUND** |
| MSVC (`cl`) / `clang-cl` | PATH에 **NOT FOUND**. 시스템 설치 여부는 경계 밖이므로 조사하지 않음 |
| git / python | 있음 (시스템 설치, 읽기 실행만) |
| 디스크 E: | 여유 527.8 GB / **exFAT** |
| 호스트 | i7-4700MQ 4C/8T, RAM 23.6 GB, Windows 10 Pro WS 19045 |

## A-3. BLOCKER

1. **BLOCKER-1 (경계 예외 필요): Visual Studio 2022 + Windows SDK.** Chromium Windows 빌드에는 VS 2022(C++ workload)와 Windows SDK가 필요합니다. 이 둘은 `C:\Program Files*`에 설치되는 시스템 설치라 경계 위반이므로 임의로 진행하지 않았습니다.
   - 필요한 예외 범위: VS 2022 Build Tools (Desktop C++, ATL/MFC), Windows 11 SDK (10.0.22621+, Debugging Tools 포함) 시스템 설치 1회. 그 밖의 설치는 없음.
2. **BLOCKER-2: E: = exFAT.** Chromium 공식 문서는 NTFS 볼륨을 요구합니다. exFAT은 symlink·hardlink·reparse를 지원하지 않습니다. 따라서 gclient sync, Chromium build의 symlink 사용, depot_tools 동작이 실패하거나 신뢰할 수 없습니다.
   - 선택지 (Owner 결정 필요):
     - (a) 경계 안 NTFS VHDX를 만들어 `E:\vivpr\ai\ebrowser\` 아래 폴더에 mount (관리자 권한 필요, 파일은 경계 안에 유지)
     - (b) 다른 NTFS 볼륨에 루트 경계 예외 허용
     - (c) E: 재포맷 (불가 판단)
3. **BLOCKER-3 (용량·시간 위험): 호스트 사양.** RAM 23.6 GB / 4C8T는 Chromium 권장치(32 GB+, 8C+)에 못 미칩니다. 첫 `chrome` 타깃 full build는 대략 수십 시간 규모로 추정하며, 아직 실측하지 않았습니다. 다음 설정으로 완화합니다.
   - `is_debug=false`, `symbol_level=0`, `blink_symbol_level=0`, `is_component_build=true`, `enable_nacl=false`
   - 동시 링크 수 제한
4. **결정 필요 (제품 일치성):** 현재 엔진은 ungoogled-chromium 154.0.8037.57-1.1 바이너리입니다. `73c14f6` vanilla로 빌드하면 ungoogled 패치가 빠집니다. 다음 중 선택이 필요합니다.
   - (i) vanilla로 P2 기능 검증만 수행
   - (ii) ungoogled-chromium 패치 세트(tag 154.0.8037.57-1.1)까지 적용

캐시 경계 계획 (BLOCKER 해제 후): depot_tools는 경계 안에 `git clone`합니다. 아래 cache·virtualenv·temp 경로는 전부 경계 안 경로로 지정합니다.

- `DEPOT_TOOLS_WIN_TOOLCHAIN=0`, `GIT_CACHE_PATH`, `VPYTHON_VIRTUALENV_ROOT`, `CIPD_CACHE_DIR`, `TEMP`/`TMP`

각 경로는 실행 전에 다시 증명합니다.

## A-4. 이전 주장 정정 (중요)

`BUILD_RECEIPT.json` Audit-8과 patch 헤더의 **"git apply --check passed"는 pinned tree 대상 검증이 아닙니다.** 이 루트에는 Chromium source가 존재한 적이 없습니다 (`docs/P2_BUILD_ENVIRONMENT.md`에도 depot_tools NOT_INSTALLED로 기록). patch의 `index a354372..c3f3ecb` blob 해시도 실제 tree에서 생성된 것으로 확인할 수 없습니다.

→ Audit-8의 apply 검증 주장은 **UNSUBSTANTIATED로 철회**합니다. patch 상태는 `DESIGN_SKETCH / NOT_APPLIED`로 되돌리는 것이 정확합니다. B항은 실제 tree 확보 후 처음부터 수행합니다.

## A-5. 실행 명령 (요약)

- `Get-Item`, `GetFullPath`, `Get-ChildItem -Recurse -Attributes ReparsePoint`
- `git rev-parse --show-toplevel / HEAD`, `git status --short`, `git ls-remote origin`
- `Get-FileHash -Algorithm SHA256`
- `System.IO.Compression.ZipFile` 내부 목록 조회
- `Get-PSDrive`, `Get-Volume`, `Get-CimInstance`

모두 읽기 전용이며, 예외는 `_RESTORE_POINTS\P2_PRE_IMPLEMENT` 생성(쓰기) 하나입니다.

## E. P1A ZIP 증거

| 항목 | 값 |
|---|---|
| 경로 | `E:\vivpr\ai\ebrowser\portable-minimal\LiteChromiumPortable_v0.1.0-r4_win64.zip` |
| byte size | **199,987,314** (= 190.72 MiB) |
| SHA256 (ZIP 바이트에서 재계산) | **`a8d4d9d5a72ec84adddf6c80dc8a49a00533006f20f3bb991eabcf2c780667a8`**, Owner 제공값·manifest와 일치 |
| entry 수 | 86 (engine 76 + 기타 10). manifest `file_count: 86` 일치 |
| fixture / profile / User Data / Cookies / Preferences / temp_reloc | **NONE** |
| 내부 BUILD_RECEIPT | `git_commit 82912a9`, launcher sha256 `7031c6aa…e0ec`, engine package sha256 `d4b8f53e…5d88` |
| engine 원본 | `E:\vivpr\ai\ebrowser\downloads\ungoogled-chromium_154.0.8037.57-1.1_windows_x64.zip`, 198,766,792 B, sha256 `d4b8f53e…5d88`, engine.lock.json 일치 |
| 다운로드 참조 | **없음.** 100 MB 초과라 git push 불가. GitHub Release 업로드(Owner 인증)가 필요 |

비고:
- `dist\LiteChromiumPortable_v0.1.0_win64.zip`(sha256 `8b4a5b82…69eb`)는 r4 이전 산출물입니다. release 대상이 아닙니다.
- `temp_reloc_*` 2개(각 ~371 MB)는 relocation 테스트 잔여물입니다. ZIP에는 포함되지 않았습니다.

## 다음 보고

- **2026-10-04 23:00 EDT**, 또는 BLOCKER-1/2와 결정 4에 대한 Owner 응답 직후 (둘 중 빠른 쪽).
- 응답 전에도 경계 안에서 가능한 작업(depot_tools 경계 내 clone 계획 검증, 정정된 patch 상태 커밋)은 Owner 승인 범위 안에서만 진행합니다.

Gate: P1A ZIP artifact 해시·구성 **독립 재계산 완료** (다운로드 참조만 미제공). P2 B/C/D는 **BLOCKED** (BLOCKER-1, 2).
