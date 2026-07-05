-- 교대계획 결재를 범용 결재 엔진(approval_documents)으로 통합.
-- crew_rotation_plans.status(pending_approval/approved/rejected)는 그대로 두되,
-- 실제 결재 진행은 approval_documents/approval_document_steps에서 이루어지고
-- 최종 승인/반려 시 approval-document.service.ts가 plan.status를 동기화한다.

ALTER TABLE crew_rotation_plans
  ADD COLUMN IF NOT EXISTS approval_document_id UUID REFERENCES approval_documents(id) ON DELETE SET NULL;

INSERT INTO approval_document_types (code, name)
VALUES ('rotation_plan', '교대계획 승인')
ON CONFLICT (code) DO NOTHING;
