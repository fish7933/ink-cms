-- approval_documents.created_by가 "ON DELETE SET NULL"과 "NOT NULL"을 동시에 갖고 있어
-- (20260705000006_approval_documents_engine.sql) 모순이었다 — 결재문서를 하나라도 기안한
-- 직원을 삭제하려 하면 항상 "NULL로 비워야 하는데 NOT NULL이라 안 됨" 오류로 막혔다.
-- 20260713000003_user_delete_fk_fixes.sql에서 같은 패턴의 다른 테이블들은 고쳤는데
-- approval_documents는 빠져 있었다. FK는 이미 ON DELETE SET NULL이므로 NOT NULL만 푼다.
ALTER TABLE approval_documents ALTER COLUMN created_by DROP NOT NULL;
