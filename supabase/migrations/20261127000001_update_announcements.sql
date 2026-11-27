-- 로그인 화면에 보여줄 "프로그램 업데이트 소식" — 회사 크레딧 바로 위에 동적으로 표시된다.
-- 의미 있는 업데이트를 할 때마다 한 줄 요약을 이 테이블에 추가한다(Claude가 세션에서 직접 추가).
CREATE TABLE IF NOT EXISTS update_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
