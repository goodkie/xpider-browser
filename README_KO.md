# Lite Chromium Portable (한국어 사용자 가이드)

Lite Chromium Portable은 설치 과정 없이 압축 해제만으로 즉시 사용할 수 있는 Windows x64 전용 순수 Chromium 브라우저입니다.
Node.js, Electron, .NET 등 무거운 부가 런타임을 일체 포함하지 않아 가볍고 빠릅니다.

## 주요 기능
- **100% Native Chromium 엔진**: Pinned Chromium 154 x64 기반으로 정품 MV3 확장 프로그램(Service Worker, Tabs, Scripting, Storage) 완벽 지원.
- **완전 무설치 (Zero Installation)**: 한글/공백 경로, USB 드라이브 등 임의의 경로 어디서나 실행 가능.
- **독립 프로필 멀티 인스턴스 일괄 실행**:
  - `--batch=3` 또는 `--batch=5` 명령으로 쿠키, 캐시, 확장 저장소가 완전히 분리된 브라우저 3개/5개를 동시 실행.
  - 인스턴스 간 데이터 간섭 및 세션 충돌 원천 차단.
- **확장 프로그램 관리**:
  - `extensions/<폴더명>`에 언팩 확장을 넣으면 자동 감지되어 로드됩니다.
  - `extensions/incoming/` 폴더에 확장 ZIP 파일을 넣으면 기동 시 자동으로 검증 후 안전하게 압축 해제되어 설치됩니다.

## 실행 방법
- **기본 브라우저 실행 (인스턴스 1)**:
  `LiteChromiumPortable.exe`
- **3개 브라우저 동시 실행**:
  `LiteChromiumPortable.exe --batch=3`
- **5개 브라우저 동시 실행**:
  `LiteChromiumPortable.exe --batch=5`
- **특정 인스턴스 지정 실행**:
  `LiteChromiumPortable.exe --instance=2`
- **현재 실행 중인 인스턴스 상태 조회**:
  `LiteChromiumPortable.exe --status`
- **프로필 안전 정책**:
  사용자 데이터 보호를 위해 런처 레벨에서의 강제 프로필 삭제 기능(`--clean-profiles`)은 비활성화(Security Refusal)되어 있습니다. 프로필 관리는 `data/profiles/` 디렉터리에서 사용자가 직접 수동 관리합니다.
