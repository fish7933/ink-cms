-- ============================================================
-- 발령 시스템 마이그레이션
-- - 등록출처 / Grade 시스템 / 발령 기록 / 승진강등 발령
-- ============================================================
BEGIN;

-- ─────────────────────────────────────────────
-- 1. crew_members: 등록출처 + Grade 추가
-- ─────────────────────────────────────────────
ALTER TABLE crew_members
  ADD COLUMN IF NOT EXISTS registration_source TEXT DEFAULT 'company_direct'
    CHECK (registration_source IN ('agency_recommended', 'agency_direct', 'company_direct')),
  ADD COLUMN IF NOT EXISTS current_grade CHAR(1)
    CHECK (current_grade IN ('A', 'B', 'C', 'D'));

COMMENT ON COLUMN crew_members.registration_source IS
  'agency_recommended: 매닝사 추천→결재등록 | agency_direct: 매닝사직접 | company_direct: 본사직접';
COMMENT ON COLUMN crew_members.current_grade IS
  '현재 적용 급여 Grade (A>B>C>D 순으로 높음)';

-- status 트리거 버그 수정: 'on_board' → 'onboard'
CREATE OR REPLACE FUNCTION update_crew_status_on_embarkation()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.status = 'active' AND NEW.disembark_date IS NULL THEN
      UPDATE crew_members
      SET status = 'onboard',
          current_ship_id = NEW.ship_id,
          onboard_date = NEW.embark_date,
          current_grade = COALESCE(NEW.rank_grade, current_grade),
          updated_at = NOW()
      WHERE id = NEW.crew_member_id;
    ELSIF NEW.status = 'completed' AND NEW.disembark_date IS NOT NULL THEN
      UPDATE crew_members
      SET status = 'standby',
          current_ship_id = NULL,
          offboard_date = NEW.disembark_date,
          updated_at = NOW()
      WHERE id = NEW.crew_member_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- 2. crew_embarkation_records: Grade + 날짜 추가
-- ─────────────────────────────────────────────
ALTER TABLE crew_embarkation_records
  ADD COLUMN IF NOT EXISTS rank_grade CHAR(1)
    CHECK (rank_grade IN ('A', 'B', 'C', 'D')),
  ADD COLUMN IF NOT EXISTS departure_date DATE,   -- 출국일
  ADD COLUMN IF NOT EXISTS return_date DATE;       -- 귀국일

COMMENT ON COLUMN crew_embarkation_records.rank_grade IS '승선 기간 중 적용된 Grade';
COMMENT ON COLUMN crew_embarkation_records.departure_date IS '출국일 (승선일과 다를 수 있음)';
COMMENT ON COLUMN crew_embarkation_records.return_date IS '귀국일 (하선일과 다를 수 있음)';

-- ─────────────────────────────────────────────
-- 3. crew_rotation_assignments: Grade + 날짜 확장
-- ─────────────────────────────────────────────
ALTER TABLE crew_rotation_assignments
  ADD COLUMN IF NOT EXISTS on_rank_grade CHAR(1)
    CHECK (on_rank_grade IN ('A', 'B', 'C', 'D')),
  ADD COLUMN IF NOT EXISTS off_rank_grade CHAR(1)
    CHECK (off_rank_grade IN ('A', 'B', 'C', 'D')),
  ADD COLUMN IF NOT EXISTS on_departure_date DATE,   -- 승선자 출국일
  ADD COLUMN IF NOT EXISTS off_disembark_date DATE,  -- 하선자 하선일
  ADD COLUMN IF NOT EXISTS off_return_date DATE;     -- 하선자 귀국일

-- ─────────────────────────────────────────────
-- 4. salary_template_items: Grade 컬럼 추가
-- ─────────────────────────────────────────────
ALTER TABLE salary_template_items
  ADD COLUMN IF NOT EXISTS rank_grade CHAR(1)
    CHECK (rank_grade IN ('A', 'B', 'C', 'D'));

COMMENT ON COLUMN salary_template_items.rank_grade IS
  'NULL이면 전 Grade 공통 적용, 값이 있으면 해당 Grade에만 적용';

