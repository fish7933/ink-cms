-- 연차 사용/잔여 초기화 이력. 초기화 시점(reset_at) 이후에 생성된 신청/수동사용 조정만
-- 잔여 연차 계산에 반영한다 (초기화 이전 것은 계산에서 제외, 화면 이력에는 그대로 남는다).
-- 회사 부여(grant)는 발생 연차 쪽 값이므로 초기화 대상에서 제외한다.
CREATE TABLE IF NOT EXISTS shore_leave_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_history BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shore_leave_resets ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_shore_leave_resets ON shore_leave_resets FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_shore_leave_resets_user_id ON shore_leave_resets(user_id, reset_at DESC);
