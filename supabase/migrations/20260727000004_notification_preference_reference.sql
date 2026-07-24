-- 수신/참조로 지정된 문서가 최종 승인됐을 때 알림을 받을지 여부. 수신부서 소속 인원도
-- approval_document_references에 함께 저장되므로(수신=참조로 자동 포함) 컬럼은 하나로 묶는다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_approval_reference BOOLEAN NOT NULL DEFAULT true;
