-- 선주사/매닝사 등록 시 선택사항인 컬럼의 NOT NULL 제약 일괄 제거
ALTER TABLE companies
  ALTER COLUMN country       DROP NOT NULL,
  ALTER COLUMN email         DROP NOT NULL,
  ALTER COLUMN phone         DROP NOT NULL;
