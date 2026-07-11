-- 선원추천 결재함에서 승인/반려/취소로 결정이 난 건을 삭제할 때, 누가 추천하고
-- 누가 어떤 의견으로 결재했는지에 대한 히스토리를 영구 보존하는 append-only 로그.
-- crew_recommendation_approvals/approval_actions 원본 행은 삭제되어도 이 로그는 남는다.
CREATE TABLE IF NOT EXISTS crew_recommendation_approval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_recommendation_id UUID REFERENCES crew_recommendations(id) ON DELETE SET NULL,
  crew_name TEXT NOT NULL,
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

ALTER TABLE crew_recommendation_approval_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_crew_recommendation_approval_log ON crew_recommendation_approval_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crew_recommendation_approval_log_deleted_at ON crew_recommendation_approval_log(deleted_at DESC);
