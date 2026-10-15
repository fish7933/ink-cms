-- 전 세계 사용자가 접속하는 시스템을 한글/영문 토글로 쓸 수 있게 하면서, 선택한 언어가
-- 기기가 아니라 계정에 귀속되어 재로그인/다른 기기에서도 이어지도록 한다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'ko';
