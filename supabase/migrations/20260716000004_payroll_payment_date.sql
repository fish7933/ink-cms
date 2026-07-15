-- 급여 지급(예정)일을 회차 단위로 관리한다 — 지출결의서 자동 상신 시 "지출일" 필드를
-- 채우려면 실제 지급일이 있어야 하는데, 지금까지는 그런 값을 저장하는 곳이 없었다.
ALTER TABLE employee_payroll_periods ADD COLUMN IF NOT EXISTS payment_date DATE;

-- 지출결의서 지출 항목 선택지에 "급여"가 없어 급여 지출결의서 자동 상신 시 매번 마땅한
-- 항목을 고를 수 없었다. 기존 항목 뒤에 추가한다.
UPDATE approval_document_types
SET field_schema = jsonb_set(
  field_schema,
  '{1,options}',
  '["급여", "여비교통비", "식비", "소모품비", "접대비", "통신비", "기타"]'::jsonb
)
WHERE code = 'expense_report';
