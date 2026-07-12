-- 회사 정보에 이메일/홈페이지 저장란 추가 (시행문 레터헤드 등에 사용)
ALTER TABLE company_info
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT;
