-- 육상 직원(users.role in ship_manager/admin/system_admin) 급여관리. 선원 급여
-- 템플릿 시스템(salary_templates 등)과는 완전히 별개 도메인 — 직원마다 급여 항목을
-- 직접 입력하는 단순 구조이며, 결재 엔진과 연동하지 않는다.

-- 직원별 급여 항목(정보관리) — 상시 편집 가능한 "현재" 값
CREATE TABLE employee_salary_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('base', 'allowance', 'deduction')),
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_employee_salary_items_user ON employee_salary_items(user_id);

-- 월별 지급 회차
CREATE TABLE employee_payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL UNIQUE, -- 'YYYY-MM'
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 직원별 그 달의 급여명세 — 확정 시점 금액 스냅샷(합계)
CREATE TABLE employee_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES employee_payroll_periods(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  base_amount numeric NOT NULL DEFAULT 0,
  total_allowance numeric NOT NULL DEFAULT 0,
  total_deduction numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  payment_date date,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_id, user_id)
);
CREATE INDEX idx_employee_payslips_period ON employee_payslips(period_id);
CREATE INDEX idx_employee_payslips_user ON employee_payslips(user_id);

-- 급여명세 항목 스냅샷 — employee_salary_items를 생성 시점에 복사해둔 것.
-- 나중에 직원의 "현재" 급여 항목이 바뀌어도 이미 확정/생성된 명세서 금액은 그대로 유지된다.
CREATE TABLE employee_payslip_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id uuid NOT NULL REFERENCES employee_payslips(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('base', 'allowance', 'deduction')),
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_employee_payslip_items_payslip ON employee_payslip_items(payslip_id);

ALTER TABLE employee_salary_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_salary_items_all" ON employee_salary_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE employee_payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_payroll_periods_all" ON employee_payroll_periods FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE employee_payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_payslips_all" ON employee_payslips FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE employee_payslip_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_payslip_items_all" ON employee_payslip_items FOR ALL USING (true) WITH CHECK (true);
