-- 지출결의서/사직서는 연차·질병휴가 신청, 교대계획, 승진·강등 발령처럼 다른 기능이
-- 자동으로 만들어주는 문서가 아니라 사용자가 기안서 작성 화면에서 직접 선택해서
-- 작성해야 하는 문서인데, 최초 등록 시 is_free_form이 false(시스템 자동 생성 전용
-- 취급)로 잘못 들어가 있어 기안서 작성 화면의 문서유형 목록에 나타나지 않았다.
-- field_schema(구조화 입력폼)가 있다는 것과 "사용자가 직접 고를 수 있는가"는 별개다.
UPDATE approval_document_types SET is_free_form = true WHERE code IN ('expense_report', 'resignation_letter');
