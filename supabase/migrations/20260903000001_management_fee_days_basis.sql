-- 선주(companies)별 관리비 일할계산 기준 — 급여 월 계산 기준(month_days_basis)과 별개로,
-- 관리비는 30일 고정으로 계산하는 선주도 있고 그 달 실제 일수로 계산하는 선주도 있다.
-- 기본값 'actual'은 지금까지의 동작(그 달 실제 일수)을 그대로 유지한다.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS management_fee_days_basis TEXT NOT NULL DEFAULT 'actual'
  CHECK (management_fee_days_basis IN ('30', 'actual'));
