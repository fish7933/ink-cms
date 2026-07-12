-- 선원 고과(crew_evaluations)와 같은 구조로, 상병(부상/질병) 기록도 어느 승선 기록(어느 배에
-- 승선 중/승선했을 때) 발생했는지 연결할 수 있도록 한다. medical_records는 기존에 검진/접종/기타
-- 유형도 포괄했지만, "상병 관리"로 범위를 좁혀 부상/질병만 남긴다 (기존 데이터 0건으로 안전).
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS sea_service_record_id uuid REFERENCES sea_service_records(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_medical_records_sea_service ON medical_records(sea_service_record_id);

ALTER TABLE medical_records DROP CONSTRAINT IF EXISTS medical_records_record_type_check;
ALTER TABLE medical_records ADD CONSTRAINT medical_records_record_type_check
  CHECK (record_type = ANY (ARRAY['injury'::text, 'illness'::text]));