-- ─────────────────────────────────────────────
-- 5. crew_dispatch_orders: 승진/강등 발령 신규 테이블
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crew_dispatch_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  ship_id        UUID REFERENCES ships(id) ON DELETE SET NULL,   -- 발령 당시 승선 중인 선박

  dispatch_type TEXT NOT NULL CHECK (dispatch_type IN ('promotion', 'demotion')),

  -- 변경 전
  previous_rank_id UUID REFERENCES ranks(id) ON DELETE SET NULL,
  previous_grade   CHAR(1) CHECK (previous_grade IN ('A', 'B', 'C', 'D')),

  -- 변경 후
  new_rank_id UUID REFERENCES ranks(id) ON DELETE SET NULL,
  new_grade   CHAR(1) CHECK (new_grade IN ('A', 'B', 'C', 'D')),

  effective_date DATE NOT NULL,

  -- 결재 연동
  approval_request_id UUID,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'executed')),

  notes      TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dispatch_orders_crew   ON crew_dispatch_orders(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_ship   ON crew_dispatch_orders(ship_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_status ON crew_dispatch_orders(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_type   ON crew_dispatch_orders(dispatch_type);

ALTER TABLE crew_dispatch_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_dispatch_orders" ON crew_dispatch_orders;
CREATE POLICY "allow_all_dispatch_orders" ON crew_dispatch_orders FOR ALL USING (true);

-- ─────────────────────────────────────────────
-- 6. execute_rotation_plan() 업데이트: Grade 반영
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION execute_rotation_plan(plan_id UUID)
RETURNS VOID AS $$
DECLARE
  a   RECORD;
  p   RECORD;
BEGIN
  SELECT * INTO p FROM crew_rotation_plans WHERE id = plan_id;
  IF p.status != 'approved' THEN
    RAISE EXCEPTION 'Plan must be approved before execution';
  END IF;

  FOR a IN SELECT * FROM crew_rotation_assignments WHERE rotation_plan_id = plan_id LOOP

    -- 하선자: 현재 승선기록 완료 처리
    IF a.off_crew_id IS NOT NULL THEN
      UPDATE crew_embarkation_records
      SET disembark_date = COALESCE(a.off_disembark_date, a.embark_date),
          return_date    = a.off_return_date,
          status         = 'completed',
          updated_at     = NOW()
      WHERE crew_member_id = a.off_crew_id
        AND ship_id = p.ship_id
        AND status = 'active'
        AND disembark_date IS NULL;
    END IF;

    -- 승선자: 새 승선기록 생성
    IF a.on_crew_id IS NOT NULL THEN
      INSERT INTO crew_embarkation_records (
        crew_member_id, ship_id, rank_id, rank_grade,
        departure_date, embark_date,
        contract_months, salary_template_id, salary_amount, salary_currency,
        status, notes
      ) VALUES (
        a.on_crew_id, p.ship_id, a.on_rank_id, a.on_rank_grade,
        a.on_departure_date, a.embark_date,
        a.contract_months, a.salary_template_id, a.salary_amount, a.salary_currency,
        'active', a.notes
      );
    END IF;
  END LOOP;

  UPDATE crew_rotation_plans
  SET status = 'executed', executed_at = NOW(), updated_at = NOW()
  WHERE id = plan_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- 7. execute_dispatch_order(): 승진/강등 발령 실행
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION execute_dispatch_order(order_id UUID)
RETURNS VOID AS $$
DECLARE
  o RECORD;
BEGIN
  SELECT * INTO o FROM crew_dispatch_orders WHERE id = order_id;

  IF o.status != 'approved' THEN
    RAISE EXCEPTION 'Dispatch order must be approved before execution';
  END IF;

  -- crew_members 직급/Grade 업데이트
  UPDATE crew_members
  SET rank_id       = COALESCE(o.new_rank_id, rank_id),
      current_grade = COALESCE(o.new_grade, current_grade),
      updated_at    = NOW()
  WHERE id = o.crew_member_id;

  -- 현재 활성 승선기록에도 반영
  IF o.ship_id IS NOT NULL THEN
    UPDATE crew_embarkation_records
    SET rank_id    = COALESCE(o.new_rank_id, rank_id),
        rank_grade = COALESCE(o.new_grade, rank_grade),
        updated_at = NOW()
    WHERE crew_member_id = o.crew_member_id
      AND ship_id = o.ship_id
      AND status = 'active';
  END IF;

  -- 발령 완료 처리
  UPDATE crew_dispatch_orders
  SET status = 'executed', executed_at = NOW(), updated_at = NOW()
  WHERE id = order_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
