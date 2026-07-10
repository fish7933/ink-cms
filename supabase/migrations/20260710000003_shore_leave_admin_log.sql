-- 육상 직원 연차 관리(관리자 전용 메뉴)에서 발생하는 관리자 작업(부여/차감/초기화/제외 지정-해제)을
-- 누가(performed_by) 언제 어떤 대상(user_id)에게 수행했는지 남기는 감사 로그. UI에서 삭제 기능을 두지 않는다.
CREATE TABLE IF NOT EXISTS shore_leave_admin_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('grant', 'manual_use', 'reset', 'exempt_on', 'exempt_off')),
  hours DECIMAL(6,1),
  reason TEXT,
  performed_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shore_leave_admin_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_shore_leave_admin_log ON shore_leave_admin_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_shore_leave_admin_log_created_at ON shore_leave_admin_log(created_at DESC);
