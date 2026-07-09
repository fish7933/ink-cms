-- 신청서에서 입력한 시작/종료 "시각"을 그대로 저장해, 같은 날짜라도 시간대가 겹치지 않으면
-- 별개 신청으로 구분할 수 있게 한다 (중복 신청 검사에 사용).
ALTER TABLE shore_leave_requests ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE shore_leave_requests ADD COLUMN IF NOT EXISTS end_time TIME;
UPDATE shore_leave_requests SET start_time = '09:00', end_time = '18:00' WHERE start_time IS NULL;
ALTER TABLE shore_leave_requests ALTER COLUMN start_time SET NOT NULL;
ALTER TABLE shore_leave_requests ALTER COLUMN end_time SET NOT NULL;
ALTER TABLE shore_leave_requests ALTER COLUMN start_time SET DEFAULT '09:00';
ALTER TABLE shore_leave_requests ALTER COLUMN end_time SET DEFAULT '18:00';

ALTER TABLE sick_leave_requests ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE sick_leave_requests ADD COLUMN IF NOT EXISTS end_time TIME;
UPDATE sick_leave_requests SET start_time = '09:00', end_time = '18:00' WHERE start_time IS NULL;
ALTER TABLE sick_leave_requests ALTER COLUMN start_time SET NOT NULL;
ALTER TABLE sick_leave_requests ALTER COLUMN end_time SET NOT NULL;
ALTER TABLE sick_leave_requests ALTER COLUMN start_time SET DEFAULT '09:00';
ALTER TABLE sick_leave_requests ALTER COLUMN end_time SET DEFAULT '18:00';
