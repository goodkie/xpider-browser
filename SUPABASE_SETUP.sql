-- ============================================================
-- XPIDER Browser — Supabase DB 초기 설정 SQL
-- Supabase Dashboard > SQL Editor 에서 실행하세요.
-- ============================================================

-- 1. profiles 테이블 생성
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT        NOT NULL,
  plan        TEXT        NOT NULL DEFAULT 'free',   -- 'free' | 'pro' | 'admin'
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login  TIMESTAMPTZ
);

-- 2. Row Level Security 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. 정책 설정
-- 본인 프로필 조회
CREATE POLICY "self_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- 어드민은 전체 조회 가능
CREATE POLICY "admin_select_all" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND plan = 'admin')
  );

-- 어드민은 모든 프로필 수정 가능 (is_active, plan 등)
CREATE POLICY "admin_update_all" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND plan = 'admin')
  );

-- 본인 프로필 수정 (username만)
CREATE POLICY "self_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 4. 신규 가입 시 자동으로 profile 생성하는 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. 로그인 시간 업데이트 함수 (선택)
CREATE OR REPLACE FUNCTION public.update_last_login(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET last_login = NOW() WHERE id = user_id;
END;
$$;

-- ============================================================
-- 6. Storage 버킷 생성 (별도 Dashboard UI에서 해도 됩니다)
-- ============================================================
-- Storage > Buckets > New Bucket
--   이름: extensions
--   Public: true (익스텐션 ZIP 공개 다운로드)
--
-- 버킷 생성 SQL (SQL Editor에서 실행):
-- SELECT storage.create_bucket('extensions', '{"public": true}');

-- ============================================================
-- 완료 후 확인:
--   SELECT * FROM public.profiles;
-- ============================================================
