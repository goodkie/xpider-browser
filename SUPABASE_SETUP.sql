-- ============================================================
-- XPIDER Browser — Supabase DB 초기 설정 & 업그레이드 SQL
-- Supabase Dashboard > SQL Editor 에서 한 번에 전체 복사하여 실행하세요.
-- ============================================================

-- 1. profiles 테이블 생성 및 확장 (기존 테이블이 있어도 컬럼 자동 추가)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username          TEXT        NOT NULL,
  email             TEXT,
  plan              TEXT        NOT NULL DEFAULT 'free',   -- 'free' | 'pro' | 'admin'
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  tokens_remaining  INTEGER     NOT NULL DEFAULT 600,      -- 기본 제공 600 토큰
  last_active_at    TIMESTAMPTZ DEFAULT NOW(),
  active_device_id  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login        TIMESTAMPTZ
);

-- 기존 테이블이 존재할 경우를 대비하여 신규 컬럼을 안전하게 한 번 더 추가
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tokens_remaining INTEGER NOT NULL DEFAULT 600;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_device_id TEXT;

-- 2. Row Level Security 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2.5. 어드민 여부를 무한 재귀 없이 안전하게 체크하는 SECURITY DEFINER 헬퍼 함수
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND plan = 'admin'
  );
END;
$$;

-- 3. profiles 정책 설정 (기존 정책이 존재하면 DROP 후 새로 생성)
DROP POLICY IF EXISTS "self_select" ON public.profiles;
CREATE POLICY "self_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "admin_select_all" ON public.profiles;
CREATE POLICY "admin_select_all" ON public.profiles
  FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_update_all" ON public.profiles;
CREATE POLICY "admin_update_all" ON public.profiles
  FOR UPDATE USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "self_update" ON public.profiles;
CREATE POLICY "self_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "self_insert" ON public.profiles;
CREATE POLICY "self_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);




-- 4. user_logs (익스텐션별 상세 사용량 및 작업 로그 보관 테이블) 생성
CREATE TABLE IF NOT EXISTS public.user_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  extension_name  TEXT        NOT NULL,
  action          TEXT        NOT NULL,
  tokens_consumed INTEGER     NOT NULL DEFAULT 1,
  details         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- user_logs Row Level Security 활성화 및 정책 수립
ALTER TABLE public.user_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_logs" ON public.user_logs;
CREATE POLICY "admin_select_logs" ON public.user_logs
  FOR SELECT USING (public.is_admin(auth.uid()));


DROP POLICY IF EXISTS "self_insert_logs" ON public.user_logs;
CREATE POLICY "self_insert_logs" ON public.user_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "self_select_logs" ON public.user_logs;
CREATE POLICY "self_select_logs" ON public.user_logs
  FOR SELECT USING (auth.uid() = user_id);


-- 5. 신규 회원가입 시 프로필에 username 및 email을 자동 연동하는 고성능 트리거 함수
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 6. 로그인 시간 업데이트 함수
CREATE OR REPLACE FUNCTION public.update_last_login(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET last_login = NOW() WHERE id = user_id;
END;
$$;


-- ============================================================
-- 7. Storage 버킷 생성 (Dashboard UI에서 직접 생성 가능)
-- ============================================================
-- Storage > Buckets > New Bucket
--   Name: extensions
--   Public: true (ZIP 다운로드용 공개 버킷)
-- ============================================================
