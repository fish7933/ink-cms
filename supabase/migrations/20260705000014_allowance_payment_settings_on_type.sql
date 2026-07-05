-- 수당의 지급방식(매월/일시불)과 지급주체(본선직접/선주청구)는 직급별로 다르게
-- 설정하지 않고 수당 유형 전체에 일괄 적용한다. 직급별로는 금액만 다르게 둔다.
ALTER TABLE allowance_types
  ADD COLUMN IF NOT EXISTS payment_basis TEXT NOT NULL DEFAULT 'monthly' CHECK (payment_basis IN ('monthly', 'lump_sum')),
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'owner_billed' CHECK (payment_method IN ('ship_direct', 'owner_billed'));

ALTER TABLE allowance_rank_rates
  DROP COLUMN IF EXISTS default_payment_basis,
  DROP COLUMN IF EXISTS default_payment_method;
