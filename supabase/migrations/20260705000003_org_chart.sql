-- 조직도(부서 트리) 관리 기능. 결재선을 사람을 하나하나 고르는 대신
-- 부서를 고르면 그 부서장부터 상위 부서장을 거쳐 최종 결재자까지 자동으로
-- 결재라인을 구성할 수 있도록 하기 위한 기반 테이블.
--
-- 직급(직위) 체계는 이미 존재하는 shore_positions/users.position_id를 그대로 재사용한다.
-- 부서장은 org_units.head_user_id로 명시 지정하거나, 지정이 없으면 해당 부서 소속 인원 중
-- shore_positions.display_order가 가장 낮은(=가장 선임) 사람을 애플리케이션 레벨에서
-- 자동으로 부서장으로 간주한다.

CREATE TABLE IF NOT EXISTS org_units (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES org_units(id) ON DELETE SET NULL,
  head_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_units_parent ON org_units(parent_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_org_unit ON users(org_unit_id);

ALTER TABLE org_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_org_units" ON org_units;
CREATE POLICY "allow_all_org_units" ON org_units FOR ALL USING (true) WITH CHECK (true);
