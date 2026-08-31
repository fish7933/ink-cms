-- 선원에게 지급하는 시점(payment_type: monthly/deferred)과 선주에게 청구하는 시점은
-- 서로 독립적인 개념이다. 예: L/P(휴가비)는 선원에게는 하선월에 일괄 지급(deferred)되지만
-- 선주에게는 매달 적립분을 청구해 회사가 보관하고, C/C/B(계약종료보너스)는 선원/선주 양쪽
-- 다 하선월에만 발생한다. 이를 구분하기 위해 "선주 청구 시점" 필드를 별도로 둔다.
ALTER TABLE salary_components ADD COLUMN IF NOT EXISTS owner_billing_basis TEXT NOT NULL DEFAULT 'monthly'
  CHECK (owner_billing_basis IN ('monthly', 'on_disembark'));

-- 계약종료시 지급(C/C/B)은 선주에게도 하선월에만 일괄 청구
UPDATE salary_components SET owner_billing_basis = 'on_disembark' WHERE name = 'C/C/B';
