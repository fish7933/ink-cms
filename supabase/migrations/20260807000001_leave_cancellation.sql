-- 이미 승인된 연차/질병휴가 신청을 취소하는 것도 신청과 동일하게 결재를 거치도록 한다.
-- 원본 신청 레코드(shore_leave_requests/sick_leave_requests)는 그대로 두고, 취소용 결재문서를
-- reference_type='shore_leave_cancellation'/'sick_leave_cancellation', reference_id=원본 신청 id로
-- 새로 만들어 승인되면 원본의 status를 'cancelled'로 바꾼다 (approvalDocumentService의
-- applyReferenceSideEffect에서 처리).

ALTER TABLE shore_leave_requests ADD COLUMN IF NOT EXISTS cancellation_document_id UUID REFERENCES approval_documents(id) ON DELETE SET NULL;
ALTER TABLE shore_leave_requests ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE sick_leave_requests ADD COLUMN IF NOT EXISTS cancellation_document_id UUID REFERENCES approval_documents(id) ON DELETE SET NULL;
ALTER TABLE sick_leave_requests ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

INSERT INTO approval_document_types (code, name, is_free_form)
SELECT 'LEAVE_CANCELLATION', '연차 취소 신청', false
WHERE NOT EXISTS (SELECT 1 FROM approval_document_types WHERE code = 'LEAVE_CANCELLATION');

INSERT INTO approval_document_types (code, name, is_free_form)
SELECT 'SICK_LEAVE_CANCELLATION', '질병휴가 취소 신청', false
WHERE NOT EXISTS (SELECT 1 FROM approval_document_types WHERE code = 'SICK_LEAVE_CANCELLATION');
