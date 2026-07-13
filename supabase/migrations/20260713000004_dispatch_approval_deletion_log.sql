-- 발령 결재함의 배승/계약/승진강등 결재 건을 삭제할 때, 결재선/결재자별 승인·반려 이력을
-- 영구 보존하는 append-only 로그 (crew_recommendation_approval_log와 동일한 목적).
-- 3개 도메인이 구조가 동일해 테이블 하나에 domain 컬럼으로 구분해 담는다.
-- rotation_plan_approvals/crew_contract_approvals/dispatch_order_approvals 원본 행은 삭제되어도
-- 이 로그는 남는다.
CREATE TABLE IF NOT EXISTS dispatch_approval_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL CHECK (domain IN ('rotation', 'contract', 'dispatch')),
  target_id UUID,
  subject_label TEXT NOT NULL,
  requester_id UUID REFERENCES users(id) ON DELETE SET NULL,
  requester_name TEXT NOT NULL,
  approval_line_name TEXT,
  final_status TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]',
  requested_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deleted_by UUID NOT NULL REFERENCES users(id),
  deleted_by_name TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dispatch_approval_deletion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_dispatch_approval_deletion_log ON dispatch_approval_deletion_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dispatch_approval_deletion_log_deleted_at ON dispatch_approval_deletion_log(deleted_at DESC);
