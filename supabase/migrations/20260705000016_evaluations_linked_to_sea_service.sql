-- 승선 경력(sea_service_records) 건별로 고과(선원 평가)를 연결할 수 있도록.
-- 하나의 승선 경력 기간 동안 여러 건의 평가를 남길 수 있어야 하므로 UNIQUE 제약은 두지 않는다.
ALTER TABLE crew_evaluations
  ADD COLUMN IF NOT EXISTS sea_service_record_id UUID REFERENCES sea_service_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crew_evaluations_sea_service ON crew_evaluations(sea_service_record_id);
