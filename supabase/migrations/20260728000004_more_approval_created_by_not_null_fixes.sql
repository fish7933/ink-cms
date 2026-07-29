-- approval_documents.created_by와 같은 모순(ON DELETE SET NULL + NOT NULL)이 있는 다른
-- 결재 관련 감사 컬럼들도 같은 이유로 사용자 삭제를 막고 있어 전부 같이 고친다.
ALTER TABLE approval_requests ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE approval_actions ALTER COLUMN approver_id DROP NOT NULL;
ALTER TABLE approval_line_steps ALTER COLUMN approver_id DROP NOT NULL;
ALTER TABLE crew_recommendation_approvals ALTER COLUMN requester_id DROP NOT NULL;
ALTER TABLE approval_document_steps ALTER COLUMN approver_id DROP NOT NULL;
