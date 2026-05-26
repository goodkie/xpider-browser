-- ─────────────────────────────────────────────────────────────────
-- XPIDER Stripe 연동 DB 스키마 마이그레이션
-- Supabase 대시보드 → SQL Editor에서 실행하세요.
-- ─────────────────────────────────────────────────────────────────

-- 1. profiles 테이블에 Stripe 관련 컬럼 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status     TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_end_at     TIMESTAMPTZ;

-- 2. 인덱스 추가 (Webhook에서 stripe_customer_id로 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON profiles(stripe_customer_id);

-- 3. 기존 무료 사용자 토큰 600으로 정규화 (플랜이 'free'인 사용자만)
-- 주의: 이미 토큰을 사용 중인 사용자에게 영향을 줄 수 있으므로 신중히 실행하세요.
-- UPDATE profiles SET tokens_remaining = 600 WHERE plan = 'free' AND tokens_remaining > 600;

-- 4. 결과 확인
SELECT id, username, email, plan, tokens_remaining, subscription_status, stripe_customer_id
FROM profiles
LIMIT 10;
