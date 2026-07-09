-- 연차를 일 단위가 아니라 시간 단위(반차/시간차 등)까지 관리할 수 있도록 변경.
-- 1일 = 8시간 기준으로 기존 days 값을 hours로 환산해 이관한다.

ALTER TABLE shore_leave_requests ADD COLUMN IF NOT EXISTS hours DECIMAL(6,1);
UPDATE shore_leave_requests SET hours = days * 8 WHERE hours IS NULL;
ALTER TABLE shore_leave_requests ALTER COLUMN hours SET NOT NULL;
ALTER TABLE shore_leave_requests ADD CONSTRAINT shore_leave_requests_hours_positive CHECK (hours > 0);
ALTER TABLE shore_leave_requests DROP COLUMN days;
