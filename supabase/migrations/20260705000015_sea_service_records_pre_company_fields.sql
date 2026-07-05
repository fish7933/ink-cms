-- 승선 경력 중 "입사 전 경력"(pre_company)의 경우 선주사/선박관리사/매닝사 정보를
-- 남길 수 있도록 컬럼 추가 (외부 회사일 수 있어 자유 텍스트로 받는다).
ALTER TABLE sea_service_records
  ADD COLUMN IF NOT EXISTS owner_company_name TEXT,
  ADD COLUMN IF NOT EXISTS ship_manager_name TEXT,
  ADD COLUMN IF NOT EXISTS manning_agency_name TEXT;
