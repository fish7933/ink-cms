-- 연차 적용 제외자(임원 등) 플래그. 직급 단위가 아니라 사람 단위 예외이므로 users에 둔다
-- (같은 직급이라도 개인별로 연차 관리 대상 여부가 다를 수 있음).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_leave_exempt BOOLEAN NOT NULL DEFAULT false;
