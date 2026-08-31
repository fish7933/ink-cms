-- 청구 항목 과금 방식에 "월정기(전액)" 추가: 일할계산 없이, 그 달에 하루라도 승선했으면
-- 월 기준액 전액을 청구하는 방식. 기존 "월정기(일할계산)"(monthly)과 구분되는 별도 값.
ALTER TABLE management_fee_items DROP CONSTRAINT IF EXISTS management_fee_items_default_billing_basis_check;
ALTER TABLE management_fee_items ADD CONSTRAINT management_fee_items_default_billing_basis_check
  CHECK (default_billing_basis IN ('monthly', 'monthly_flat', 'one_time', 'actual_cost'));

ALTER TABLE management_fee_template_items DROP CONSTRAINT IF EXISTS management_fee_template_items_billing_basis_check;
ALTER TABLE management_fee_template_items ADD CONSTRAINT management_fee_template_items_billing_basis_check
  CHECK (billing_basis IN ('monthly', 'monthly_flat', 'one_time', 'actual_cost'));

ALTER TABLE management_fee_lines DROP CONSTRAINT IF EXISTS management_fee_lines_billing_basis_check;
ALTER TABLE management_fee_lines ADD CONSTRAINT management_fee_lines_billing_basis_check
  CHECK (billing_basis IN ('monthly', 'monthly_flat', 'one_time', 'actual_cost'));
