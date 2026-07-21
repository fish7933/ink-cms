-- 교대계획(로테이션 플랜)에서 하선 처리 시 하선사유를 입력받아 계획 실행 시점에
-- sea_service_records.sign_off_reason_id로 반영한다. 상병하선일 경우 초기 상병급여
-- 월액도 함께 입력받아 실행 시 crew_sick_pay_records를 자동 생성한다.
ALTER TABLE crew_rotation_assignments ADD COLUMN IF NOT EXISTS off_sign_off_reason_id UUID REFERENCES sign_off_reasons(id);
ALTER TABLE crew_rotation_assignments ADD COLUMN IF NOT EXISTS off_sick_pay_monthly_amount NUMERIC;
