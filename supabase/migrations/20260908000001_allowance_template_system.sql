-- 수당/공제 체계 재설계: "항목(정체성)"과 "선주별 템플릿(실제 적용 기준)"을 분리한다.
-- 지금까지는 유형(allowance_types) 하나에 지급방식/지급주체까지 전역으로 묶여 있었고
-- 직급별 금액(allowance_rank_rates)도 선주 구분 없이 하나뿐이었다 — 실제로는 같은
-- "재고용수당"이라도 선주마다 금액/지급방식/지급주체가 다르므로, 급여표(salary_templates)/
-- 관리비 템플릿(management_fee_templates)과 동일한 구조(카탈로그 → 템플릿 → 선박/플릿/선주
-- 배정 → 유효기간 버전)를 그대로 이식한다. 직급 차원은 관리비처럼 여러 축이 아니라
-- 급여표처럼 직급(rank_id) 단일 축이라, 매트릭스에 가까운 단순 구조로 둔다.

-- 1. 카탈로그 rename: allowance_types → allowance_items (management_fee_items 명명과 통일)
ALTER TABLE allowance_types RENAME TO allowance_items;
ALTER TABLE crew_contract_allowances RENAME COLUMN allowance_type_id TO allowance_item_id;

ALTER TABLE allowance_items ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- allowance_items.payment_basis/payment_method는 더 이상 구속력이 없다 — 템플릿에 항목을
-- 추가할 때 제안되는 기본값일 뿐이며(management_fee_items.default_billing_basis와 동일 성격),
-- 실제 적용값은 allowance_template_items 행마다 별도로 저장한다.
COMMENT ON COLUMN allowance_items.payment_basis IS
  '템플릿에 항목 추가 시 기본으로 제안할 값일 뿐 — 실제 적용값은 allowance_template_items 행마다 별도로 저장 (management_fee_items.default_billing_basis와 동일 패턴)';
COMMENT ON COLUMN allowance_items.payment_method IS
  '템플릿에 항목 추가 시 기본으로 제안할 값일 뿐 — 실제 적용값은 allowance_template_items 행마다 별도로 저장';

