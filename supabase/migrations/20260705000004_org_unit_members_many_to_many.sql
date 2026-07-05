-- 한 사람이 여러 부서에 동시에 소속될 수 있어야 함
-- (예: 이승혁 차장은 해무1팀 팀원이면서 해무2팀 팀장, 박진용 이사는 총괄이면서 해무1팀 팀장).
-- users.org_unit_id 단일 컬럼(1인 1부서)으로는 표현할 수 없어 다대다 조인 테이블로 교체한다.
-- 부서장(head_user_id)은 이미 부서별 독립 컬럼이라 한 사람이 여러 부서의 부서장이 되는 것은
-- 기존 구조로도 가능했음 — 이번 변경은 "일반 소속(멤버십)"만 다대다로 넓히는 것.

CREATE TABLE IF NOT EXISTS org_unit_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_unit_id UUID REFERENCES org_units(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(org_unit_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_unit_members_unit ON org_unit_members(org_unit_id);
CREATE INDEX IF NOT EXISTS idx_org_unit_members_user ON org_unit_members(user_id);

ALTER TABLE org_unit_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_org_unit_members" ON org_unit_members;
CREATE POLICY "allow_all_org_unit_members" ON org_unit_members FOR ALL USING (true) WITH CHECK (true);

-- 아직 실사용 데이터가 없는 1:1 소속 컬럼은 제거 (다대다 조인 테이블로 대체)
ALTER TABLE users DROP COLUMN IF EXISTS org_unit_id;
