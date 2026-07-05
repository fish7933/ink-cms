-- 고과는 대개 선박에서 작성되어 서류로 내려오는 경우가 많아, 그 원본(고과표)을
-- 여러 장 스캔/첨부할 수 있어야 한다. approval_documents.attachments와 동일한 패턴:
-- JSONB 배열로 [{name, path, size, type}] 형태를 저장하고 'documents' 버킷을 재사용한다.
ALTER TABLE crew_evaluations
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
