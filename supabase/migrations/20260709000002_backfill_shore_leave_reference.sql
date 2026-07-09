-- 연차 신청 결재문서에 reference_type/reference_id가 누락되어 있던 버그로 인해
-- 이미 승인/반려된 결재문서가 있어도 shore_leave_requests.status가 'pending'에
-- 머물러 있는(=화면에 "결재중"으로 계속 표시되는) 기존 데이터를 정합화한다.

UPDATE approval_documents ad
SET reference_type = 'shore_leave_request',
    reference_id = slr.id
FROM shore_leave_requests slr
WHERE slr.approval_document_id = ad.id
  AND ad.reference_type IS NULL;

UPDATE shore_leave_requests slr
SET status = ad.status,
    updated_at = now()
FROM approval_documents ad
WHERE slr.approval_document_id = ad.id
  AND ad.status IN ('approved', 'rejected')
  AND slr.status = 'pending';