-- 2. 전역 미배정 직급별 요율 테이블은 삭제 (0건, 템플릿 시스템으로 완전 대체 — 전역 요율과
--    선주별 템플릿이 공존하면 rotation.service.ts에서 실제로 겪었던 것과 같은 "컬럼은 지웠는데
--    참조는 안 지운" 이원화 사고가 재발할 위험이 있어 남겨두지 않는다).
DROP TABLE IF EXISTS allowance_rank_rates;

-- 3. payment_basis 값 집합 확장: 'lump_sum'(의미 불명확) → 'disembark_settlement'(하선월 정산)로
--    이름을 정리하고, '승선월 1회 지급'을 뜻하는 'on_embark_once'를 새로 추가한다.
ALTER TABLE allowance_items DROP CONSTRAINT IF EXISTS allowance_types_payment_basis_check;
ALTER TABLE allowance_items ADD CONSTRAINT allowance_items_payment_basis_check
  CHECK (payment_basis IN ('monthly', 'on_embark_once', 'disembark_settlement'));

ALTER TABLE crew_contract_allowances DROP CONSTRAINT IF EXISTS crew_contract_allowances_payment_basis_check;
ALTER TABLE crew_contract_allowances ADD CONSTRAINT crew_contract_allowances_payment_basis_check
  CHECK (payment_basis IN ('monthly', 'on_embark_once', 'disembark_settlement'));

-- 4. 템플릿 (management_fee_templates와 동일한 버전관리 구조)
CREATE TABLE IF NOT EXISTS allowance_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE NULL, -- NULL = 현재 활성 버전
  root_template_id UUID NULL REFERENCES allowance_templates(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. 템플릿 항목 — 직급(rank_id) 단일 축. NULL이면 전 직급 공통 적용.
CREATE TABLE IF NOT EXISTS allowance_template_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES allowance_templates(id) ON DELETE CASCADE NOT NULL,
  allowance_item_id UUID REFERENCES allowance_items(id) ON DELETE CASCADE NOT NULL,
  rank_id UUID NULL REFERENCES ranks(id) ON DELETE CASCADE, -- NULL = 전 직급 공통
  kind TEXT NOT NULL DEFAULT 'allowance' CHECK (kind IN ('allowance', 'deduction')),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_basis TEXT NOT NULL DEFAULT 'monthly' CHECK (payment_basis IN ('monthly', 'on_embark_once', 'disembark_settlement')),
  payment_method TEXT NOT NULL DEFAULT 'owner_billed' CHECK (payment_method IN ('ship_direct', 'owner_billed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- rank_id가 NULL(전 직급 공통)인 행도 같은 항목에 중복 입력되지 않도록, NULL을 빈 문자열
-- sentinel로 치환한 표현식 유니크 인덱스를 쓴다 (management_fee_template_items와 동일 기법).
CREATE UNIQUE INDEX IF NOT EXISTS idx_allowance_template_items_unique
  ON allowance_template_items (template_id, allowance_item_id, COALESCE(rank_id::text, ''));

CREATE INDEX IF NOT EXISTS idx_allowance_templates_root ON allowance_templates(root_template_id);
CREATE INDEX IF NOT EXISTS idx_allowance_templates_current ON allowance_templates(effective_until) WHERE effective_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_allowance_template_items_template ON allowance_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_allowance_template_items_item ON allowance_template_items(allowance_item_id);
CREATE INDEX IF NOT EXISTS idx_allowance_template_items_rank ON allowance_template_items(rank_id);

-- 6. 선박/플릿/선주 배정 (management_fee_templates의 세 배정 테이블과 동일 구조)
CREATE TABLE IF NOT EXISTS ship_allowance_template_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ship_id UUID REFERENCES ships(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES allowance_templates(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(ship_id, template_id)
);

CREATE TABLE IF NOT EXISTS fleet_allowance_template_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES allowance_templates(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(fleet_id, template_id)
);

CREATE TABLE IF NOT EXISTS owner_allowance_template_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES allowance_templates(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(owner_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_ship_allow_tmpl_assign_ship ON ship_allowance_template_assignments(ship_id);
CREATE INDEX IF NOT EXISTS idx_ship_allow_tmpl_assign_template ON ship_allowance_template_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_fleet_allow_tmpl_assign_fleet ON fleet_allowance_template_assignments(fleet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_allow_tmpl_assign_template ON fleet_allowance_template_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_owner_allow_tmpl_assign_owner ON owner_allowance_template_assignments(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_allow_tmpl_assign_template ON owner_allowance_template_assignments(template_id);

-- 7. RLS — 기존 관례대로 allow_all
ALTER TABLE allowance_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowance_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ship_allowance_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_allowance_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_allowance_template_assignments ENABLE ROW LEVEL SECURITY;

-- allowance_items(구 allowance_types)/crew_contract_allowances는 테이블 rename만 됐을 뿐이라
-- RLS는 이미 켜져 있고 정책도 테이블 rename을 따라간다 (정책명만 구 이름이라 참고용으로 갱신).
DROP POLICY IF EXISTS "allow_all_allowance_types" ON allowance_items;
CREATE POLICY "allow_all_allowance_items" ON allowance_items FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_allowance_templates" ON allowance_templates;
CREATE POLICY "allow_all_allowance_templates" ON allowance_templates FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_allowance_template_items" ON allowance_template_items;
CREATE POLICY "allow_all_allowance_template_items" ON allowance_template_items FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_ship_allow_tmpl_assign" ON ship_allowance_template_assignments;
CREATE POLICY "allow_all_ship_allow_tmpl_assign" ON ship_allowance_template_assignments FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_fleet_allow_tmpl_assign" ON fleet_allowance_template_assignments;
CREATE POLICY "allow_all_fleet_allow_tmpl_assign" ON fleet_allowance_template_assignments FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_owner_allow_tmpl_assign" ON owner_allowance_template_assignments;
CREATE POLICY "allow_all_owner_allow_tmpl_assign" ON owner_allowance_template_assignments FOR ALL USING (true);
