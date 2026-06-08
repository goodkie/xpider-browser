# XPIDER AutoForm Sender Pro 자동완성 고도화 및 최초 STT 설정 팝업 구현 태스크

- [x] **1. 템플릿 미정 질문 자동완성 폴백 엔진 구현 (`content-script.js`)**
  - [x] 빈 일반 입력란(INPUT/TEXTAREA)에 템플릿 실존 값 중 무작위 1개 추출 대입 로직 구현
  - [x] 셀렉트 박스(드롭다운)에 대해 옵션 미선택 시 무작위 옵션 지정 기능 구현
  - [x] 라디오 버튼 그룹에 대해 체크가 누락된 경우 무작위 1개 버튼 자동 체크 구현
  - [x] 체크박스 누락에 대해 에러 방지용 고확률 무작위 체크(70%) 구현
- [x] **2. STT 최초 설정 모달 팝업 추가 (`popup.html` & `translations.js`)**
  - [x] XPIDER 프리미엄 스타일의 전면 셋업 모달 마크업 추가 (`stt-setup-modal-overlay`)
  - [x] Wit.ai 키 발급 가이드 앵커 링크 제공 (`https://wit.ai`)
  - [x] 영어/한국어/일본어/중국어 다국어 번역 리소스 사전 추가 (`translations.js`)
- [x] **3. 최초 구동 확인 및 저장 이벤트 처리 (`popup.js`)**
  - [x] 팝업 기동 및 `loadSettings` 이후 `xpider_stt_api_key` 미존재 시 모달 레이어 강제 활성화
  - [x] 모달 내 저장 버튼 클릭 시 스토리지 저장, 기어 설정 필드 동기화, 모달 비활성화 바인딩 구현
- [x] **4. 서비스 워커 실시간 키 동적 로드 구현 (`background.js`)**
  - [x] `transcribeAudio` API 호출 진입 시점에 `chrome.storage.local`에서 최신 `xpider_stt_api_key` 동적 조회 및 Bearer 인증 헤더 반영
- [x] **5. 최종 검증 및 동작 확인**
  - [x] 임의 질문이 기재된 모의 HTML 웹 폼을 대상으로 텍스트/셀렉트/라디오/체크박스 무작위 폴백 동작 검증
  - [x] 로컬 스토리지 키 삭제 후 팝업 진입 시 최초 셋업 모달 노출 및 저장, 동기화 수동 검증
  - [x] `walkthrough.md` 업데이트 및 완료 보고
