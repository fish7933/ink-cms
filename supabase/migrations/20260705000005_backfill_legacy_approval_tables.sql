-- crew_recommendation_approvals / approval_line_steps / approval_actions는
-- 이미 라이브 DB에 존재하지만(선원추천 결재 기능이 실제로 쓰고 있음) 이 repo의
-- 마이그레이션 히스토리에 생성 기록이 없다 (job_posting_groups, shore_positions와
-- 같은 패턴 — 대시보드에서 직접 만들어진 것으로 추정). CREATE TABLE IF NOT EXISTS로
-- 실제 컬럼 그대로 기록해서 `npm run migrate`가 다시 신뢰 가능한 상태가 되게 한다.
-- 주의: 실제 라이브 컬럼명은 approval_request_id / comments(복수형)이다. 앱 코드 일부가
-- crew_recommendation_approval_id / comment(단수형)로 잘못 참조하던 기존 버그는
-- src/services/approval.service.ts에서 별도로 수정했다 (이 마이그레이션은 스키마 문서화만 담당).

CREATE TABLE IF NOT EXISTS approval_line_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  approval_line_id UUID REFERENCES approval_lines(id) ON DELETE CASCADE NOT NULL,
  step_order INTEGER NOT NULL,
  approver_id UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  approver_name TEXT NOT NULL,
  approver_role TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approval_line_steps_line ON approval_line_steps(approval_line_id);

CREATE TABLE IF NOT EXISTS crew_recommendation_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_recommendation_id UUID REFERENCES crew_recommendations(id) ON DELETE CASCADE NOT NULL,
  approval_line_id UUID REFERENCES approval_lines(id) ON DELETE SET NULL,
  requester_id UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  requester_comment TEXT,
  current_step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  final_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_crew_recommendation_approvals_rec ON crew_recommendation_approvals(crew_recommendation_id);

CREATE TABLE IF NOT EXISTS approval_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  approval_request_id UUID NOT NULL, -- crew_recommendation_approvals.id를 가리킴 (원래 범용 approval_requests용으로 만들어졌던 컬럼을 재사용 중)
  step_order INTEGER NOT NULL,
  approver_id UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  acted_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_approval_actions_request ON approval_actions(approval_request_id);

ALTER TABLE approval_line_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_recommendation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_approval_line_steps" ON approval_line_steps;
CREATE POLICY "allow_all_approval_line_steps" ON approval_line_steps FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_crew_recommendation_approvals" ON crew_recommendation_approvals;
CREATE POLICY "allow_all_crew_recommendation_approvals" ON crew_recommendation_approvals FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_approval_actions" ON approval_actions;
CREATE POLICY "allow_all_approval_actions" ON approval_actions FOR ALL USING (true) WITH CHECK (true);
