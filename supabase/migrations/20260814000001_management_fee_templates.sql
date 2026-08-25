-- 관리비(선주 청구 관리비) 템플릿 시스템 — 급여 템플릿(salary_templates)과 같은 구조
-- (카탈로그 → 템플릿 → 선박/플릿/선주 배정 → 유효기간 버전)를 따르되, 매칭 차원이
-- 직급(rank+grade) 하나뿐인 급여와 달리 관리비는 청구 항목마다 직급구분/국적/선종 중
-- 일부만 조건으로 걸리는 경우가 많다(3개의 독립적이고 선택적인 차원) — 그래서 rank×grade
-- 매트릭스 대신 "행마다 필요한 조건만 채우는" 희소 행 목록 구조로 설계한다.
-- manning_agency(매닝사/지사) 차원은 의도적으로 포함하지 않는다 — 관리비는 우리 회사가
-- 선주에게 청구하는 금액이고, 매닝사가 우리 회사에 청구하는 금액과는 별개 개념이다.
-- 관리비 항목이 선원 속성으로 갈리는 유일한 축은 국적이다.

CREATE TABLE IF NOT EXISTS management_fee_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, -- 대리점비, 통신비, 선발비, 사회보장기금, 신체검사비 등
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- 템플릿에 항목을 추가할 때 기본으로 제안할 값일 뿐, 실제 적용되는 billing_basis는 항목별로
  -- (선주마다 실비/고정 여부가 다를 수 있어) management_fee_template_items에 별도로 저장한다.
  default_billing_basis TEXT NOT NULL DEFAULT 'monthly'
    CHECK (default_billing_basis IN ('monthly', 'one_time', 'actual_cost')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS management_fee_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'USD', -- 템플릿 기본 통화 — 항목별 currency가 있으면 그 값이 우선
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE NULL, -- NULL = 현재 활성 버전 (salary_templates와 동일한 버전 이력 패턴)
  root_template_id UUID NULL REFERENCES management_fee_templates(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS management_fee_template_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES management_fee_templates(id) ON DELETE CASCADE NOT NULL,
  fee_item_id UUID REFERENCES management_fee_items(id) ON DELETE CASCADE NOT NULL,
  -- 세 차원 모두 선택: NULL이면 "해당 조건 무관(전체 적용)"이라는 뜻. 승/부원만 다르면
  -- rank_category 한 줄, 국적만 다르면 nationality_code 한 줄만 채우면 된다.
  rank_category TEXT NULL CHECK (rank_category IN ('officer', 'rating')),
  nationality_code TEXT NULL, -- crew_members.nationality와 동일한 규약으로 매칭 (FK 없음)
  ship_type TEXT NULL, -- ships.ship_type과 동일한 규약으로 매칭 (FK 없음)
  billing_basis TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_basis IN ('monthly', 'one_time', 'actual_cost')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0, -- billing_basis='actual_cost'면 0/미사용, 계산 엔진이 무시
  currency TEXT NOT NULL DEFAULT 'USD', -- 항목별 통화 오버라이드(IDR/MMK 등 로컬 통화 가능)
  -- 선박당 월 합계 상한(전체 선원 합산 기준). 같은 fee_item_id의 여러 행(직급/국적별 조건
  -- 분기) 중 상한을 지정하는 행이 여럿이면 반드시 같은 금액+통화여야 한다 — 상한은 개별
  -- 조건이 아니라 "그 청구 항목 자체"에 속하는 값이기 때문. 이 일관성은 애플리케이션
  -- 레이어(management-fee-store.ts)에서 저장 시점에 검증한다(테이블 CHECK로는 행끼리
  -- 비교가 안 되어 여기서 강제할 수 없다).
  ship_cap_amount NUMERIC(12,2) NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 세 optional 차원을 전부 유니크 키에 넣어 동일 조건 조합 중복 입력을 막는다. Postgres UNIQUE는
-- NULL끼리 서로 다른 값으로 취급해 "전체 적용(NULL,NULL,NULL)" 행이 같은 항목에 여러 개 들어가는
-- 걸 막지 못하므로, COALESCE로 NULL을 빈 문자열 sentinel로 치환한 표현식 유니크 인덱스를 쓴다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_management_fee_template_items_unique
  ON management_fee_template_items (
    template_id, fee_item_id,
    COALESCE(rank_category, ''), COALESCE(nationality_code, ''), COALESCE(ship_type, '')
  );

CREATE INDEX IF NOT EXISTS idx_management_fee_templates_root ON management_fee_templates(root_template_id);
CREATE INDEX IF NOT EXISTS idx_management_fee_templates_current ON management_fee_templates(effective_until) WHERE effective_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_management_fee_template_items_template ON management_fee_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_management_fee_template_items_fee_item ON management_fee_template_items(fee_item_id);

CREATE TABLE IF NOT EXISTS ship_management_fee_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ship_id UUID REFERENCES ships(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES management_fee_templates(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(ship_id, template_id)
);

CREATE TABLE IF NOT EXISTS fleet_management_fee_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES management_fee_templates(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(fleet_id, template_id)
);

CREATE TABLE IF NOT EXISTS owner_management_fee_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES management_fee_templates(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(owner_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_ship_mgmt_fee_assign_ship ON ship_management_fee_assignments(ship_id);
CREATE INDEX IF NOT EXISTS idx_ship_mgmt_fee_assign_template ON ship_management_fee_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_fleet_mgmt_fee_assign_fleet ON fleet_management_fee_assignments(fleet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_mgmt_fee_assign_template ON fleet_management_fee_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_owner_mgmt_fee_assign_owner ON owner_management_fee_assignments(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_mgmt_fee_assign_template ON owner_management_fee_assignments(template_id);

ALTER TABLE management_fee_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_fee_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_fee_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ship_management_fee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_management_fee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_management_fee_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_management_fee_items" ON management_fee_items;
CREATE POLICY "allow_all_management_fee_items" ON management_fee_items FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_management_fee_templates" ON management_fee_templates;
CREATE POLICY "allow_all_management_fee_templates" ON management_fee_templates FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_management_fee_template_items" ON management_fee_template_items;
CREATE POLICY "allow_all_management_fee_template_items" ON management_fee_template_items FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_ship_mgmt_fee_assign" ON ship_management_fee_assignments;
CREATE POLICY "allow_all_ship_mgmt_fee_assign" ON ship_management_fee_assignments FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_fleet_mgmt_fee_assign" ON fleet_management_fee_assignments;
CREATE POLICY "allow_all_fleet_mgmt_fee_assign" ON fleet_management_fee_assignments FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_owner_mgmt_fee_assign" ON owner_management_fee_assignments;
CREATE POLICY "allow_all_owner_mgmt_fee_assign" ON owner_management_fee_assignments FOR ALL USING (true);
