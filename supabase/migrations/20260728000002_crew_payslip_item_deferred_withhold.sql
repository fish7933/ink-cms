-- 후불성 급여를 부분월(승선 중)에 "정상 어닝 + 즉시 공제" 쌍으로 투명하게 보여주기 위해
-- 도입한 새 payment_type 값('deferred_withhold')을 허용하도록 CHECK 제약을 갱신한다.
ALTER TABLE crew_payslip_items DROP CONSTRAINT IF EXISTS crew_payslip_items_payment_type_check;
ALTER TABLE crew_payslip_items ADD CONSTRAINT crew_payslip_items_payment_type_check
  CHECK (payment_type IN ('immediate', 'deferred_accrual', 'deferred_payout', 'deferred_withhold'));
