-- rotation_plan(교대계획 승인), dispatch_order(승진/강등 발령 승인)는 각각 rotation.service.ts /
-- dispatch.service.ts가 reference_type을 지정해 자동으로 생성하는 시스템 연동형 문서로, 사용자가
-- 기안서 작성 화면에서 직접 선택해 만드는 자유서식 문서가 아니다. LEAVE_REQUEST/SICK_LEAVE_REQUEST는
-- 이미 is_free_form=false로 등록돼 있었는데 이 둘은 누락되어 있었으므로 바로잡는다.
UPDATE approval_document_types SET is_free_form = false WHERE code IN ('rotation_plan', 'dispatch_order');
