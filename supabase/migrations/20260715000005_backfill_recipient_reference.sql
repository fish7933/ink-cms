-- 수신부서 기능 추가 이후 만들어진 문서 중, 수신부서가 참조 대상으로는 등록되지 않아
-- 정작 그 부서 소속 인원이 참조함에서 문서를 볼 수 없었던 건들을 바로잡는다.
-- (코드 쪽은 approval-document.service.ts의 createDocument/resubmitDocument에서
-- 수신부서를 참조 대상에도 자동 포함하도록 이미 수정됨 — 이 마이그레이션은 그 전에
-- 이미 만들어진 데이터만 보정)
INSERT INTO approval_document_references (document_id, user_id, org_unit_id)
SELECT d.id, NULL, d.recipient_org_unit_id
FROM approval_documents d
WHERE d.recipient_org_unit_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM approval_document_references r
    WHERE r.document_id = d.id AND r.org_unit_id = d.recipient_org_unit_id
  );
