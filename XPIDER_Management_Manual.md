# XPIDER Browser Management & Development Manual

이 매뉴얼은 XPIDER 브라우저의 관리자 및 개발자를 위한 통합 가이드입니다. 프로젝트의 로드맵, 계정 관리, 익스텐션 배포, 그리고 업데이트 프로세스를 상세히 설명합니다.

---

## 1. 프로젝트 로드맵 (Roadmap)

### Phase 1: 안정화 및 다국어 지원 (현재 단계)
- **목표**: 12개 주요 언어 완벽 지원 및 핵심 엔진 안정화.
- **주요 작업**: 온보딩 시스템 현지화, 버그 수정, 성능 최적화.

### Phase 2: AI 자동화 강화
- **목표**: AI를 활용한 데이터 추출 및 메시징 자동화 고도화.
- **예정 기능**: 
  - AI 필드 매핑 개선 (Wix, Shopify 등 다양한 폼 대응)
  - 캡차(CAPTCHA) 자동 우회 성능 향상
  - AI 기반 맞춤형 콜드 메일 생성 및 발송

### Phase 3: 기업용 협업 기능
- **목표**: 팀 단위 리드 관리 및 동기화 지원.
- **예정 기능**:
  - 클라우드 기반 리드 데이터베이스 통합
  - 팀원 간 수집 데이터 공유 및 중복 제거
  - 어드민 대시보드를 통한 권한 제어

---

## 2. 관리 계정 및 로그인 정보 (Account Management)

> **중요**: 실제 비밀번호와 API 키는 보안을 위해 환경 변수나 보안 금고(LastPass, Bitwarden 등)에 별도로 저장하세요.

| 서비스 | 용도 | 계정 이메일 | 관리 위치 |
| :--- | :--- | :--- | :--- |
| **GitHub** | 소스 코드 저장소 및 자동 빌드(CI/CD) | `관리자 이메일` | [GitHub Repo](https://github.com/) |
| **Supabase** | 사용자 인증(Auth) 및 DB 관리 | `관리자 이메일` | [Supabase Dashboard](https://supabase.com/) |
| **Google Console** | (추후) 검색 API 및 서비스 계정 | `관리자 이메일` | [Google Cloud](https://console.cloud.google.com/) |
| **AWS/Azure** | (선택) 프록시 서버 및 VPN 인프라 | `관리자 이메일` | 각 콘솔 페이지 |
| **Email Services** | 캠페인 발송용 SMTP/API 계정 | `각 마케팅 계정` | SendGrid, Mailgun 등 |

---

## 3. 익스텐션 관리 및 업로드 가이드 (Extensions Guide)

### 익스텐션 구조
모든 익스텐션은 루트의 `extensions/` 디렉토리에 위치하며, 개별 폴더로 관리됩니다.
- `LocalBusinessDataCrawlerPro`: 검색엔진 기반 크롤러
- `google_maps_extension_source`: 구글 맵 파인더
- `Email_Extractor_Source`: 실시간 이메일 추출기
- `proxy`: VPN/프록시 관리

### 업데이트 및 업로드 경로
1.  **소스 수정**: 원본 작업 폴더(`e:/vivpr/ai/...`)에서 코드를 수정합니다.
2.  **버전 관리**: `manifest.json`의 `version` 값을 올립니다.
3.  **동기화 및 배포**: `deploy-cli.js`를 실행하여 브라우저 프로젝트로 복사 후 GitHub에 푸시합니다.

### 익스텐션별 핵심 로직
- **Email Extractor**: `main.js`의 `Email Extractor 수집 엔진` 섹션에서 전역 이메일 Set을 관리합니다.
- **Campaign Engine**: `campaign-engine.js`에서 폼 감지 및 발송 시뮬레이션을 담당합니다.

---

## 4. 앱 배포 및 업데이트 매뉴얼 (Deployment Manual)

### 🌍 브라우저 전체 업데이트 (npm start 기반)
1.  `package.json`에서 버전(`version`)을 수동으로 수정하거나 `deploy-cli.js`를 사용합니다.
2.  `node deploy-cli.js` 실행 -> `1번` 선택.
3.  버전 선택(Patch/Minor/Major) 후 GitHub 푸시 확인.
4.  **결과**: GitHub Actions에서 자동으로 Windows용 설치 파일(.exe)을 빌드하고 릴리즈에 등록합니다.

### 🧩 익스텐션 개별 업데이트
1.  `node deploy-cli.js` 실행 -> `2번` 선택.
2.  업데이트할 익스텐션 번호 선택.
3.  새 버전 번호 입력.
4.  **결과**: 코드가 GitHub `main` 브랜치에 푸시되며, 사용자가 브라우저를 재시작할 때 `checkAndSyncExtensionsInBackground` 함수가 작동하여 최신 버전을 자동으로 다운로드합니다.

---

## 5. 관리자 체크리스트 (Admin Checklist)

- [ ] **버전 일치 확인**: `package.json`과 `src/main.js`의 버전이 릴리즈 정보와 일치하는가?
- [ ] **Supabase 연결 상태**: 로그인 및 세션 체크 기능이 정상 작동하는가?
- [ ] **익스텐션 동작 확인**: 업데이트 후 각 익스텐션의 아이콘과 팝업이 정상적으로 나타나는가?
- [ ] **다국어 무결성**: 새로운 기능을 추가할 때 `lang.js`에 모든 12개 언어 키를 추가했는가?

---

## 6. 기술 지원 및 디벨롭 팁
- **IPC 통신**: 익스텐션과 메인 프로세스 간의 통신은 `xpider-ext-*` 채널을 통해 이루어집니다. 새로운 브릿지 기능이 필요하면 `main.js`와 `ext-preload.js`를 수정하세요.
- **프로필 격리**: `data/profile-X` 폴더를 통해 사용자별 데이터가 완벽히 격리됩니다. 멀티 인스턴스 실행 시 `--profile=2` 등의 인자를 활용하세요.

---
*Manual Version 1.0 | Created by Antigravity*
