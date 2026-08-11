-- 관리자가 이미 확정(confirmed)된 자금일보를 결재 없이 즉시 취소하고 다시 작성할 수 있게 한다.
-- 최근 취소 사유만 보관한다(shore_leave_admin_log처럼 별도 이력 테이블을 쓰지 않는 단순한 필드).
ALTER TABLE accounting_daily_reports
  ADD COLUMN IF NOT EXISTS last_cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_cancelled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS last_cancel_reason TEXT;
