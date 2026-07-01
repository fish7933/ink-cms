-- 선주사별 급여 월 계산 기준 추가
-- '30': 한달을 30일로 고정
-- 'actual': 해당 월의 실제 날수 사용

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS month_days_basis TEXT NOT NULL DEFAULT '30'
  CHECK (month_days_basis IN ('30', 'actual'));

COMMENT ON COLUMN companies.month_days_basis IS '급여 계산 시 월 일수 기준: 30=고정 30일, actual=해당 월 실제 일수';
