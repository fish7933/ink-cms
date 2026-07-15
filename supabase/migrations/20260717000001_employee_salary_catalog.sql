-- 회사 공통 급여 항목 카탈로그 — 지금까지는 직원마다 급여 항목명을 자유 입력해서 같은 항목도
-- 사람마다 이름이 달라질 수 있었다. 카탈로그에서 항목을 골라 개인별 금액만 입력하는 구조로
-- 전환하되, 기존 employee_salary_items의 자유 입력 구조 자체는 유지한다(catalog_id가 없으면
-- 여전히 일회성 직접입력 항목으로 취급).
CREATE TABLE employee_salary_item_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('base','allowance','deduction')),
  pay_group TEXT CHECK (pay_group IS NULL OR pay_group IN ('variable','nontax','other')),
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE employee_salary_item_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON employee_salary_item_catalog FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE employee_salary_items
  ADD COLUMN IF NOT EXISTS catalog_id UUID REFERENCES employee_salary_item_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pay_group TEXT CHECK (pay_group IS NULL OR pay_group IN ('variable','nontax','other'));

ALTER TABLE employee_payslip_items
  ADD COLUMN IF NOT EXISTS pay_group TEXT CHECK (pay_group IS NULL OR pay_group IN ('variable','nontax','other'));
