-- "삭제된 문서함"의 영구삭제는 문서 자체(approval_documents 행)를 지우면 안 된다 — 문서는
-- 기안자/결재자/참조자 모두에게 공유되는 하나의 보관 기록이라, 한 사용자가 자기 개인 폴더에서
-- 영구삭제한다고 해서 다른 사람의 "내 문서함"/결재 이력에서까지 사라지면 안 된다. 그래서
-- "영구삭제"도 approval_document_hides에 남기되, permanent 플래그를 세워 그 사용자에게만
-- 다시는(복원 포함) 보이지 않게 한다 — 문서 자체는 그대로 보존된다.
ALTER TABLE approval_document_hides ADD COLUMN IF NOT EXISTS permanent BOOLEAN NOT NULL DEFAULT false;
