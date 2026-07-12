-- 기안서 작성 중 "임시저장"을 지원하기 위해 draft 상태를 추가한다. draft 상태의 문서는
-- 아직 결재라인/단계가 생성되지 않은 미제출 상태이며, 본인 문서함에서만 보이고 이어서
-- 편집하거나 정식 제출할 수 있다.
ALTER TABLE approval_documents DROP CONSTRAINT IF EXISTS approval_documents_status_check;
ALTER TABLE approval_documents ADD CONSTRAINT approval_documents_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]));

-- draft 상태에서는 org_unit_id/created_by 정도만 확정되고 결재라인이 없어도 되므로
-- current_step에 0 등 임시값을 허용해야 하는데, 기존 컬럼이 이미 nullable/기본값 처리라면
-- 별도 변경은 필요 없다 (current_step은 애플리케이션에서 draft일 때 0으로 저장).
