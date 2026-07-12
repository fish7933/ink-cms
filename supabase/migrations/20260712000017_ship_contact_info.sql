-- 선박의 연락처/이메일 정보 — 향후 교대계획, 급여명세서 등을 선박(현지)으로 직접
-- 발송할 때 연동에 필요하다.
ALTER TABLE ships ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS email text;
