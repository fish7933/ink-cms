-- 기안서에 실제 결재할 문서(양식) 파일을 첨부할 수 있어야 한다.
-- crew_recommendations.resume_files와 동일한 패턴: JSONB 배열로
-- [{name, path, size, type}] 형태를 저장하고, 'documents' 스토리지 버킷을 그대로 재사용한다.

ALTER TABLE approval_documents
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
