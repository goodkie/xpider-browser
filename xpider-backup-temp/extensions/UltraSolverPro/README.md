# ⚡ UltraSolver Pro - Anti-Captcha SuperProxy Extension

본 익스텐션은 **Anti-Captcha SuperProxy** 와 연동하여 자동 캡차(reCAPTCHA, hCaptcha, Turnstile)를 해결하는 화이트 레이블(White-Label) 독립형 크롬 익스텐션입니다.

---

## 1. SuperProxy VPS 서버 설치 가이드 (2026년 최신)

SuperProxy를 개인 또는 고객용 VPS 서버에 구축하여 독자적인 캡차 해결 게이트웨이를 운영할 수 있습니다.

### 요구사항
* **OS**: Ubuntu 22.04 LTS 또는 24.04 LTS (순수 VPS 상태 권장)
* **사양**: 최소 1GB RAM (안정적인 처리를 위해 2GB RAM 이상 권장)
* **도메인**: 1개 (예: `solver.yourdomain.com`) - VPS IP로 A 레코드 등록 완료 필수
* **포트**: 80 및 443 포트가 방화벽에서 열려 있어야 함

### 설치 단계
1. **VPS에 SSH로 접속**한 후 다음 명령어를 실행하여 설치 스크립트를 다운로드하고 권한을 부여합니다.
   ```bash
   curl -O https://raw.githubusercontent.com/anti-captcha/superproxy/main/start.sh
   chmod +x start.sh
   ./start.sh
   ```

2. **설치 중 안내 메시지**에 따라 아래 정보를 입력합니다.
   * `Domain name`: 연동할 도메인 주소 입력 (예: `solver.yourdomain.com`)
   * `Admin username / password`: 관리자 로그인용 ID 및 비밀번호 설정
   * `Email`: 시스템 오류 및 알림 수신용 이메일
   * `SSL 설정`: Let's Encrypt 자동 발급 승인 여부 (무료 SSL 적용 권장)

3. **컨테이너 실행 및 관리**
   설치가 완료되면 프로젝트 폴더로 이동하여 도커 컴포즈(docker-compose)를 구동합니다.
   ```bash
   cd superproxy
   docker-compose up -d
   ```

4. **접속 확인**
   * **관리자 콘솔**: `https://yourdomain.com/console` (콘솔 로그인 후 관리자 대시보드 접근)
   * **고객 랜딩페이지**: `https://yourdomain.com` (고객용 가입 및 가이드 페이지)

---

## 2. 관리자 설정 및 API 연동

### Anti-Captcha 원본 키 입력
1. 관리자 대시보드의 `https://yourdomain.com/console/admin-settings` 로 이동합니다.
2. Anti-Captcha 사이트(원본 서비스)에서 발급받은 **API Key**를 입력합니다.
3. 원본 Anti-Captcha 계정의 잔고가 있어야 고객 요청을 처리할 수 있으므로, **충분한 예치금 잔고를 유지**해야 합니다.

### White-Label 브랜드 커스터마이징
* 로고 이미지, 회사명, 색상 테마, 가격 정책, 서비스 이용 약관(TOS) 등을 자유롭게 변경하여 **브랜드 독자 서비스**처럼 보이게 설정할 수 있습니다.

---

## 3. 가격 책정 및 마진 비즈니스 전략

SuperProxy를 비즈니스 목적으로 배포할 때 추천하는 수익 극대화 전략입니다.

### 원가 기준 (Anti-Captcha 기본 요금)
* **reCAPTCHA v2**: 1,000회 해결당 약 `$1.00` ~ `$1.50` (벌크 구매 시 단가 추가 할인 가능)

### 마진 책정 모델
1. **기본 충전 모델 (원가 대비 2.0 ~ 3.0배 적용)**
   * 원가 $1.00 기준 → 고객에게 **$2.50 ~ $3.00** 판매 (150% ~ 200% 마진율)
2. **월 구독형 모델 (Subscription)**
   * 월 **$19** ~ **$49** 구독 요금제를 도입하여 무제한 혹은 월 10,000회 등의 한도를 제공합니다.
3. **볼륨 기반 할인 요금제 (Tiered pricing)**
   * **Basic**: 건당 $0.003
   * **Pro**: 건당 $0.002 (다량 사용 유저 할인)
   * **Enterprise**: 맞춤형 커스텀 단가 협의

### 배포 권장사항
* Chrome Web Store는 CAPTCHA Solver 카테고리 익스텐션 심사를 반려할 확률이 매우 높습니다.
* 따라서 크롬 웹스토어 등록 대신, 패키징된 익스텐션 파일(`.crx` 또는 `.zip` 압축 해제 폴더)을 **직접 sideload 방식**으로 고객에게 배포 및 수동 설치하도록 안내하는 것이 안정적입니다.
